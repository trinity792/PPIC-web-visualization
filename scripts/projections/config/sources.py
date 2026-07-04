"""
sources.py — exposes Demographic Projections source URLs, request settings, and cache policy.

Data sources:
    - lib.config — default HTTP headers and timeout
    - California Department of Finance projections page — P-3 zip discovery
    - U.S. Census Bureau population estimates — cc-est CSV discovery
    - scripts.projections.config.schemas — expected raw column schemas

Outputs:
    - dict — source URLs, request settings, cache policy, and expected raw columns
      consumed by the acquisition phase

Usage:
    python scripts/projections/config/sources.py

Test Folders:
    - scripts/unit_tests/projections/config/
"""

from lib.config import get_default_http_settings
from scripts.projections.config.schemas import CCEST_RAW_COLUMNS, P3_RAW_COLUMNS

"""
========================================================================================================================
Source Configuration
========================================================================================================================
"""


def get_source_settings():
    """Return source-acquisition settings for both DoF P-3 and Census cc-est. Test file: scripts/unit_tests/projections/config/test_sources.py"""
    http_settings = get_default_http_settings()
    # P-3 projections are republished periodically rather than annually, so the
    # cache and fallback windows are held equal and generous.
    p3_cache_max_age_days = 90
    return {
        "dof_base_url": "https://dof.ca.gov/forecasting/demographics/projections/",
        "census_base_url": "https://www2.census.gov/programs-surveys/popest/datasets/",
        "request_headers": dict(http_settings["headers"]),
        "timeout": http_settings["timeout_seconds"],
        "p3_cache_max_age_days": p3_cache_max_age_days,
        "p3_fallback_max_age_days": p3_cache_max_age_days,
        "ccest_cache_max_age_days": 30,
        # The national cc-est ALLDATA file is ~100 MB from a frequently slow
        # Census host, so its download gets a longer read timeout than the
        # generic HTTP default used for page/discovery requests.
        "ccest_download_timeout": max(http_settings["timeout_seconds"], 300),
        "p3_filename_pattern": r"P-?3.*\.csv",
        "p3_expected_csv_columns": list(P3_RAW_COLUMNS),
        "ccest_expected_columns": list(CCEST_RAW_COLUMNS),
        # Change detection ignores years at or before the boundary; both sources
        # begin in 2020, so 2019 keeps every observed year in scope.
        "dof_boundary_year": 2019,
        "census_boundary_year": 2019,
    }
