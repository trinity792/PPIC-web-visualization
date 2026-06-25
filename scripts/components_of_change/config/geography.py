"""
geography.py — composes California and national geography settings for Components of Change.

Data sources:
    - scripts.shared.geography.california_geography — shared California county and region settings
    - hardcoded U.S. state abbreviation mapping — Census national state records

Outputs:
    - dict — states, counties, regions, subsets, and display mappings used by Components modules

Usage:
    python scripts/components_of_change/config/geography.py

Test Folders:
    - scripts/unit_tests/components_of_change/config/
"""

from scripts.shared.geography.california_geography import get_california_geography

# ── Constants ─────────────────────────────────────────────────────────────────

_STATE_TO_ABBREVIATION = {
    "Alabama": "AL",
    "Alaska": "AK",
    "Arizona": "AZ",
    "Arkansas": "AR",
    "California": "CA",
    "Colorado": "CO",
    "Connecticut": "CT",
    "Delaware": "DE",
    "Florida": "FL",
    "Georgia": "GA",
    "Hawaii": "HI",
    "Idaho": "ID",
    "Illinois": "IL",
    "Indiana": "IN",
    "Iowa": "IA",
    "Kansas": "KS",
    "Kentucky": "KY",
    "Louisiana": "LA",
    "Maine": "ME",
    "Maryland": "MD",
    "Massachusetts": "MA",
    "Michigan": "MI",
    "Minnesota": "MN",
    "Mississippi": "MS",
    "Missouri": "MO",
    "Montana": "MT",
    "Nebraska": "NE",
    "Nevada": "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    "Ohio": "OH",
    "Oklahoma": "OK",
    "Oregon": "OR",
    "Pennsylvania": "PA",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    "Tennessee": "TN",
    "Texas": "TX",
    "Utah": "UT",
    "Vermont": "VT",
    "Virginia": "VA",
    "Washington": "WA",
    "West Virginia": "WV",
    "Wisconsin": "WI",
    "Wyoming": "WY",
}

"""
========================================================================================================================
Geography Configuration
========================================================================================================================
"""


def get_components_geography():
    """Return isolated Components geography settings. Test file: scripts/unit_tests/components_of_change/config/test_geography.py"""
    california_config = get_california_geography()
    county_names = set(california_config["county_names"])
    region_names = set(california_config["region_names"])
    state_abbreviations = set(_STATE_TO_ABBREVIATION.values())
    counties = sorted(county_names)
    regions = sorted(region_names)
    states = sorted(state_abbreviations)
    subset_locations = {
        "Counties": counties,
        "Regions": [*regions, "CA"],
        "States": states,
        "All": sorted([*county_names, *region_names, "CA"]),
    }
    return {
        "state_name": california_config["state_name"],
        "california_abbreviation": "CA",
        "county_names": county_names,
        "region_names": region_names,
        "regions_mapping": {
            region: list(counties)
            for region, counties in california_config["regions_mapping"].items()
        },
        "state_to_abbreviation": dict(_STATE_TO_ABBREVIATION),
        "abbreviation_to_state": {
            abbreviation: state for state, abbreviation in _STATE_TO_ABBREVIATION.items()
        },
        "state_abbreviations": state_abbreviations,
        "national_state_names": set(_STATE_TO_ABBREVIATION),
        "subset_locations": {subset: list(locations) for subset, locations in subset_locations.items()},
        "line_expansions": {
            "All Counties": counties,
            "All Regions": regions,
        },
        "valid_locations": set(counties) | region_names | state_abbreviations | {"All Counties", "All Regions"},
        "valid_subsets": set(subset_locations),
        "valid_levels": {"State", "Region", "County", "Other"},
    }
