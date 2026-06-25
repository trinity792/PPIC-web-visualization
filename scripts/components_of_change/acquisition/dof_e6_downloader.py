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

from io import BytesIO
from urllib.parse import urljoin

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


def _first_text_inner(soup):
    body = soup.find(attrs={"class": "et_pb_text_inner"})
    if body is None:
        raise E6DiscoveryError("DOF page did not contain an et_pb_text_inner body")
    return body


def _get_workbook_url_from_landing_page(landing_url, source_settings):
    headers = source_settings["requests_headers"]
    timeout = source_settings["request_timeout_seconds"]
    response = fetch_response(landing_url, headers, timeout)
    soup = BeautifulSoup(response.content, "html.parser")
    body = soup.find_all(attrs={"class": "et_pb_text_inner"})
    if not body:
        raise E6DiscoveryError("E-6 landing page did not contain workbook links")
    first_ul = body[0].find("ul")
    if first_ul is None:
        raise E6DiscoveryError("E-6 landing page did not contain a workbook list")
    workbook_link = first_ul.find("a", href=True)
    if workbook_link is None:
        raise E6DiscoveryError("E-6 landing page workbook list did not contain a link")
    return urljoin(landing_url, workbook_link["href"])


"""
========================================================================================================================
Discovery and Download
========================================================================================================================
"""


def get_e6_file_url(source_settings):
    """Discover the E-6 workbook URL using href text matching. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    base_url = source_settings["dof_estimates_url"]
    response = fetch_response(base_url, source_settings["requests_headers"], source_settings["request_timeout_seconds"])
    soup = BeautifulSoup(response.content, "html.parser")
    body = _first_text_inner(soup)
    link = body.find("a", href=lambda href: href and ("e-6" in href.lower() or "e6" in href.lower()))
    if link is None:
        raise E6DiscoveryError("Could not find E-6 landing page link")
    landing_url = urljoin(base_url, link["href"])
    return _get_workbook_url_from_landing_page(landing_url, source_settings)


def get_e6_file_url_positional(source_settings):
    """Discover the E-6 workbook URL using the legacy positional fallback. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    base_url = source_settings["dof_estimates_url"]
    response = fetch_response(base_url, source_settings["requests_headers"], source_settings["request_timeout_seconds"])
    soup = BeautifulSoup(response.content, "html.parser")
    body = _first_text_inner(soup)
    lists = body.find_all("ul", recursive=False)
    if len(lists) < 7:
        raise E6DiscoveryError("DOF estimates page did not contain a seventh list")
    link = lists[6].find("a", href=True)
    if link is None:
        raise E6DiscoveryError("Seventh DOF estimates list did not contain a link")
    landing_url = urljoin(base_url, link["href"])
    return _get_workbook_url_from_landing_page(landing_url, source_settings)


def download_e6_workbook(url, headers, timeout, sheet_index=1):
    """Download an E-6 workbook and load the configured sheet. Test file: scripts/unit_tests/components_of_change/acquisition/test_dof_e6_downloader.py"""
    response = fetch_response(url, headers, timeout)
    excel_file = pd.ExcelFile(BytesIO(response.content))
    if sheet_index >= len(excel_file.sheet_names):
        raise IndexError(f"sheet_index {sheet_index} is outside workbook sheet range")
    return pd.read_excel(excel_file, sheet_name=excel_file.sheet_names[sheet_index])
