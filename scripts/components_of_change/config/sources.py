"""
sources.py — exposes Components of Change DOF E-6 and Census source settings.

Data sources:
    - lib.config — default HTTP headers and timeout
    - California Department of Finance estimates page — E-6 workbook discovery
    - U.S. Census FTP2 population estimates — county component estimates CSV discovery

Outputs:
    - dict — source URLs, fallback filenames, request settings, and source boundary years

Usage:
    python scripts/components_of_change/config/sources.py

Test Folders:
    - scripts/unit_tests/components_of_change/config/
"""

from datetime import date

from lib.config import get_default_http_settings

"""
========================================================================================================================
Source Configuration
========================================================================================================================
"""


def get_source_settings():
    """Return isolated source settings for Components acquisition. Test file: scripts/unit_tests/components_of_change/config/test_sources.py"""
    http_settings = get_default_http_settings()
    current_year = date.today().year
    return {
        "dof_estimates_url": "https://dof.ca.gov/forecasting/demographics/estimates/",
        # {decade} is derived per-candidate-year by the downloader so the URL keeps
        # working across the 2030 vintage rollover without a code change (guide B4).
        "census_components_url_template": "https://www2.census.gov/programs-surveys/popest/datasets/{decade}-{year}/counties/totals/co-est{year}-alldata.csv",
        "census_initial_year": current_year,
        "max_lookback_years": 10,
        "requests_headers": dict(http_settings["headers"]),
        "request_timeout_seconds": http_settings["timeout_seconds"],
        "e6_sheet_index": 1,
        "manual_dof_filename": "E6_Downloaded.csv",
        "manual_census_filename": "Census_Components_Downloaded.csv",
        "dof_boundary_year": 1990,
        "census_boundary_year": 2010,
    }
