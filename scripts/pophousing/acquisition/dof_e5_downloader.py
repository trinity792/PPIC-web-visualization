"""
dof_e5_downloader.py — discovers, downloads, caches, and reads the latest DoF E-5 workbook.

Data sources:
    - California Department of Finance estimates page — identifies the latest E-5 report page
    - California Department of Finance E-5 report page — links to the current E-5 workbook
    - {download_directory}/E-5-{YEAR}_Geo_InternetVersion.xlsx — cached or fallback workbook

Outputs:
    - {download_directory}/E-5-{YEAR}_Geo_InternetVersion.xlsx — downloaded workbook cache
    - pandas.DataFrame — second worksheet from the selected E-5 workbook

Usage:
    python scripts/pophousing/acquisition/dof_e5_downloader.py

Test Folders:
    - scripts/unit_tests/pophousing/acquisition/
"""

import re
import time
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
from zipfile import BadZipFile

import pandas as pd
from bs4 import BeautifulSoup

from scripts.shared.downloads.http_downloads import HTTPDownloadError, download_file, fetch_response

# ── Constants ─────────────────────────────────────────────────────────────────

E5_FILENAME_PATTERN = r"E-5-\d{4}_Geo_InternetVersion\.xlsx"


class E5DiscoveryError(RuntimeError):
    """Report an error while locating an E-5 workbook. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_e5_downloader.py"""

    pass


"""
========================================================================================================================
Workbook Discovery
========================================================================================================================
"""


def get_e5_file_url(source_settings):
    """Locate the current E-5 workbook URL. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_e5_downloader.py"""
    base_url = source_settings["base_url"]
    headers = source_settings.get("requests_headers", {})
    timeout = source_settings.get("request_timeout_seconds", 60)
    header_pattern = source_settings.get("e5_header_pattern", r"E-5 Population and Housing Estimates")
    landing_page_pattern = source_settings.get("e5_landing_page_pattern", r"20\d{2}\s*(?:-|\u2013)\s*20\d{2}")
    workbook_pattern = source_settings.get("e5_workbook_link_pattern", E5_FILENAME_PATTERN)

    try:
        estimates_response = fetch_response(base_url, headers, timeout)
        estimates_soup = BeautifulSoup(estimates_response.content, "html.parser")
        header_text = estimates_soup.find(string=re.compile(header_pattern, re.IGNORECASE))
        if header_text is None:
            raise E5DiscoveryError(f"Could not find the E-5 report heading matching {header_pattern!r}")

        link_container = header_text.find_next(["ul", "p"])
        if link_container is None:
            raise E5DiscoveryError("Could not find the E-5 report link container after the report heading")

        landing_page_url = None
        for link in link_container.find_all("a", href=True):
            href = link["href"]
            link_text = link.get_text(" ", strip=True)
            candidate_url = urljoin(base_url, href)
            if re.search(workbook_pattern, href, re.IGNORECASE):
                return candidate_url
            if re.search(landing_page_pattern, link_text):
                landing_page_url = candidate_url
                break

        if landing_page_url is None:
            raise E5DiscoveryError(
                f"Could not find an E-5 landing-page link matching {landing_page_pattern!r}"
            )

        landing_response = fetch_response(landing_page_url, headers, timeout)
        landing_soup = BeautifulSoup(landing_response.content, "html.parser")
        for link in landing_soup.find_all("a", href=True):
            if re.search(workbook_pattern, link["href"], re.IGNORECASE):
                return urljoin(landing_page_url, link["href"])
    except HTTPDownloadError as error:
        raise E5DiscoveryError(f"Could not retrieve E-5 source pages: {error}") from error

    raise E5DiscoveryError(f"Could not find an E-5 workbook link matching {workbook_pattern!r}")


def get_e5_filename_from_url(url, filename_pattern=E5_FILENAME_PATTERN):
    """Extract and validate an E-5 filename from a URL. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_e5_downloader.py"""
    filename = Path(unquote(urlparse(url).path)).name
    if not re.fullmatch(filename_pattern, filename, re.IGNORECASE):
        raise ValueError(f"URL does not contain a valid E-5 filename: {url}")
    return filename


"""
========================================================================================================================
Workbook Retrieval
========================================================================================================================
"""


def download_e5_data(url, download_directory, cache_max_age_days, headers=None, timeout=60):
    """Return E-5 data from a fresh cache or downloaded workbook. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_e5_downloader.py"""
    if cache_max_age_days < 0:
        raise ValueError("cache_max_age_days must be non-negative")

    download_directory = Path(download_directory)
    if download_directory.exists() and not download_directory.is_dir():
        raise NotADirectoryError(download_directory)

    filename = get_e5_filename_from_url(url)
    workbook_path = download_directory / filename
    if workbook_path.is_file():
        age_days = max(0, (time.time() - workbook_path.stat().st_mtime) / 86_400)
        if age_days <= cache_max_age_days:
            try:
                return _read_e5_workbook(workbook_path)
            except (BadZipFile, OSError, ValueError):
                pass

    download_file(url, workbook_path, headers or {}, timeout)
    return _read_e5_workbook(workbook_path)


def get_most_recent_e5_file(download_directory, filename_pattern, fallback_max_age_days):
    """Read the newest valid fallback E-5 workbook within the age limit. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_e5_downloader.py"""
    if fallback_max_age_days < 0:
        raise ValueError("fallback_max_age_days must be non-negative")

    download_directory = Path(download_directory)
    if not download_directory.exists():
        return None
    if not download_directory.is_dir():
        raise NotADirectoryError(download_directory)

    candidate_paths = sorted(
        (
            file_path
            for file_path in download_directory.iterdir()
            if file_path.is_file() and re.fullmatch(filename_pattern, file_path.name, re.IGNORECASE)
        ),
        key=lambda file_path: file_path.stat().st_mtime,
        reverse=True,
    )
    current_timestamp = time.time()
    for workbook_path in candidate_paths:
        age_days = max(0, (current_timestamp - workbook_path.stat().st_mtime) / 86_400)
        if age_days > fallback_max_age_days:
            continue
        try:
            return _read_e5_workbook(workbook_path)
        except (BadZipFile, OSError, ValueError):
            continue

    return None


# ── Workbook Reader ───────────────────────────────────────────────────────────

def _read_e5_workbook(workbook_path):
    """Read the data worksheet from an E-5 workbook. Test file: scripts/unit_tests/pophousing/acquisition/test_dof_e5_downloader.py"""
    try:
        with pd.ExcelFile(workbook_path) as excel_file:
            if len(excel_file.sheet_names) < 2:
                raise ValueError(f"E-5 workbook has no data worksheet: {workbook_path}")
            return pd.read_excel(excel_file, sheet_name=excel_file.sheet_names[1])
    except ImportError as error:
        raise RuntimeError("Reading E-5 .xlsx files requires the openpyxl package") from error
