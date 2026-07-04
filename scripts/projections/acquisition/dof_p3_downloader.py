"""
dof_p3_downloader.py — discovers and downloads the DoF P-3 demographic projections zip archive.

Data sources:
    - California Department of Finance projections page — HTML page with links to P-3 zip files
    - P-3 zip archive — contains a comma-delimited CSV with columns: fips, year, sex, race7, agerc, perwt

Outputs:
    - {download_directory}/P-3_{FILENAME}.csv — extracted P-3 CSV on disk (zip is discarded after extraction)

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/acquisition/
"""

import re
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zipfile import ZipFile

from bs4 import BeautifulSoup

from scripts.shared.downloads.http_downloads import download_file, fetch_response

# ── Constants ─────────────────────────────────────────────────────────────────

# Matches the extracted P-3 CSV filenames when scanning the download cache.
# DoF publishes the archive as both "P-3_*" (older) and "P3_*" (current), so the
# hyphen is optional.
P3_CSV_FILENAME_PATTERN = r"P-?3.*\.csv"

"""
========================================================================================================================
Discovery Errors
========================================================================================================================
"""


class P3DiscoveryError(RuntimeError):
    """Raised when the P-3 zip URL cannot be found on the DoF site. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""


# ── URL Discovery ─────────────────────────────────────────────────────────────


def get_p3_file_url(base_url, headers, timeout):
    """Discover the current P-3 zip URL by matching link text on the DoF projections page. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""
    response = fetch_response(base_url, headers, timeout)
    soup = BeautifulSoup(response.content, "html.parser")
    for link in soup.find_all("a", href=True):
        if re.search(r"P-?3.*\.zip", link["href"], re.IGNORECASE):
            return urljoin(base_url, link["href"])
    raise P3DiscoveryError(f"Could not find a P-3 zip link on {base_url}")


def get_p3_file_url_positional(base_url, headers, timeout):
    """Fallback URL discovery using positional HTML element matching. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""
    response = fetch_response(base_url, headers, timeout)
    soup = BeautifulSoup(response.content, "html.parser")
    for container in soup.find_all("div", class_="et_pb_text_inner"):
        heading = container.find(string=re.compile(r"P-?3", re.IGNORECASE))
        if heading is None:
            continue
        link = container.find("a", href=re.compile(r"\.zip", re.IGNORECASE))
        if link is not None:
            return urljoin(base_url, link["href"])
    raise P3DiscoveryError(f"Could not positionally locate a P-3 zip link on {base_url}")


# ── Download and Extraction ───────────────────────────────────────────────────


def download_p3_data(url, download_directory, headers, timeout, cache_max_age_days):
    """Download the P-3 zip and extract its CSV, or return a cached CSV within the cache window. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""
    download_directory = Path(download_directory)
    cached_csv = get_most_recent_p3_file(download_directory, P3_CSV_FILENAME_PATTERN, cache_max_age_days)
    if cached_csv is not None:
        return cached_csv

    zip_path = download_directory / Path(urlparse(url).path).name
    download_file(url, zip_path, headers, timeout)
    csv_path = extract_csv_from_zip(zip_path, download_directory)
    zip_path.unlink(missing_ok=True)
    return csv_path


def extract_csv_from_zip(zip_path, download_directory):
    """Extract the single CSV from a P-3 zip archive. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""
    download_directory = Path(download_directory)
    with ZipFile(zip_path) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(csv_names) != 1:
            raise ValueError(f"P-3 zip must contain exactly one CSV file, found {len(csv_names)}: {zip_path}")
        csv_name = csv_names[0]
        destination = download_directory / Path(csv_name).name
        with archive.open(csv_name) as source, open(destination, "wb") as target:
            target.write(source.read())
    return destination


def get_most_recent_p3_file(download_directory, filename_pattern, max_age_days):
    """Scan the download directory for the newest P-3 CSV within the fallback window. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""
    download_directory = Path(download_directory)
    if not download_directory.is_dir():
        return None

    current_timestamp = time.time()
    candidate_paths = sorted(
        (
            file_path
            for file_path in download_directory.iterdir()
            if file_path.is_file() and re.fullmatch(filename_pattern, file_path.name)
        ),
        key=lambda file_path: file_path.stat().st_mtime,
        reverse=True,
    )
    for file_path in candidate_paths:
        age_days = max(0, (current_timestamp - file_path.stat().st_mtime) / 86_400)
        if age_days <= max_age_days:
            return file_path
    return None


def validate_p3_csv(csv_path, expected_columns):
    """Confirm that the extracted CSV contains each mandatory header exactly once. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""
    with open(csv_path, encoding="utf-8") as csv_file:
        header_line = csv_file.readline().strip()
    header_counts = Counter(column.strip() for column in header_line.split(","))

    missing = [column for column in expected_columns if header_counts[column] == 0]
    if missing:
        raise ValueError(f"P-3 CSV is missing required column(s): {', '.join(missing)}")

    duplicated = [column for column in expected_columns if header_counts[column] > 1]
    if duplicated:
        raise ValueError(f"P-3 CSV has duplicate required column(s): {', '.join(duplicated)}")
