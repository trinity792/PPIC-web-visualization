"""
census_bps_downloader.py — downloads Census BPS monthly CBSA and state .xls files.

Data sources:
    - Census BPS cbsamonthly_{yyyymm}.xls (permits by Core-Based Statistical Area)
    - Census BPS statemonthly_{yyyymm}.xls (permits by state)

Outputs:
    - pandas.DataFrame — one raw monthly spreadsheet, unmodified beyond parsing

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/acquisition/
"""

from io import BytesIO

import pandas as pd

from scripts.shared.downloads.http_downloads import HTTPDownloadError, fetch_response

"""
========================================================================================================================
Acquisition Errors
========================================================================================================================
"""


class BPSMonthUnavailableError(RuntimeError):
    """Raised when a requested month's file is not published (HTTP 404 / missing file). Distinct from a parse failure. Test file: scripts/unit_tests/building_permits/acquisition/test_census_bps_downloader.py"""


def _is_missing_file_error(error):
    """Return True when an HTTP failure indicates a missing file rather than a transient fault.

    Prefers the structured status code carried by HTTPDownloadError (error.status_code == 404)
    so a "not published" month is distinguished from a transient network fault by the actual
    HTTP status rather than by sniffing the message text. Falls back to a message match only
    when no status code is present (e.g. a hand-built error in a test).
    """
    status_code = getattr(error, "status_code", None)
    if status_code is not None:
        return status_code == 404
    message = str(error)
    return "404" in message or "Not Found" in message


def _download_month(url_pattern_key, year, month, source_settings, headers, timeout):
    """Download and parse one monthly spreadsheet, translating a 404 into BPSMonthUnavailableError."""
    yyyymm = f"{year}{month:02d}"
    url = source_settings[url_pattern_key].format(yyyymm=yyyymm)

    try:
        response = fetch_response(url, headers, timeout)
    except HTTPDownloadError as error:
        if _is_missing_file_error(error):
            raise BPSMonthUnavailableError(f"BPS file unavailable for {yyyymm}: {error}") from error
        raise

    # A file that downloads but fails to parse raises ValueError (from read_excel),
    # so a real defect is never mistaken for "not yet published".
    return pd.read_excel(BytesIO(response.content))


"""
========================================================================================================================
Monthly Downloads
========================================================================================================================
"""


def download_cbsa_month(year, month, source_settings, headers, timeout):
    """
    Download one month's CBSA permits spreadsheet.

    Test file: scripts/unit_tests/building_permits/acquisition/test_census_bps_downloader.py
    """
    return _download_month("cbsa_url_pattern", year, month, source_settings, headers, timeout)


def download_state_month(year, month, source_settings, headers, timeout):
    """
    Download one month's state permits spreadsheet. Mirrors download_cbsa_month.

    Test file: scripts/unit_tests/building_permits/acquisition/test_census_bps_downloader.py
    """
    return _download_month("state_url_pattern", year, month, source_settings, headers, timeout)
