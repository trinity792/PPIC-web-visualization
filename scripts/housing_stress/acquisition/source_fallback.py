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

from datetime import datetime

import pandas as pd

from scripts.housing_stress.acquisition.acs_sf_downloader import (
    ACSTableUnavailableError,
    get_acs_table,
)
from scripts.shared.downloads.http_downloads import HTTPDownloadError

"""
========================================================================================================================
Vintage Resolution
========================================================================================================================
"""


def resolve_latest_vintage(state, source_settings, headers, timeout, max_year_lookback, excluded_years):
    """
    Find the newest published ACS 1-year vintage by probing backward from the current year.

    A year is accepted when its base "b25140" table downloads and parses. Years in
    excluded_years are skipped without a probe. A not-yet-published vintage advances to the
    previous year: the Census server returns a 404 for some missing files but simply hangs
    for others, so both ACSTableUnavailableError and a transient HTTPDownloadError (timeout /
    connection failure) advance. A parse error (ValueError) still propagates, so a malformed
    release is not mistaken for "not yet published".

    Test file: scripts/unit_tests/housing_stress/acquisition/test_source_fallback.py
    """
    start_year = datetime.now().year
    probed_years = []
    for offset in range(max_year_lookback):
        year = start_year - offset
        if year in excluded_years:
            continue
        probed_years.append(year)
        try:
            get_acs_table("b25140", year, source_settings["dataset"], state, source_settings, headers, timeout)
        except (ACSTableUnavailableError, HTTPDownloadError):
            continue
        return year

    raise ACSTableUnavailableError(f"No ACS 1-year vintage found for {state} within lookback window (probed {probed_years}).")


"""
========================================================================================================================
Fallback Acquisition
========================================================================================================================
"""


def acquire_with_fallback(live_download_fn, manual_path, saved_rows_fn):
    """
    Try the live download, then a manual raw file, then last-saved rows.

    Returns:
        tuple of (raw, source_failed, used_manual):
            raw — the acquired payload (live iteration frames, manual rows, or saved rows)
            source_failed — True if live and manual both failed (fell back to saved rows)
            used_manual — True if the manual file was used

    Test file: scripts/unit_tests/housing_stress/acquisition/test_source_fallback.py
    """
    try:
        return live_download_fn(), False, False
    except Exception:
        pass

    if manual_path.exists():
        try:
            return pd.read_csv(manual_path), False, True
        except Exception:
            pass

    return saved_rows_fn(), True, False
