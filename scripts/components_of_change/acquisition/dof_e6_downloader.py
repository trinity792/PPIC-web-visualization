"""
dof_e6_downloader.py — discovers and downloads California DOF E-6 Components of Change workbooks.

Data sources:
    - California Department of Finance estimates page — E-6 landing page and workbook links
    - E-6 Excel workbook — second sheet containing Components of Change data

Outputs:
    - str — discovered E-6 workbook URL
    - pandas.DataFrame — raw second-sheet workbook data

Usage:
    python scripts/components_of_change/acquisition/dof_e6_downloader.py

Test Folders:
    - scripts/unit_tests/components_of_change/acquisition/
"""

import re
from io import BytesIO
from urllib.parse import urljoin, urlsplit

import pandas as pd
from bs4 import BeautifulSoup

from scripts.shared.downloads.http_downloads import fetch_response

"""
========================================================================================================================
DOF E-6 Acquisition
========================================================================================================================
"""


class E6DiscoveryError(RuntimeError):
    """Report failure to find an E-6 landing page or workbook. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""


# ── Helpers ───────────────────────────────────────────────────────────────────


def _looks_like_workbook(href):
    """Return True when an href points directly at an Excel workbook. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    return urlsplit(href).path.lower().rstrip("/").endswith((".xlsx", ".xls"))


def _landing_slug(href):
    """Return the final path segment of an href, lowercased. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    return urlsplit(href).path.rstrip("/").rsplit("/", 1)[-1].lower()


def _is_e6_link(href):
    return bool(href) and ("e-6" in href.lower() or "e6" in href.lower())


def _latest_year_in_text(link):
    years = [int(match) for match in re.findall(r"(?:19|20)\d{2}", link.get_text())]
    return max(years) if years else -1


def _get_workbook_url_from_landing_page(landing_url, source_settings):
    if _looks_like_workbook(landing_url):
        return landing_url
    headers = source_settings["requests_headers"]
    timeout = source_settings["request_timeout_seconds"]
    response = fetch_response(landing_url, headers, timeout)
    soup = BeautifulSoup(response.content, "html.parser")
    workbook_link = soup.find("a", href=lambda href: href and _looks_like_workbook(href))
    if workbook_link is None:
        raise E6DiscoveryError("E-6 landing page did not contain a workbook link")
    return urljoin(landing_url, workbook_link["href"])


"""
========================================================================================================================
Discovery and Download
========================================================================================================================
"""


def get_e6_file_url(source_settings):
    """Discover the E-6 workbook URL via the current E-6 landing-page slug. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    base_url = source_settings["dof_estimates_url"]
    response = fetch_response(base_url, source_settings["requests_headers"], source_settings["request_timeout_seconds"])
    soup = BeautifulSoup(response.content, "html.parser")
    link = soup.find("a", href=lambda href: href and _landing_slug(href) == "e-6")
    if link is None:
        raise E6DiscoveryError("Could not find E-6 landing page link")
    landing_url = urljoin(base_url, link["href"])
    return _get_workbook_url_from_landing_page(landing_url, source_settings)


def get_e6_file_url_positional(source_settings):
    """Discover the E-6 workbook URL by picking the most recent E-6 link as a fallback. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    base_url = source_settings["dof_estimates_url"]
    response = fetch_response(base_url, source_settings["requests_headers"], source_settings["request_timeout_seconds"])
    soup = BeautifulSoup(response.content, "html.parser")
    candidates = [link for link in soup.find_all("a", href=True) if _is_e6_link(link["href"])]
    if not candidates:
        raise E6DiscoveryError("DOF estimates page did not contain an E-6 link")
    link = max(candidates, key=_latest_year_in_text)
    landing_url = urljoin(base_url, link["href"])
    return _get_workbook_url_from_landing_page(landing_url, source_settings)


def download_e6_workbook(url, headers, timeout, sheet_index=1):
    """Download an E-6 workbook and load the configured sheet. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    response = fetch_response(url, headers, timeout)
    excel_file = pd.ExcelFile(BytesIO(response.content))
    if sheet_index >= len(excel_file.sheet_names):
        raise IndexError(f"sheet_index {sheet_index} is outside workbook sheet range")
    return pd.read_excel(excel_file, sheet_name=excel_file.sheet_names[sheet_index])
