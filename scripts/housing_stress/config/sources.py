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
from scripts.housing_stress.config.table_iterations import BASE_TABLE_ID, table_iterations

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# The 9 B25140 table iterations consumed by the pipeline, mapped to the raw race
# labels the legacy module used, sourced from the single owner in
# table_iterations.py so sources.py and schemas.py can never drift apart. Order is
# preserved (base table first); raw labels are reconciled to canonical values
# during cleaning.
_TABLE_ITERATIONS = table_iterations()

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
        # Probe backward until the newest vintage resolves or the earliest year is
        # reached; excluded years do not consume a probe. The bound guards against
        # a wholesale outage rather than a merely-late release.
        "max_year_lookback": 6,
        # Retries on the base-table probe before a transient network fault is
        # treated as "not published" (so a blip does not resolve an older vintage).
        "probe_retry_attempts": 3,
        "base_table_id": BASE_TABLE_ID,
        "table_iterations": dict(_TABLE_ITERATIONS),
        "expected_geo_columns": list(_EXPECTED_GEO_COLUMNS),
        "expected_estimate_columns": list(_EXPECTED_ESTIMATE_COLUMNS),
    }
