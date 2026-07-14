"""
source_fallback.py — resilient acquisition coordinator: resolves the latest ACS vintage and provides fallbacks.

Data sources:
    - acs_sf_downloader.py — live ACS table downloads
    - data/data-raw/housing-stress/{FILENAME} — optional manual fallback file
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — last-saved rows

Outputs:
    - int — the resolved latest available ACS vintage year
    - tuple — the acquired payload plus fallback flags

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/acquisition/
"""

from collections import namedtuple
from datetime import datetime

from scripts.housing_stress.acquisition.acs_sf_downloader import (
    ACSTableUnavailableError,
    get_acs_table,
)
from scripts.shared.downloads.http_downloads import HTTPDownloadError
from scripts.shared.logging.pipeline_logging import log_message

# Payload kinds an acquisition tier can yield. "iteration_frames" is raw ACS data
# that Phase 3 must build; "contract_rows" is an already-cleaned contract frame
# (from the manual file or last-saved history) that bypasses the build.
ITERATION_FRAMES = "iteration_frames"
CONTRACT_ROWS = "contract_rows"

# The discriminated acquisition result: kind tells Phase 3 whether to build or
# bypass; source_failed / used_manual are the fallback flags surfaced to the run
# record. (used_manual matches run_records' FALLBACK_FLAG_PATTERN when surfaced as
# "source_used_manual".)
AcquisitionResult = namedtuple("AcquisitionResult", ["kind", "data", "source_failed", "used_manual"])


"""
========================================================================================================================
Vintage Resolution
========================================================================================================================
"""


def _probe_base_table(state, year, source_settings, headers, timeout, cache_dir, retry_attempts, logger=None):
    """
    Probe one year's base table, retrying a transient network fault before giving up.

    Returns True when the base table downloads and parses. Returns False when the year is not
    published (a 404-style ACSTableUnavailableError, or a transient HTTPDownloadError that
    persists across retry_attempts — the Census host hangs rather than 404s for some missing
    vintages). A parse error (ValueError) propagates so a malformed release is not mistaken
    for "not yet published". The retry keeps a transient blip on a genuinely-published vintage
    from silently resolving an older year.
    """
    for attempt in range(max(1, retry_attempts)):
        try:
            get_acs_table("b25140", year, source_settings["dataset"], state, source_settings, headers, timeout, cache_dir=cache_dir)
            return True
        except ACSTableUnavailableError:
            log_message(logger, "Vintage not published", year=year)
            return False
        except HTTPDownloadError:
            if attempt == retry_attempts - 1:
                log_message(logger, "Vintage unreachable after retries; treating as not published", year=year)
                return False
            log_message(logger, "Transient fault probing vintage; retrying", year=year, attempt=attempt + 1, of=retry_attempts)
    return False


def resolve_latest_vintage(
    state,
    source_settings,
    headers,
    timeout,
    max_year_lookback,
    excluded_years,
    earliest_year=None,
    cache_dir=None,
    probe_retry_attempts=1,
    logger=None,
):
    """
    Find the newest published ACS 1-year vintage by probing backward from the current year.

    A year is accepted when its base "b25140" table downloads and parses. Years in
    excluded_years are skipped without consuming a probe (so a window straddling 2020 does not
    lose a slot). At most max_year_lookback years are actually probed, and the walk never
    descends below earliest_year, so a late Census release still resolves rather than failing
    Phase 2. Each probe retries a transient network fault probe_retry_attempts times before
    treating it as "not published" (A3), so a blip does not silently resolve an older vintage.
    A parse error (ValueError) still propagates. When a logger is supplied, each probed year is
    logged so a slow resolution shows live progress instead of going quiet.

    Test file: scripts/unit_tests/housing_stress/acquisition/test_source_fallback.py
    """
    start_year = datetime.now().year
    floor_year = earliest_year if earliest_year is not None else start_year - max_year_lookback
    probed_years = []
    year = start_year
    while len(probed_years) < max_year_lookback and year >= floor_year:
        if year in excluded_years:
            year -= 1
            continue
        probed_years.append(year)
        log_message(logger, "Probing ACS vintage", year=year)
        if _probe_base_table(state, year, source_settings, headers, timeout, cache_dir, probe_retry_attempts, logger=logger):
            log_message(logger, "Resolved latest ACS vintage", year=year)
            return year
        year -= 1

    raise ACSTableUnavailableError(f"No ACS 1-year vintage found for {state} within lookback window (probed {probed_years}).")


"""
========================================================================================================================
Fallback Acquisition
========================================================================================================================
"""


def acquire_with_fallback(live_download_fn, manual_fn, saved_rows_fn):
    """
    Try the live download, then a manual contract file, then last-saved rows.

    The three tiers return different payload shapes, so the result is discriminated: the live
    tier yields raw iteration frames (kind=ITERATION_FRAMES) that Phase 3 must build, while
    the manual and last-saved tiers yield already-cleaned contract rows (kind=CONTRACT_ROWS)
    that bypass the build and go straight to the merge. This closes the seam where a fallback
    payload was fed to the builder and crashed with an opaque AttributeError.

    Args:
        live_download_fn: () -> iteration frames (raw ACS). May raise on failure.
        manual_fn: () -> a contract-shaped DataFrame, or None when no usable manual file.
        saved_rows_fn: () -> already-cleaned contract rows from saved history.

    Returns:
        AcquisitionResult(kind, data, source_failed, used_manual).

    Test file: scripts/unit_tests/housing_stress/acquisition/test_source_fallback.py
    """
    try:
        return AcquisitionResult(ITERATION_FRAMES, live_download_fn(), False, False)
    except Exception:
        pass

    manual = manual_fn()
    if manual is not None:
        return AcquisitionResult(CONTRACT_ROWS, manual, False, True)

    return AcquisitionResult(CONTRACT_ROWS, saved_rows_fn(), True, False)
