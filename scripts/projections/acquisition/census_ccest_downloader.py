"""
census_ccest_downloader.py — discovers and downloads Census Bureau cc-est demographic estimate files.

Data sources:
    - U.S. Census Bureau CC-EST{VINTAGE}-ALLDATA CSV — official wide-format
      county characteristics file

Outputs:
    - {download_directory}/cc-est_{FILENAME}.csv — downloaded cc-est CSV on disk

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/acquisition/
"""

import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from scripts.shared.downloads.http_downloads import download_file, fetch_response

"""
========================================================================================================================
URL Discovery
========================================================================================================================
"""


# Vintage subdirectories on the Census datasets index are named "<start>-<end>/".
_VINTAGE_DIR_PATTERN = re.compile(r"^(\d{4})-(\d{4})/$")


def get_census_ccest_url(base_url, headers, timeout):
    """Discover the current cc-est ALLDATA CSV URL on the Census Bureau site. Test file: scripts/unit_tests/projections/acquisition/test_census_ccest_downloader.py

    The datasets index lists vintage subdirectories ("2020-2024/", ...) rather
    than the CSV directly, and the nested counties/asrh/ listing is too large to
    scrape reliably. We therefore pick the latest vintage from the index and
    construct the canonical ALLDATA filename from its end year
    (e.g. .../2020-2024/counties/asrh/cc-est2024-alldata.csv).
    """
    response = fetch_response(base_url, headers, timeout)
    soup = BeautifulSoup(response.content, "html.parser")

    latest_end_year = None
    latest_vintage_href = None
    for link in soup.find_all("a", href=True):
        match = _VINTAGE_DIR_PATTERN.match(link["href"])
        if match is None:
            continue
        end_year = int(match.group(2))
        if latest_end_year is None or end_year > latest_end_year:
            latest_end_year = end_year
            latest_vintage_href = link["href"]

    if latest_vintage_href is None:
        raise RuntimeError(f"Could not find a Census vintage directory on {base_url}")

    vintage_url = urljoin(base_url, latest_vintage_href)
    return urljoin(vintage_url, f"counties/asrh/cc-est{latest_end_year}-alldata.csv")


"""
========================================================================================================================
Download
========================================================================================================================
"""


def download_census_ccest(url, download_directory, headers, timeout, cache_max_age_days):
    """Download the cc-est CSV or return a cached copy within the cache window. Test file: scripts/unit_tests/projections/acquisition/test_census_ccest_downloader.py"""
    download_directory = Path(download_directory)
    destination = download_directory / Path(urlparse(url).path).name
    if destination.is_file():
        age_days = max(0, (time.time() - destination.stat().st_mtime) / 86_400)
        if age_days <= cache_max_age_days:
            return destination

    download_file(url, destination, headers, timeout)
    return destination


def validate_ccest_headers(csv_path, expected_columns):
    """Confirm that the downloaded CSV contains the mandatory official wide-format headers. Test file: scripts/unit_tests/projections/acquisition/test_census_ccest_downloader.py"""
    with open(csv_path, encoding="utf-8") as csv_file:
        header_line = csv_file.readline().strip()
    present_columns = {column.strip() for column in header_line.split(",")}

    missing = [column for column in expected_columns if column not in present_columns]
    if missing:
        raise ValueError(f"cc-est CSV is missing required column(s): {', '.join(missing)}")
