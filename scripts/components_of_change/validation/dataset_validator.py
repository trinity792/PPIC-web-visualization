"""
dataset_validator.py — validates canonical Components of Change datasets before save.

Data sources:
    - pandas.DataFrame — merged and finalized Components records
    - Components column configuration — required output columns and duplicate keys
    - Components geography configuration — valid geographic levels (optional)

Outputs:
    - tuple[bool, list[str], list[str]] — validity flag, blocking messages, and soft warnings

Usage:
    python scripts/components_of_change/validation/dataset_validator.py

Test Folders:
    - scripts/unit_tests/components_of_change/validation/
"""

import numpy as np
import pandas as pd

from scripts.shared.validation.dataframe_validators import (
    find_duplicate_rows,
    validate_not_empty,
    validate_numeric_range,
    validate_required_columns,
)

"""
========================================================================================================================
Dataset Validation
========================================================================================================================
"""

_REQUIRED_SOURCES = ("DoF", "Census")
_REQUIRED_LEVELS = ("State", "Region", "County")
_NONNEGATIVE_COLUMNS = ("Total Population", "Births", "Deaths")


def validate_components_dataset(dataframe, columns_config, geography_config=None, minimum_year=None, maximum_year=None):
    """Validate a Components dataset, blocking on hard errors and warning on soft anomalies. Test file: scripts/unit_tests/components_of_change/validation/test_dataset_validator.py"""
    # Hard messages block the save because they would corrupt the self-perpetuating
    # history; soft messages are surfaced but do not stop an otherwise-good update
    # (guide B1: block-on-hard, warn-on-soft).
    hard_messages = []
    soft_messages = []

    missing_columns = validate_required_columns(dataframe, columns_config["output_columns"])
    if missing_columns:
        hard_messages.append(f"Missing required columns: {', '.join(missing_columns)}")
    if not validate_not_empty(dataframe):
        hard_messages.append("Components dataset is empty")

    if missing_columns:
        # Downstream checks assume the schema is present.
        return not hard_messages, hard_messages, soft_messages

    duplicate_rows = find_duplicate_rows(dataframe, columns_config["duplicate_key_columns"])
    if not duplicate_rows.empty:
        hard_messages.append(f"Found {len(duplicate_rows)} duplicate Components rows")

    if "Source" in dataframe.columns:
        if dataframe["Source"].isna().any():
            hard_messages.append("Found null Source values")
        observed_sources = set(dataframe["Source"].dropna())
        for required_source in _REQUIRED_SOURCES:
            if required_source not in observed_sources:
                hard_messages.append(f"Missing {required_source} source rows")

    if geography_config is not None and "Geographic Level" in dataframe.columns:
        if dataframe["Geographic Level"].isna().any():
            hard_messages.append("Found null geographic levels")
        observed_levels = set(dataframe["Geographic Level"].dropna())
        valid_levels = set(geography_config.get("valid_levels", []))
        invalid_levels = sorted(str(level) for level in observed_levels - valid_levels)
        if invalid_levels:
            hard_messages.append("Invalid geographic levels: " + ", ".join(invalid_levels))
        for required_level in _REQUIRED_LEVELS:
            if required_level not in observed_levels:
                hard_messages.append(f"Missing {required_level} geographic level")

    # Soft: negative populations/components are implausible but should not wedge updates.
    for column in _NONNEGATIVE_COLUMNS:
        if column in dataframe.columns:
            violations = validate_numeric_range(dataframe, column, 0, None, row_mask=None)
            if not violations.empty:
                soft_messages.append(f"{column} contains {len(violations)} negative values")

    # Soft: a non-finite crude rate (from a divide-by-zero) would blow out a chart scale.
    for column in columns_config.get("rate_columns", []):
        if column in dataframe.columns:
            numeric = pd.to_numeric(dataframe[column], errors="coerce")
            if np.isinf(numeric.to_numpy()).any():
                soft_messages.append(f"{column} contains non-finite values")

    if "Year" in dataframe.columns and (minimum_year is not None or maximum_year is not None):
        numeric_years = pd.to_numeric(dataframe["Year"], errors="coerce").dropna()
        if not numeric_years.empty:
            if minimum_year is not None and numeric_years.min() < minimum_year:
                soft_messages.append(f"Dataset contains years before {minimum_year}")
            if maximum_year is not None and numeric_years.max() > maximum_year:
                soft_messages.append(f"Dataset contains years after {maximum_year}")

    return not hard_messages, hard_messages, soft_messages
