"""
dof_historical_downloader.py — discovers and downloads historical DoF E-8 workbooks.

Data sources:
    - California Department of Finance estimates page — E-8 historical report links
    - California Department of Finance E-8 report pages — "Organized by Geography" workbooks

Outputs:
    - {download_dir}/{WORKBOOK_FILENAME}.xlsx — downloaded historical E-8 workbooks
    - list[pathlib.Path] — paths of the workbooks that were downloaded

Usage:
    python scripts/pophousing/acquisition/dof_historical_downloader.py

Test Folders:
    - scripts/unit_tests/pophousing/acquisition/
"""

import re
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

from bs4 import BeautifulSoup

from scripts.shared.downloads.http_downloads import (
    HTTPDownloadError,
    download_file,
    fetch_response,
)

# ── Constants ─────────────────────────────────────────────────────────────────

E8_HISTORICAL_HEADER_PATTERN = r"E-8 Historical Population and Housing Estimates"
E8_GEOGRAPHY_LINK_PATTERN = r"Organized by Geography"


class E8DiscoveryError(RuntimeError):
    """Report an error while locating a historical E-8 workbook. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_historical_downloader.py"""

    pass


"""
========================================================================================================================
Historical Workbook Discovery
========================================================================================================================
"""


def get_historical_landing_page_urls(base_url, header_pattern=E8_HISTORICAL_HEADER_PATTERN, headers=None, timeout=60):
    """Return the E-8 historical landing-page URLs listed under the report heading. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_historical_downloader.py"""
    try:
        response = fetch_response(base_url, headers or {}, timeout)
    except HTTPDownloadError as error:
        raise E8DiscoveryError(f"Could not retrieve E-8 estimates page: {error}") from error

    soup = BeautifulSoup(response.content, "html.parser")
    header_text = soup.find(string=re.compile(header_pattern, re.IGNORECASE))
    if header_text is None:
        raise E8DiscoveryError(
            f"Could not find the E-8 historical heading matching {header_pattern!r}"
        )

    link_container = header_text.find_next(["ul", "p"])
    if link_container is None:
        raise E8DiscoveryError(
            "Could not find the E-8 historical link container after the report heading"
        )

    landing_page_urls = [
        urljoin(base_url, link["href"])
        for link in link_container.find_all("a", href=True)
    ]
    if not landing_page_urls:
        raise E8DiscoveryError("E-8 historical link container holds no links")
    return landing_page_urls


def find_geography_workbook_url(page_url, link_pattern=E8_GEOGRAPHY_LINK_PATTERN, headers=None, timeout=60):
    """Return the 'Organized by Geography' workbook URL on a landing page, or None. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_historical_downloader.py"""
    try:
        response = fetch_response(page_url, headers or {}, timeout)
    except HTTPDownloadError as error:
        raise E8DiscoveryError(f"Could not retrieve E-8 landing page {page_url}: {error}") from error

    soup = BeautifulSoup(response.content, "html.parser")
    workbook_link = soup.find("a", href=True, string=re.compile(link_pattern, re.IGNORECASE))
    if workbook_link is None:
        return None
    return urljoin(page_url, workbook_link["href"])


"""
========================================================================================================================
Historical Workbook Retrieval
========================================================================================================================
"""


def download_historical_e8_files(download_dir, source_settings):
    """Discover and download every E-8 historical geography workbook. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_historical_downloader.py"""
    base_url = source_settings["base_url"]
    headers = source_settings.get("requests_headers", {})
    timeout = source_settings.get("request_timeout_seconds", 60)
    header_pattern = source_settings.get(
        "e8_header_pattern", E8_HISTORICAL_HEADER_PATTERN
    )

    download_dir = Path(download_dir)
    landing_page_urls = get_historical_landing_page_urls(
        base_url, header_pattern, headers, timeout
    )

    downloaded_paths = []
    for page_url in landing_page_urls:
        workbook_url = find_geography_workbook_url(
            page_url, headers=headers, timeout=timeout
        )
        if workbook_url is None:
            continue
        filename = Path(unquote(urlparse(workbook_url).path)).name
        destination_path = download_dir / filename
        try:
            download_file(workbook_url, destination_path, headers, timeout)
        except HTTPDownloadError:
            # A single broken report link should not abort the other downloads.
            continue
        downloaded_paths.append(destination_path)
    return downloaded_paths
