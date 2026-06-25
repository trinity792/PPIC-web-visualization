"""
geography.py — exposes defensive copies of Population & Housing geography configuration.

Data sources:
    - scripts/shared/geography/california_geography.py — shared California county, region, and state geography
    - lib/pophousing_config.py — towns, ambiguous names, and city-name mappings

Outputs:
    - dict — geography names, mappings, valid levels, and classification thresholds

Usage:
    python scripts/pophousing/config/geography.py

Test Folders:
    - scripts/unit_tests/pophousing/config/
"""

from lib.pophousing_config import (
    ALL_TOWNS,
    AMBIGUOUS_CITY_NAMES,
    CITY_NAME_MAPPINGS,
    HISTORICAL_NAME_STANDARDIZATION,
    PROPER_NAMES_ENDING_IN_CITY,
)
from scripts.shared.geography.california_geography import get_california_geography

"""
========================================================================================================================
Geography Configuration
========================================================================================================================
"""


def get_geography_config():
    """Return isolated geography configuration values. Test file: scripts/unit_tests/pophousing/config/test_geography.py"""
    california = get_california_geography()
    return {
        "state_name": california["state_name"],
        "county_names": set(california["county_names"]),
        "region_names": set(california["region_names"]),
        "regions_mapping": {
            region: list(counties)
            for region, counties in california["regions_mapping"].items()
        },
        "town_names": set(ALL_TOWNS),
        "ambiguous_city_names": set(AMBIGUOUS_CITY_NAMES),
        "proper_names_ending_in_city": set(PROPER_NAMES_ENDING_IN_CITY),
        "city_name_mappings": dict(CITY_NAME_MAPPINGS),
        "historical_name_standardization": dict(
            HISTORICAL_NAME_STANDARDIZATION
        ),
        "valid_levels": {"City", "County", "Region", "State", "Town"},
        "default_level": "City",
        "san_joaquin_county_population_threshold": 50_000,
    }
