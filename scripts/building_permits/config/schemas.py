"""
schemas.py — exposes Building Permits column schemas, rename maps, and validation configs.

Data sources:
    - hardcoded Census BPS reference schema — column names, metro rename maps,
      geographic-level rules, state scope, and validation thresholds
    - scripts/shared/geography/california_geography.py — canonical CBSA metro names

Outputs:
    - dict — schema settings consumed by cleaning, geography, validation, and output phases

Usage:
    python scripts/building_permits/config/schemas.py

Test Folders:
    - scripts/unit_tests/building_permits/config/
"""

from scripts.shared.geography.california_geography import get_california_geography

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# The five raw structure-size counts taken directly from the BPS spreadsheet.
_MEASURE_COLUMNS = [
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]

# Contract column order for the finalized dataset.
_OUTPUT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    *_MEASURE_COLUMNS,
]

# The 50 U.S. states. District of Columbia and Puerto Rico are excluded to match
# the legacy module's scope.
_STATE_NAMES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
    "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
    "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
    "Washington", "West Virginia", "Wisconsin", "Wyoming",
]

# CBSA code -> PPIC display name (the legacy `location_dict`). Renames codes whose
# Census "Name" field diverges from the desired display label.
_CBSA_CODE_RENAMES = {
    12540: "Bakersfield",
    41860: "San Francisco-Oakland-Berkeley",
    44700: "Stockton",
}

# Census metro name -> PPIC display name (the legacy "per Hans" `location_dict2`).
_METRO_DISPLAY_RENAMES = {
    "Hanford-Corcoran": "Hanford",
    "Riverside-San Bernardino-Ontario": "Inland Empire",
    "Sacramento-Roseville-Folsom": "Sacramento",
    "San Diego-Chula Vista-Carlsbad": "San Diego",
    "San Jose-Sunnyvale-Santa Clara": "San Jose",
    "San Luis Obispo-Paso Robles": "San Luis Obispo",
    "Santa Cruz-Watsonville": "Santa Cruz",
    "Santa Maria-Santa Barbara": "Santa Barbara",
    "Santa Rosa-Petaluma": "Santa Rosa",
    "Oxnard-Thousand Oaks-Ventura": "Ventura",
    "Los Angeles-Long Beach-Anaheim": "Los Angeles",
    "San Francisco-Oakland-Berkeley": "San Francisco",
}

# The Metro /Micro Code value that tags a micropolitan area (dropped; only
# metropolitan CBSAs are kept).
_MICRO_METRO_CODE = 5

_GEOGRAPHIC_LEVELS = ["State", "Metro"]

"""
========================================================================================================================
Schema Configuration
========================================================================================================================
"""


def get_schema_config():
    """Return schema configuration for the Building Permits pipeline. Test file: scripts/unit_tests/building_permits/config/test_schemas.py"""
    metro_names = sorted(get_california_geography()["cbsa_metros"])

    cleaning_validation_config = {
        "required_columns": ["Location", "Date", *_MEASURE_COLUMNS],
        "key_columns": ["Location", "Date"],
        "nonnegative_columns": list(_MEASURE_COLUMNS),
    }
    final_validation_config = {
        "required_columns": list(_OUTPUT_COLUMNS),
        "expected_levels": list(_GEOGRAPHIC_LEVELS),
        "expected_states": list(_STATE_NAMES),
        "expected_metros": list(metro_names),
        "earliest_month": "2010-01",
        "min_rows": 1,
        "max_rows": None,
        "measure_columns": list(_MEASURE_COLUMNS),
        "duplicate_key_columns": ["Date", "Geographic Level", "Location"],
    }

    return {
        "output_columns": list(_OUTPUT_COLUMNS),
        "required_columns": list(_OUTPUT_COLUMNS),
        "date_column": "Date",
        "location_column": "Location",
        "level_column": "Geographic Level",
        "measure_columns": list(_MEASURE_COLUMNS),
        "cbsa_code_renames": dict(_CBSA_CODE_RENAMES),
        "metro_display_renames": dict(_METRO_DISPLAY_RENAMES),
        "state_names": list(_STATE_NAMES),
        "metro_names": list(metro_names),
        "micro_metro_code": _MICRO_METRO_CODE,
        "geographic_levels": list(_GEOGRAPHIC_LEVELS),
        "completeness_group_columns": ["Geographic Level", "Date"],
        "cleaning_validation_config": cleaning_validation_config,
        "final_validation_config": final_validation_config,
    }
