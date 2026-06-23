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


def get_source_settings():
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
