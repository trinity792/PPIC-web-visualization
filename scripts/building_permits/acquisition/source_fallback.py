"""
source_fallback.py — resilient acquisition coordinator: resolves the month window and provides fallbacks.

Data sources:
    - census_bps_downloader.py — live BPS downloads
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — last-saved rows

Outputs:
    - list of (year, month) — the months to acquire
    - dict of raw monthly frames
    - bool flag — whether acquisition failed and fell back to last-saved data

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/acquisition/
"""

from datetime import datetime

import pandas as pd  # noqa: F401  (kept for parity with the module's documented I/O)

from scripts.building_permits.acquisition.census_bps_downloader import (
    BPSMonthUnavailableError,
    download_cbsa_month,
    download_state_month,
)
from scripts.shared.downloads.http_downloads import HTTPDownloadError
from scripts.shared.logging.pipeline_logging import log_message

"""
========================================================================================================================
Month Arithmetic
========================================================================================================================
"""


def _month_index(year, month):
    """Return a zero-based absolute month index for (year, month)."""
    return year * 12 + (month - 1)


def _from_month_index(index):
    """Invert _month_index back into a (year, month) tuple."""
    return index // 12, index % 12 + 1


def _previous_month(year, month):
    """Return the calendar month before (year, month), crossing year boundaries."""
    return _from_month_index(_month_index(year, month) - 1)


"""
========================================================================================================================
Month Resolution
========================================================================================================================
"""


def _probe_month(year, month, source_settings, headers, timeout, retry_attempts, logger=None):
    """
    Download one month's CBSA and state files, retrying a transient fault before giving up.

    Returns (cbsa_df, state_df) on success. A BPSMonthUnavailableError (a genuine 404 /
    "not published") propagates immediately so the caller can advance the probe. A
    transient HTTPDownloadError (timeout / connection / 5xx, status_code != 404) is
    retried up to retry_attempts times, then re-raised — a single network blip on the
    latest-month probe no longer aborts Phase 2, but a real outage still fails loud
    (guide A4). A parse ValueError is not caught here, so a malformed release fails
    loud immediately rather than being retried.
    """
    attempts = max(1, retry_attempts)
    for attempt in range(attempts):
        try:
            cbsa = download_cbsa_month(year, month, source_settings, headers, timeout)
            state = download_state_month(year, month, source_settings, headers, timeout)
            return cbsa, state
        except BPSMonthUnavailableError:
            raise
        except HTTPDownloadError:
            if attempt == attempts - 1:
                raise
            log_message(
                logger,
                "Transient fault probing latest BPS month; retrying",
                month=f"{year}-{month:02d}",
                attempt=attempt + 1,
                of=attempts,
            )


def resolve_latest_month(
    source_settings,
    headers,
    timeout,
    max_month_lookback,
    probe_retry_attempts=2,
    logger=None,
):
    """
    Find the newest published BPS month by probing backward from the current month.

    Starts at the current calendar month and steps back up to max_month_lookback
    times, accepting the first month whose CBSA and state files both download and
    parse. Only a BPSMonthUnavailableError advances the probe; each probe retries a
    transient network fault probe_retry_attempts times before failing loud, and a parse
    failure (ValueError) propagates so a malformed release is not mistaken for "not yet
    published".

    Returns:
        tuple (year, month, prefetched) — prefetched maps the resolved "YYYY-MM" to its
        already-downloaded (cbsa_df, state_df), so acquire_months does not re-fetch the
        month the probe just downloaded (guide B3).

    Test file: scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """
    now = datetime.now()
    year, month = now.year, now.month
    probed = []
    for _ in range(max_month_lookback):
        probed.append((year, month))
        try:
            cbsa, state = _probe_month(year, month, source_settings, headers, timeout, probe_retry_attempts, logger)
        except BPSMonthUnavailableError:
            year, month = _previous_month(year, month)
            continue
        return year, month, {f"{year}-{month:02d}": (cbsa, state)}

    raise BPSMonthUnavailableError(f"No published BPS month found within lookback window (probed {probed}).")


def months_to_acquire(last_stored_month, latest_available_month, excluded_months=None):
    """
    Enumerate the months strictly after last_stored_month through latest_available_month.

    Test file: scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """
    latest_index = _month_index(*latest_available_month)
    if last_stored_month is None:
        # No stored history: fetch only the latest published month.
        start_index = latest_index
    else:
        stored_year, stored_month = (int(part) for part in last_stored_month.split("-"))
        start_index = _month_index(stored_year, stored_month) + 1

    excluded = set(excluded_months or ())
    months = []
    for index in range(start_index, latest_index + 1):
        year, month = _from_month_index(index)
        if f"{year}-{month:02d}" in excluded:
            continue
        months.append((year, month))
    return months


"""
========================================================================================================================
Fallback Acquisition
========================================================================================================================
"""


def acquire_months(months, download_cbsa_fn, download_state_fn, saved_rows_fn, prefetched=None, logger=None):
    """
    Download all requested months' CBSA and state frames, with a last-saved fallback.

    Any month already present in prefetched (the frames the latest-month probe downloaded)
    is reused instead of being fetched a second time (guide B3). Unpublished months are
    skipped and the notice is routed through the logger rather than stdout (guide A6);
    any other download error falls back to the last-saved rows and flags source_failed —
    the clean-degrade path that keeps a live outage from crashing the build (guide B4).

    Returns:
        tuple (cbsa_frames, state_frames, source_failed).

    Test file: scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """
    if not months:
        return {}, {}, False

    prefetched = prefetched or {}
    cbsa_frames = {}
    state_frames = {}
    skipped = []
    for year, month in months:
        key = f"{year}-{month:02d}"
        try:
            if key in prefetched:
                cbsa, state = prefetched[key]
            else:
                cbsa = download_cbsa_fn(year, month)
                state = download_state_fn(year, month)
        except BPSMonthUnavailableError:
            # Not published at the source (e.g. beyond the hosted rolling window of
            # monthly files); skip the month with a log rather than aborting.
            skipped.append(key)
            continue
        except Exception:
            saved = saved_rows_fn()
            return saved, saved, True
        cbsa_frames[key] = cbsa
        state_frames[key] = state

    if skipped:
        log_message(
            logger,
            "Skipped unpublished BPS month(s)",
            count=len(skipped),
            first=skipped[0],
            last=skipped[-1],
        )

    return cbsa_frames, state_frames, False
