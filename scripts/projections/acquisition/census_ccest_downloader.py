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


def get_census_ccest_url(base_url, headers, timeout):
    """Discover the current cc-est CSV URL on the Census Bureau site. Test file: scripts/unit_tests/projections/acquisition/test_census_ccest_downloader.py"""
    response = fetch_response(base_url, headers, timeout)
    soup = BeautifulSoup(response.content, "html.parser")
    for link in soup.find_all("a", href=True):
        if re.search(r"cc-est.*\.csv", link["href"], re.IGNORECASE):
            return urljoin(base_url, link["href"])
    raise RuntimeError(f"Could not find a cc-est CSV link on {base_url}")


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
