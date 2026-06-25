"""
california_geography.py — exposes shared California county, region, and state reference geography.

Data sources:
    - lib/pophousing_config.py — canonical California county list and region-to-county mapping

Outputs:
    - dict — California state name, county names, region names, and region-to-county mapping

Usage:
    python scripts/shared/geography/california_geography.py

Test Folders:
    - scripts/unit_tests/shared/geography/
"""

from lib.pophousing_config import COUNTY_LEVEL, REGIONS_MAPPING

"""
========================================================================================================================
California Reference Geography
========================================================================================================================
"""

# Cross-module reference data: more than one California dataset (PopHousing,
# Components of Change) needs the same county/region/state names, so this is the
# single shared owner rather than one module reaching into another's config.
_STATE_NAME = "California"
_SAN_FRANCISCO = "San Francisco"


def get_california_geography():
    """Return shared California county, region, and state reference geography. Test file: scripts/unit_tests/shared/geography/test_california_geography.py"""
    county_names = set(COUNTY_LEVEL)
    # San Francisco is both a city and a county; every consumer treats it as a county here.
    county_names.add(_SAN_FRANCISCO)
    return {
        "state_name": _STATE_NAME,
        "county_names": county_names,
        "region_names": set(REGIONS_MAPPING),
        "regions_mapping": {
            region: list(counties) for region, counties in REGIONS_MAPPING.items()
        },
    }
