"""
acs_sf_downloader.py — downloads ACS 1-year table-based Summary File B25140 tables and joins geography.

Data sources:
    - ACS Summary File data .dat (pipe-delimited, keyed by GEO_ID) per (year, table id)
    - ACS Summary File Geos{year}1YR.txt geography lookup (NAME, STUSAB, keyed by GEO_ID)

Outputs:
    - pandas.DataFrame — one raw table iteration joined to NAME/STUSAB, filtered to a state
    - dict of iteration frames plus the list of suppressed iterations for a whole vintage

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/acquisition/
"""

import io

import pandas as pd

from scripts.shared.downloads.http_downloads import HTTPDownloadError, fetch_response

"""
========================================================================================================================
Acquisition Errors
========================================================================================================================
"""


class ACSTableUnavailableError(RuntimeError):
    """Raised when a requested (year, table id) is not published (HTTP 404 / missing file), as distinct from a parse failure. Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py"""


def _is_missing_file_error(error):
    """Return True when an HTTP failure indicates a missing file rather than a transient fault."""
    message = str(error)
    return "404" in message or "Not Found" in message


def _read_pipe_delimited(content):
    """Parse pipe-delimited ACS Summary File bytes into a GEO_ID-indexed frame."""
    return pd.read_csv(io.BytesIO(content), sep="|", index_col="GEO_ID")


"""
========================================================================================================================
Single-Table Download
========================================================================================================================
"""


def download_national_table(tblid, year, dataset, source_settings, headers, timeout):
    """
    Download one B25140 iteration's national .dat, join it to geography, and return ALL rows.

    The ACS .dat file is national (every geography for the table). Callers filter it to the
    geographies they need — one state, the 50 states, or California's PUMAs — so the file is
    downloaded once per table rather than once per state.

    Raises ACSTableUnavailableError on a 404/missing file so the caller can step to an earlier
    year; raises ValueError on a file that downloads but is malformed or missing expected
    geography columns, so a real defect is not mistaken for "not published".

    Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """
    data_url = source_settings["data_url_pattern"].format(year=year, tblid=tblid)
    geo_url = source_settings["geo_url_pattern"].format(year=year, tblid=tblid)

    try:
        data_response = fetch_response(data_url, headers, timeout)
        geo_response = fetch_response(geo_url, headers, timeout)
    except HTTPDownloadError as error:
        if _is_missing_file_error(error):
            raise ACSTableUnavailableError(f"ACS table {tblid} unavailable for {year}: {error}") from error
        raise

    data = _read_pipe_delimited(data_response.content)
    geos = _read_pipe_delimited(geo_response.content)

    required_geo_columns = [column for column in source_settings["expected_geo_columns"] if column != "GEO_ID"]
    missing_geo_columns = [column for column in required_geo_columns if column not in geos.columns]
    if missing_geo_columns:
        raise ValueError(f"ACS geography file for {tblid} {year} is missing columns: {missing_geo_columns}")

    return data.join(geos[required_geo_columns])


def get_acs_table(tblid, year, dataset, state, source_settings, headers, timeout):
    """
    Download one B25140 iteration and return it joined to geography and filtered to one state.

    Thin wrapper over download_national_table (which does the download + join) that keeps only
    rows for the requested state.

    Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """
    national = download_national_table(tblid, year, dataset, source_settings, headers, timeout)
    return national.loc[national["STUSAB"] == state]


"""
========================================================================================================================
Full-Vintage Download
========================================================================================================================
"""


def download_all_iterations(year, dataset, state, source_settings, headers, timeout):
    """
    Download all 9 B25140 race iterations for one (year, state).

    A missing non-base iteration (small-population suppression) is recorded and skipped;
    a missing base "b25140" table raises ACSTableUnavailableError.

    Returns:
        tuple of (frames, missing_iterations):
            frames — dict {raw_race_label: DataFrame} for each available iteration
            missing_iterations — list of raw race labels that were suppressed/absent

    Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """
    frames = {}
    missing_iterations = []
    for index, (tblid, raw_label) in enumerate(source_settings["table_iterations"].items()):
        is_base_table = index == 0
        try:
            frames[raw_label] = get_acs_table(tblid, year, dataset, state, source_settings, headers, timeout)
        except ACSTableUnavailableError:
            if is_base_table:
                raise
            missing_iterations.append(raw_label)
    return frames, missing_iterations
