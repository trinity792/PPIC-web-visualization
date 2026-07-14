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
import time
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd

from scripts.shared.downloads.http_downloads import HTTPDownloadError, fetch_response
from scripts.shared.logging.pipeline_logging import log_message

"""
========================================================================================================================
Acquisition Errors
========================================================================================================================
"""


class ACSTableUnavailableError(RuntimeError):
    """Raised when a requested (year, table id) is not published (HTTP 404 / missing file), as distinct from a parse failure. Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py"""


def _is_missing_file_error(error):
    """
    Return True when an HTTP failure indicates a missing file rather than a transient fault.

    Prefers the structured status code carried by HTTPDownloadError (error.status_code
    == 404); falls back to a message substring only when the status code is absent (a
    timeout / connection fault carries no status and is therefore treated as transient).
    """
    status_code = getattr(error, "status_code", None)
    if status_code is not None:
        return status_code == 404
    message = str(error)
    return "404" in message or "Not Found" in message


def _read_pipe_delimited(content):
    """Parse pipe-delimited ACS Summary File bytes into a GEO_ID-indexed frame."""
    return pd.read_csv(io.BytesIO(content), sep="|", index_col="GEO_ID")


def _fetch_content(url, headers, timeout, cache_dir, cache_max_age_days):
    """
    Fetch a URL's bytes, honoring an on-disk cache when cache_dir is supplied.

    When a cached copy of the file (keyed by its URL basename) exists and is younger than
    cache_max_age_days, it is returned without a network request; otherwise the file is
    fetched and written to the cache. National ACS .dat/Geos files are large and stable
    within a vintage, so this removes the redundant re-downloads across a run and across runs.
    """
    cached_path = None
    if cache_dir is not None:
        cached_path = Path(cache_dir) / Path(urlparse(url).path).name
        if cached_path.exists():
            age_days = (time.time() - cached_path.stat().st_mtime) / 86400
            if cache_max_age_days is None or age_days <= cache_max_age_days:
                return cached_path.read_bytes()

    content = fetch_response(url, headers, timeout).content

    if cached_path is not None:
        cached_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = cached_path.with_name(f"{cached_path.name}.part")
        temporary_path.write_bytes(content)
        temporary_path.replace(cached_path)

    return content


"""
========================================================================================================================
Single-Table Download
========================================================================================================================
"""


def download_national_table(tblid, year, dataset, source_settings, headers, timeout, cache_dir=None):
    """
    Download one B25140 iteration's national .dat, join it to geography, and return ALL rows.

    The ACS .dat file is national (every geography for the table). Callers filter it to the
    geographies they need — one state, the 50 states, or California's PUMAs — so the file is
    downloaded once per table rather than once per state. When cache_dir is supplied, the
    .dat/Geos files are read from (and written to) an on-disk cache honoring
    source_settings["cache_max_age_days"], so they are not re-fetched within or across runs.

    Raises ACSTableUnavailableError on a 404/missing file so the caller can step to an earlier
    year; raises ValueError on a file that downloads but is malformed or missing expected
    geography columns, so a real defect is not mistaken for "not published".

    Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """
    data_url = source_settings["data_url_pattern"].format(year=year, tblid=tblid)
    geo_url = source_settings["geo_url_pattern"].format(year=year, tblid=tblid)
    cache_max_age_days = source_settings.get("cache_max_age_days")

    try:
        data_content = _fetch_content(data_url, headers, timeout, cache_dir, cache_max_age_days)
        geo_content = _fetch_content(geo_url, headers, timeout, cache_dir, cache_max_age_days)
    except HTTPDownloadError as error:
        if _is_missing_file_error(error):
            raise ACSTableUnavailableError(f"ACS table {tblid} unavailable for {year}: {error}") from error
        raise

    data = _read_pipe_delimited(data_content)
    geos = _read_pipe_delimited(geo_content)

    required_geo_columns = [column for column in source_settings["expected_geo_columns"] if column != "GEO_ID"]
    missing_geo_columns = [column for column in required_geo_columns if column not in geos.columns]
    if missing_geo_columns:
        raise ValueError(f"ACS geography file for {tblid} {year} is missing columns: {missing_geo_columns}")

    return data.join(geos[required_geo_columns])


def get_acs_table(tblid, year, dataset, state, source_settings, headers, timeout, cache_dir=None):
    """
    Download one B25140 iteration and return it joined to geography and filtered to one state.

    Thin wrapper over download_national_table (which does the download + join) that keeps only
    rows for the requested state.

    Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """
    national = download_national_table(tblid, year, dataset, source_settings, headers, timeout, cache_dir=cache_dir)
    return national.loc[national["STUSAB"] == state]


"""
========================================================================================================================
Full-Vintage Download
========================================================================================================================
"""


def download_all_national_tables(year, source_settings, headers, timeout, cache_dir=None, logger=None):
    """
    Download all 9 B25140 race iterations' NATIONAL tables once for one year.

    This is the single-fetch entry point: each iteration's national .dat is downloaded exactly
    once (through the on-disk cache), and callers slice the state-summary rows and the
    California PUMA rows from the same frames — instead of a separate download pass per scope.
    A missing non-base iteration (small-population suppression) is recorded and skipped; a
    missing base "b25140" table raises ACSTableUnavailableError. When a logger is supplied,
    each table is logged before it is fetched so a slow cold download shows live progress.

    Returns:
        tuple of (frames, missing_iterations):
            frames — dict {raw_race_label: national DataFrame} for each available iteration
            missing_iterations — list of raw race labels that were suppressed/absent

    Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """
    base_table_id = source_settings["base_table_id"]
    dataset = source_settings["dataset"]
    iterations = source_settings["table_iterations"]
    total = len(iterations)
    frames = {}
    missing_iterations = []
    for index, (tblid, raw_label) in enumerate(iterations.items(), start=1):
        log_message(logger, "Fetching national table", tblid=tblid, progress=f"{index}/{total}", year=year)
        try:
            frames[raw_label] = download_national_table(tblid, year, dataset, source_settings, headers, timeout, cache_dir=cache_dir)
        except ACSTableUnavailableError:
            if tblid == base_table_id:
                raise
            missing_iterations.append(raw_label)
    return frames, missing_iterations


def download_all_iterations(year, dataset, state, source_settings, headers, timeout, cache_dir=None):
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
    base_table_id = source_settings["base_table_id"]
    frames = {}
    missing_iterations = []
    for tblid, raw_label in source_settings["table_iterations"].items():
        try:
            frames[raw_label] = get_acs_table(tblid, year, dataset, state, source_settings, headers, timeout, cache_dir=cache_dir)
        except ACSTableUnavailableError:
            if tblid == base_table_id:
                raise
            missing_iterations.append(raw_label)
    return frames, missing_iterations
