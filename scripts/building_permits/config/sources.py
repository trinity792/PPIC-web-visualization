"""
sources.py — exposes Building Permits source URLs, request settings, and month-availability policy.

Data sources:
    - lib.config — default HTTP headers and timeout
    - U.S. Census Bureau Building Permits Survey monthly CBSA and state .xls files

Outputs:
    - dict — source settings consumed by the acquisition phase

Usage:
    python scripts/building_permits/config/sources.py

Test Folders:
    - scripts/unit_tests/building_permits/config/
"""

from lib.config import get_default_http_settings

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# Expected named columns in each raw monthly spreadsheet, used to fail loudly when
# the Census layout changes instead of silently mis-slicing.
_EXPECTED_METRO_COLUMNS = [
    "CBSA",
    "Name",
    "Metro /Micro Code",
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]

_EXPECTED_STATE_COLUMNS = [
    "Location",
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]

"""
========================================================================================================================
Source Configuration
========================================================================================================================
"""


def get_source_settings():
    """Return source-acquisition settings for the Census Building Permits Survey monthly files. Test file: scripts/unit_tests/building_permits/config/test_sources.py"""
    http_settings = get_default_http_settings()
    return {
        "cbsa_url_pattern": "https://www.census.gov/construction/bps/xls/cbsamonthly_{yyyymm}.xls",
        "state_url_pattern": "https://www.census.gov/construction/bps/xls/statemonthly_{yyyymm}.xls",
        "request_headers": dict(http_settings["headers"]),
        "timeout": http_settings["timeout_seconds"],
        "cache_max_age_days": 30,
        # The saved series begins 2010-01; BPS publishes monthly with a ~2-month lag.
        "earliest_month": "2010-01",
        # How many months to probe backward from the current month for the newest release.
        "max_month_lookback": 6,
        "expected_metro_columns": list(_EXPECTED_METRO_COLUMNS),
        "expected_state_columns": list(_EXPECTED_STATE_COLUMNS),
    }
