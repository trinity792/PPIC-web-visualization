"""
sources.py — exposes DoF E-5 source, download, cache, and discovery settings.

Data sources:
    - lib/pophousing_config.py — DoF URL, HTTP, cache, and workbook-pattern settings

Outputs:
    - dict — isolated source and download settings used by E-5 acquisition

Usage:
    python scripts/pophousing/config/sources.py

Test Folders:
    - scripts/unit_tests/pophousing/config/
"""

from lib.pophousing_config import (
    DOF_BASE_URL,
    E5_CACHE_MAX_AGE_DAYS,
    E5_FALLBACK_MAX_AGE_DAYS,
    E5_FILE_PATTERN,
    E5_HEADER_PATTERN,
    E5_LANDING_PAGE_PATTERN,
    E5_WORKBOOK_LINK_PATTERN,
    REQUESTS_HEADERS,
    REQUESTS_TIMEOUT,
)

"""
========================================================================================================================
Source Configuration
========================================================================================================================
"""


def get_source_settings():
    """Return isolated E-5 source settings. Test file: scripts/unit_tests/pophousing/config/test_sources.py"""
    return {
        "base_url": DOF_BASE_URL,
        "requests_headers": dict(REQUESTS_HEADERS),
        "request_timeout_seconds": REQUESTS_TIMEOUT,
        "e5_cache_max_age_days": E5_CACHE_MAX_AGE_DAYS,
        "e5_fallback_max_age_days": E5_FALLBACK_MAX_AGE_DAYS,
        "e5_filename_pattern": E5_FILE_PATTERN,
        "e5_header_pattern": E5_HEADER_PATTERN,
        "e5_landing_page_pattern": E5_LANDING_PAGE_PATTERN,
        "e5_workbook_link_pattern": E5_WORKBOOK_LINK_PATTERN,
    }
