"""
sources.py — exposes ACS Housing Stress source URLs, table iterations, request settings, and cache policy.

Data sources:
    - lib.config — default HTTP headers and timeout
    - U.S. Census Bureau ACS 1-year table-based Summary File — B25140 data and geography files

Outputs:
    - dict — source URL patterns, request settings, year-availability policy, the 9
      B25140 race iterations, and expected raw column names consumed by the
      acquisition phase

Usage:
    python scripts/housing_stress/config/sources.py

Test Folders:
    - scripts/unit_tests/housing_stress/config/
"""

from lib.config import get_default_http_settings

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# The 9 B25140 table iterations consumed by the pipeline, mapped to the raw race
# labels the legacy module used. Order is preserved (base table first). Iteration
# "a" ("White alone", which includes Hispanic White) is deliberately omitted in
# favor of "h" ("White alone, not Hispanic") so White and Hispanic do not
# double-count. Raw labels are reconciled to canonical values during cleaning.
_TABLE_ITERATIONS = {
    "b25140": "All",
    "b25140b": "Black",
    "b25140c": "American Indian/Alaskan Native",
    "b25140d": "Asian",
    "b25140e": "Native Hawaiian/Pacific Islander",
    "b25140f": "Other",
    "b25140g": "Multiracial",
    "b25140h": "White",
    "b25140i": "Hispanic",
}

# Geography lookup columns joined to the estimate data on GEO_ID.
_EXPECTED_GEO_COLUMNS = ["GEO_ID", "NAME", "STUSAB"]

# The B25140 estimate columns after the table prefix is stripped (E001..E013).
_EXPECTED_ESTIMATE_COLUMNS = [f"E{number:03d}" for number in range(1, 14)]

"""
========================================================================================================================
Source Configuration
========================================================================================================================
"""


def get_source_settings():
    """Return source-acquisition settings for the ACS 1-year table-based Summary File. Test file: scripts/unit_tests/housing_stress/config/test_sources.py"""
    http_settings = get_default_http_settings()
    return {
        # The "1YR"/"1y" segments encode the 1-year dataset; the dataset value is
        # also exposed separately so acquisition can label rows without reparsing.
        "data_url_pattern": (
            "https://www2.census.gov/programs-surveys/acs/summary_file/"
            "{year}/table-based-SF/data/1YRData/acsdt1y{year}-{tblid}.dat"
        ),
        "geo_url_pattern": (
            "https://www2.census.gov/programs-surveys/acs/summary_file/"
            "{year}/table-based-SF/documentation/Geos{year}1YR.txt"
        ),
        "dataset": "1",
        "request_headers": dict(http_settings["headers"]),
        "timeout": http_settings["timeout_seconds"],
        "cache_max_age_days": 30,
        # ACS 1-year estimates begin in 2012; 2020 has no standard 1-year release.
        "earliest_year": 2012,
        "excluded_years": {2020},
        # Probe backward from the current calendar year to find the newest vintage.
        "max_year_lookback": 3,
        "table_iterations": dict(_TABLE_ITERATIONS),
        "expected_geo_columns": list(_EXPECTED_GEO_COLUMNS),
        "expected_estimate_columns": list(_EXPECTED_ESTIMATE_COLUMNS),
    }
