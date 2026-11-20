"""
zillow_downloader.py — downloads the 12 Zillow affordability files from their fixed links and reads the release date.

Data sources:
    - https://files.zillowstatic.com/research/public_csvs/ — Zillow Research public CSV links (see config/sources.py)

Outputs:
    - data/data-raw/zillow-affordability/<Zillow filename>.csv — one raw file per series
    - dict — {"files": {series key: Path}, "release_date": "YYYY-MM-DD"}

Usage:
    from scripts.zillow_affordability.acquisition.zillow_downloader import download_all_series

Test Folders:
    - scripts/unit_tests/zillow_affordability/acquisition/
"""

from email.utils import parsedate_to_datetime
from pathlib import Path

from scripts.shared.downloads.http_downloads import HTTPDownloadError, fetch_response

"""
========================================================================================================================
Errors
========================================================================================================================
"""


class ZillowLinkNotFoundError(RuntimeError):
    """A fixed Zillow link returned 404, meaning the file was renamed or moved. Test file: scripts/unit_tests/zillow_affordability/acquisition/test_zillow_downloader.py"""


"""
========================================================================================================================
Helpers
========================================================================================================================
"""


def parse_release_date(last_modified):
    """Convert an HTTP Last-Modified header into a YYYY-MM-DD date string, raising ValueError when absent or unreadable. Test file: scripts/unit_tests/zillow_affordability/acquisition/test_zillow_downloader.py"""
    if not last_modified:
        raise ValueError("Zillow response has no Last-Modified header; cannot date the release")
    try:
        return parsedate_to_datetime(last_modified).date().isoformat()
    except (TypeError, ValueError) as error:
        raise ValueError(f"Unreadable Last-Modified header: {last_modified!r}") from error


def _write_atomically(content, destination_path):
    """Write bytes via a sibling .part file so a failed write never leaves a half file in place."""
    temporary_path = destination_path.with_name(f"{destination_path.name}.part")
    try:
        temporary_path.write_bytes(content)
        temporary_path.replace(destination_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


"""
========================================================================================================================
Download
========================================================================================================================
"""


def download_all_series(source_config, download_directory):
    """
    Fetch every configured Zillow series and save it under its Zillow filename.

    The fetch goes through the shared fetch_response() (rather than download_file()) because
    the response's Last-Modified header is what dates the release.

    Args:
        source_config: get_source_config() output
        download_directory: folder the raw files are written into

    Returns:
        {"files": {series key: Path}, "release_date": newest Last-Modified date across the files}

    Raises:
        ZillowLinkNotFoundError: a link returned 404 (the series name is in the message)
        HTTPDownloadError: any other network or HTTP failure

    Test file:
        scripts/unit_tests/zillow_affordability/acquisition/test_zillow_downloader.py
    """
    download_directory = Path(download_directory)
    download_directory.mkdir(parents=True, exist_ok=True)
    files = {}
    release_dates = []
    for series in source_config["series"]:
        try:
            response = fetch_response(series["url"], source_config["headers"], source_config["timeout_seconds"])
        except HTTPDownloadError as error:
            if error.status_code == 404:
                raise ZillowLinkNotFoundError(
                    f"Zillow link not found (404) for series {series['key']}: {series['url']}. Zillow may have renamed the file; a developer should check the Housing Data page and update scripts/zillow_affordability/config/sources.py."
                ) from error
            raise
        destination_path = download_directory / series["filename"]
        _write_atomically(response.content, destination_path)
        files[series["key"]] = destination_path
        release_dates.append(parse_release_date(response.headers.get("Last-Modified")))
    return {"files": files, "release_date": max(release_dates)}
