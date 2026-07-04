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


def resolve_latest_month(source_settings, headers, timeout, max_month_lookback):
    """
    Find the newest published BPS month by probing backward from the current month.

    Starts at the current calendar month and steps back up to max_month_lookback
    times, accepting the first month whose CBSA and state files both download and
    parse. Only a BPSMonthUnavailableError advances the probe; a parse failure
    (ValueError) propagates so a malformed release is not mistaken for "not yet
    published".

    Test file: scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """
    now = datetime.now()
    year, month = now.year, now.month
    probed = []
    for _ in range(max_month_lookback):
        probed.append((year, month))
        try:
            download_cbsa_month(year, month, source_settings, headers, timeout)
            download_state_month(year, month, source_settings, headers, timeout)
        except BPSMonthUnavailableError:
            year, month = _previous_month(year, month)
            continue
        return year, month

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


def acquire_months(months, download_cbsa_fn, download_state_fn, saved_rows_fn):
    """
    Download all requested months' CBSA and state frames, with a last-saved fallback.

    Returns:
        tuple (cbsa_frames, state_frames, source_failed).

    Test file: scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """
    if not months:
        return {}, {}, False

    cbsa_frames = {}
    state_frames = {}
    skipped = []
    for year, month in months:
        key = f"{year}-{month:02d}"
        try:
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
        print(f"  [acquire_months] skipped {len(skipped)} unpublished month(s): {skipped[0]}..{skipped[-1]}")

    return cbsa_frames, state_frames, False
