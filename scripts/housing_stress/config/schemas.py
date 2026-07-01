"""
schemas.py — exposes ACS Housing Stress column schemas, tenure formulas, race reconciliation, and validation configs.

Data sources:
    - hardcoded B25140 reference schema — estimate-column semantics, tenure/burden
      formulas, race-iteration reconciliation, and state scope

Outputs:
    - dict — schema settings consumed by the cleaning, geography, validation, and
      output phases

Usage:
    python scripts/housing_stress/config/schemas.py

Test Folders:
    - scripts/unit_tests/housing_stress/config/
"""

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# The B25140 estimate columns after the table prefix is stripped.
_ESTIMATE_COLUMNS = [f"E{number:03d}" for number in range(1, 14)]

# Contract column order for the finalized dataset.
_OUTPUT_COLUMNS = [
    "Year",
    "Geographic Level",
    "Location",
    "Race/Ethnicity",
    "Tenure",
    "Number Over 30%",
    "Number Over 50%",
    "Share Over 30%",
    "Share Over 50%",
]

_MEASURE_COLUMNS = [
    "Number Over 30%",
    "Number Over 50%",
    "Share Over 30%",
    "Share Over 50%",
]

# The four cost-burden measures for each tenure derive from the B25140 estimate
# columns. num_30/num_50 are summed for the >30% and >50% counts; denom is the
# tenure universe used for the shares. These reproduce the legacy formulas.
_TENURE_FORMULAS = {
    "Total": {
        "num_30": ["E003", "E007", "E011"],
        "num_50": ["E004", "E008", "E012"],
        "denom": ["E001"],
    },
    "Rented": {
        "num_30": ["E011"],
        "num_50": ["E012"],
        "denom": ["E010"],
    },
    "Owned": {
        "num_30": ["E003", "E007"],
        "num_50": ["E004", "E008"],
        "denom": ["E002", "E006"],
    },
    "Owned With Mortgage": {
        "num_30": ["E003"],
        "num_50": ["E004"],
        "denom": ["E002"],
    },
    "Owned Without Mortgage": {
        "num_30": ["E007"],
        "num_50": ["E008"],
        "denom": ["E006"],
    },
}

# The 9 stored race/ethnicity categories: the 7 canonical projections groups plus
# "Other" (some other race alone) and "All" (base table). "White" is sourced from
# ACS iteration H (White alone, not Hispanic) so it never double-counts Hispanic.
_CANONICAL_RACE_GROUPS = [
    "All",
    "White",
    "Black",
    "Asian",
    "NHPI",
    "AIAN",
    "Multiracial",
    "Hispanic",
    "Other",
]

# B25140 table iteration id -> canonical race label. Iteration "a" is unused.
_RACE_ITERATION_MAP = {
    "b25140": "All",
    "b25140b": "Black",
    "b25140c": "AIAN",
    "b25140d": "Asian",
    "b25140e": "NHPI",
    "b25140f": "Other",
    "b25140g": "Multiracial",
    "b25140h": "White",
    "b25140i": "Hispanic",
}

# Raw legacy iteration labels (as tagged during acquisition) -> canonical labels.
_RACE_RECONCILIATION_MAP = {
    "All": "All",
    "Black": "Black",
    "American Indian/Alaskan Native": "AIAN",
    "Asian": "Asian",
    "Native Hawaiian/Pacific Islander": "NHPI",
    "Other": "Other",
    "Multiracial": "Multiracial",
    "White": "White",
    "Hispanic": "Hispanic",
}

# The 50 U.S. states. District of Columbia and Puerto Rico are excluded to match
# the legacy module's scope.
_STATE_ABBREVIATIONS = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

_EXCLUDED_STATE_AREAS = {"DC", "PR"}

"""
========================================================================================================================
Schema Configuration
========================================================================================================================
"""


def get_schema_config():
    """Return isolated schema and validation configuration for the ACS Housing Stress pipeline. Test file: scripts/unit_tests/housing_stress/config/test_schemas.py"""
    completeness_group_columns = ["Geographic Level", "Location", "Year"]
    cleaning_validation_config = {
        "required_columns": list(_OUTPUT_COLUMNS),
        "critical_columns": [
            "Year",
            "Geographic Level",
            "Location",
            "Race/Ethnicity",
            "Tenure",
        ],
        "nonnegative_columns": ["Number Over 30%", "Number Over 50%"],
        "share_columns": ["Share Over 30%", "Share Over 50%"],
        "canonical_tenures": list(_TENURE_FORMULAS),
        "canonical_race_groups": list(_CANONICAL_RACE_GROUPS),
    }
    final_validation_config = {
        "required_columns": list(_OUTPUT_COLUMNS),
        "duplicate_key_columns": [
            "Year",
            "Geographic Level",
            "Location",
            "Race/Ethnicity",
            "Tenure",
        ],
        "expected_levels": ["State", "Region", "County"],
        "share_columns": ["Share Over 30%", "Share Over 50%"],
        "nonnegative_columns": ["Number Over 30%", "Number Over 50%"],
        "year_range": (2012, None),
        "excluded_years": {2020},
        "min_rows": 1,
        "max_rows": None,
    }

    return {
        "output_columns": list(_OUTPUT_COLUMNS),
        "required_columns": list(_OUTPUT_COLUMNS),
        "year_column": "Year",
        "location_column": "Location",
        "level_column": "Geographic Level",
        "race_column": "Race/Ethnicity",
        "tenure_column": "Tenure",
        "measure_columns": list(_MEASURE_COLUMNS),
        "estimate_columns": list(_ESTIMATE_COLUMNS),
        "tenure_formulas": {tenure: {key: list(columns) for key, columns in formula.items()} for tenure, formula in _TENURE_FORMULAS.items()},
        "canonical_tenures": list(_TENURE_FORMULAS),
        "race_iteration_map": dict(_RACE_ITERATION_MAP),
        "race_reconciliation_map": dict(_RACE_RECONCILIATION_MAP),
        "canonical_race_groups": list(_CANONICAL_RACE_GROUPS),
        "state_abbreviations": list(_STATE_ABBREVIATIONS),
        "excluded_state_areas": set(_EXCLUDED_STATE_AREAS),
        "completeness_group_columns": list(completeness_group_columns),
        "cleaning_validation_config": cleaning_validation_config,
        "final_validation_config": final_validation_config,
    }
