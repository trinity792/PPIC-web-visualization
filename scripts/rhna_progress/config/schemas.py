"""
schemas.py — exposes RHNA Progress column schema, income-tier mapping, status thresholds, and validation configs.

Data sources:
    - hardcoded RHNA reference schema — canonical column order, income-tier source mapping,
      the four-quadrant status thresholds, and validation configs
    - scripts/shared/geography/california_geography.py — the 9 shared PPIC region names

Outputs:
    - dict — schema settings consumed by cleaning, enrichment, validation, and output phases

Usage:
    python scripts/rhna_progress/config/schemas.py

Test Folders:
    - scripts/unit_tests/rhna_progress/config/
"""

from scripts.shared.geography.california_geography import get_california_geography

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# The four RHNA income tiers, plus the derived Total that makes the contract five rows deep.
_TIER_LEVELS = ["Very Low", "Low", "Moderate", "Above Moderate"]
_INCOME_LEVELS = [*_TIER_LEVELS, "Total"]

# Grain of the tidy/long contract; one row per level per jurisdiction-snapshot.
_GRAIN_KEYS = ["Jurisdiction", "Cycle", "Snapshot Date", "Income Level"]

# Canonical output column order (income-level fields first, then the repeated
# jurisdiction-level fields), matching the finalized RHNAProgress_Current.csv.
_OUTPUT_COLUMNS = [
    "Income Level",
    "Units",
    "RHNA",
    "Percent",
    "Projected Units",
    "On Track Score",
    "Status",
    "Jurisdiction",
    "Geographic Level",
    "County",
    "Region",
    "Cycle",
    "Planning Period",
    "Planning Period Start",
    "Planning Period End",
    "Cycle Started",
    "Snapshot Date",
    "Most Recent",
    "Total Days",
    "Elapsed Days",
    "Percent Elapsed",
    "Tiers Met",
    "Tiers With Goal",
    "Overall Progress",
    "Overall On Track Score",
    "Overall Category",
    "Source Last Updated",
]

# Each tier's canonical wide-frame column names (used by cleaning/reshape) and the raw
# HCD source column names (used by normalization and the dictionary check).
_INCOME_TIER_COLUMNS = {
    "Very Low": {
        "units": "Very Low Units",
        "rhna": "Very Low RHNA",
        "percent": "Very Low Percent",
        "source_units": "VLI UNITS",
        "source_rhna": "RHNA VLI",
        "source_percent": "VLI %",
    },
    "Low": {
        "units": "Low Units",
        "rhna": "Low RHNA",
        "percent": "Low Percent",
        "source_units": "LI UNITS",
        "source_rhna": "RHNA LI",
        "source_percent": "LI %",
    },
    "Moderate": {
        "units": "Moderate Units",
        "rhna": "Moderate RHNA",
        "percent": "Moderate Percent",
        "source_units": "MOD UNITS",
        "source_rhna": "RHNA MOD",
        "source_percent": "MOD %",
    },
    "Above Moderate": {
        "units": "Above Moderate Units",
        "rhna": "Above Moderate RHNA",
        "percent": "Above Moderate Percent",
        "source_units": "ABOVE MOD UNITS",
        "source_rhna": "RHNA ABOVE MOD",
        "source_percent": "ABOVE MOD %",
    },
}

# The four-quadrant pace thresholds. On Track Score >= 1.0 is on pace; the two interior
# cut points bucket the shortfall. Labels are kept beside them so cleaning, enrichment,
# and validation all bucket a score identically.
_STATUS_THRESHOLDS = {
    "on_track": 1.0,
    "nearly_on_track": 0.70,
    "somewhat_off_track": 0.50,
}

# Ordered so the values read No Allocation -> Met -> Behind -> the four pace buckets.
_STATUS_LABELS = {
    "no_allocation": "No Allocation",
    "met": "Met",
    "behind": "Behind",
    "on_track": "On Track",
    "nearly_on_track": "Nearly On Track",
    "somewhat_off_track": "Somewhat Off Track",
    "far_off_track": "Far Off Track",
}

# Per-column output dtypes. Nullable dtypes (Int64/Float64) keep the Infinity/#DIV/0!
# and zero-denominator nulls representable without collapsing an integer column to float.
_DTYPES = {
    "Units": "Int64",
    "RHNA": "Int64",
    "Percent": "Float64",
    "Projected Units": "Float64",
    "On Track Score": "Float64",
    "Cycle": "Int64",
    "Cycle Started": "boolean",
    "Most Recent": "boolean",
    "Total Days": "Int64",
    "Elapsed Days": "Int64",
    "Percent Elapsed": "Float64",
    "Tiers Met": "Int64",
    "Tiers With Goal": "Int64",
    "Overall Progress": "Float64",
    "Overall On Track Score": "Float64",
}

"""
========================================================================================================================
Schema Configuration
========================================================================================================================
"""


def get_schema_config():
    """
    Return the output column order, required columns, per-column dtypes, the income-level values (Very Low / Low / Moderate / Above Moderate / Total) and their source-column mapping, the grain keys (Jurisdiction, Cycle, Snapshot Date, Income Level),
    the Status/On Track thresholds (>=1.0 / 0.70 / 0.50) and label wording, and the cleaning/final validation configs.

    Test file: scripts/unit_tests/rhna_progress/config/test_schemas.py
    """
    regions = set(get_california_geography()["region_names"])

    cleaning_validation_config = {
        "required_columns": [
            "Jurisdiction",
            "Cycle",
            "Snapshot Date",
            "Income Level",
            "Units",
            "RHNA",
            "Percent",
        ],
        "key_columns": list(_GRAIN_KEYS),
        "income_levels": list(_INCOME_LEVELS),
        # Tolerance on the source-provided tier Percent versus Units / RHNA (the source
        # rounds to two decimals, so exact equality would false-positive).
        "percent_tolerance": 0.02,
    }
    final_validation_config = {
        "required_columns": list(_OUTPUT_COLUMNS),
        "duplicate_key_columns": list(_GRAIN_KEYS),
        "income_levels": list(_INCOME_LEVELS),
        "tier_income_levels": list(_TIER_LEVELS),
        "regions": regions,
    }

    return {
        "output_columns": list(_OUTPUT_COLUMNS),
        "required_columns": list(_OUTPUT_COLUMNS),
        "dtypes": dict(_DTYPES),
        "income_levels": list(_INCOME_LEVELS),
        "tier_income_levels": list(_TIER_LEVELS),
        "income_tier_columns": {level: dict(columns) for level, columns in _INCOME_TIER_COLUMNS.items()},
        "grain_keys": list(_GRAIN_KEYS),
        "status_thresholds": dict(_STATUS_THRESHOLDS),
        "status_labels": dict(_STATUS_LABELS),
        "cleaning_validation_config": cleaning_validation_config,
        "final_validation_config": final_validation_config,
    }
