"""
sources.py — exposes the CKAN package id, endpoints, resource-name patterns, and request settings.

Data sources:
    - lib.config — default HTTP headers and timeout
    - data.ca.gov CKAN package "rhna-progress-report" (HCD)

Outputs:
    - dict — source settings consumed by the acquisition phase

Usage:
    python scripts/rhna_progress/config/sources.py

Test Folders:
    - scripts/unit_tests/rhna_progress/config/
"""

from lib.config import get_default_http_settings

"""
========================================================================================================================
Source Configuration
========================================================================================================================
"""

# CKAN package id for HCD's RHNA Progress Report (stable across the biweekly overwrite).
_PACKAGE_ID = "ff082e96-72f7-4443-9747-8b8dadc15671"
_API_BASE_URL = "https://data.ca.gov/api/3/action"

# Identifies an "Nth Cycle RHNA Progress Report" CSV resource and captures the cycle
# integer; the trailing anchor keeps it from also matching the "... Data Dictionary" DOCX.
_RESOURCE_NAME_PATTERN = r"^(?P<cycle>\d+)(?:st|nd|rd|th) Cycle RHNA Progress Report$"
_DICTIONARY_NAME_PATTERN = r"^(?P<cycle>\d+)(?:st|nd|rd|th) Cycle RHNA Progress Report Data Dictionary$"


def get_source_config():
    """
    Return the CKAN package id, the API base URL, the resource-name regex that identifies a 'Nth Cycle RHNA Progress Report' CSV and its cycle integer, the dictionary-resource pattern, request retry/timeout settings, and the User-Agent.

    Test file: scripts/unit_tests/rhna_progress/config/test_sources.py
    """
    http_settings = get_default_http_settings()
    return {
        "package_id": _PACKAGE_ID,
        "api_base_url": _API_BASE_URL,
        "resource_name_pattern": _RESOURCE_NAME_PATTERN,
        "dictionary_name_pattern": _DICTIONARY_NAME_PATTERN,
        "request_headers": dict(http_settings["headers"]),
        "timeout": http_settings["timeout_seconds"],
        "retry_attempts": 3,
        "retry_backoff_seconds": 1.0,
    }
