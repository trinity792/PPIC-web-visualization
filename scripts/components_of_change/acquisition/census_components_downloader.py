"""
census_components_downloader.py — discovers and downloads Census county component estimates.

Data sources:
    - U.S. Census FTP2 population estimates — co-est{YEAR}-alldata.csv files

Outputs:
    - str — most recent available Census Components CSV URL
    - pandas.DataFrame — raw Census Components records

Usage:
    python scripts/components_of_change/acquisition/census_components_downloader.py

Test Folders:
    - scripts/unit_tests/components_of_change/acquisition/
"""

from datetime import date
from io import BytesIO

import pandas as pd

from scripts.components_of_change.config.sources import get_source_settings
from scripts.shared.downloads.http_downloads import HTTPDownloadError, fetch_response

"""
========================================================================================================================
Census Components Acquisition
========================================================================================================================
"""


class CensusComponentsDiscoveryError(RuntimeError):
    """Report failure to find a Census components CSV. Test file: scripts/unit_tests/components_of_change/acquisition/test_census_components_downloader.py"""


# ── Discovery and Download ────────────────────────────────────────────────────


def get_census_components_url(source_settings, max_lookback_years=None):
    """Walk backward from the configured year until a Census components CSV responds. Test file: scripts/unit_tests/components_of_change/acquisition/test_census_components_downloader.py"""
    initial_year = source_settings.get("census_initial_year", date.today().year)
    lookback_years = max_lookback_years or source_settings["max_lookback_years"]
    headers = source_settings["requests_headers"]
    timeout = source_settings["request_timeout_seconds"]
    template = source_settings["census_components_url_template"]

    last_error = None
    for offset in range(lookback_years):
        year = initial_year - offset
        url = template.format(year=year)
        try:
            fetch_response(url, headers, timeout)
            return url
        except HTTPDownloadError as error:
            last_error = error
    raise CensusComponentsDiscoveryError(f"Could not discover Census components CSV within {lookback_years} years") from last_error


def download_census_components(url, source_settings=None):
    """Load a Census components CSV from a URL or local path. Test file: scripts/unit_tests/components_of_change/acquisition/test_census_components_downloader.py"""
    read_kwargs = {"engine": "python", "encoding": "latin1"}
    if isinstance(url, str) and url.lower().startswith(("http://", "https://")):
        settings = source_settings or get_source_settings()
        response = fetch_response(url, settings["requests_headers"], settings["request_timeout_seconds"])
        return pd.read_csv(BytesIO(response.content), **read_kwargs)
    return pd.read_csv(url, **read_kwargs)
