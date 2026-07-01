"""
housing_stress_validators.py — validates ACS Housing Stress data at the cleaning and final stages.

Data sources:
    - pandas.DataFrame — the dataset to validate
    - Schema/validation config — expected value sets and thresholds

Outputs:
    - tuple of (is_valid, messages) — structured validation results

Usage:
    Called by geographic_levels, historical_merge, and the orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/validation/
"""

import pandas as pd

from scripts.shared.validation.dataframe_validators import (
    find_duplicate_rows,
    validate_null_counts,
    validate_numeric_range,
    validate_required_columns,
)

# Contract column names are fixed regardless of the config passed.
_LEVEL_COLUMN = "Geographic Level"
_YEAR_COLUMN = "Year"


"""
========================================================================================================================
Cleaning-Stage Validation
========================================================================================================================
"""


def validate_cleaning_output(df, schema_config):
    """
    Validate a built geographic-level frame before merging.

    Checks required columns, nulls in critical columns, non-negative numbers, shares within
    [0, 1], and canonical tenure and race values.

    Returns:
        tuple of (is_valid, messages).

    Test file: scripts/unit_tests/housing_stress/validation/test_housing_stress_validators.py
    """
    config = schema_config["cleaning_validation_config"]
    messages = []

    missing = validate_required_columns(df, config["required_columns"])
    if missing:
        messages.append(f"Missing required columns: {missing}")
        return False, messages

    nulls = validate_null_counts(df, config["critical_columns"])
    if nulls:
        messages.append(f"Null values in critical columns: {nulls}")

    for column in config["nonnegative_columns"]:
        violations = validate_numeric_range(df, column, 0, None, None)
        if not violations.empty:
            messages.append(f"Negative values in {column}: {len(violations)} row(s)")

    for column in config["share_columns"]:
        violations = validate_numeric_range(df, column, 0.0, 1.0, None)
        if not violations.empty:
            messages.append(f"Share values outside [0, 1] in {column}: {len(violations)} row(s)")

    bad_tenures = sorted(set(df[schema_config["tenure_column"]]) - set(config["canonical_tenures"]))
    if bad_tenures:
        messages.append(f"Non-canonical tenure values: {bad_tenures}")

    bad_races = sorted(set(df[schema_config["race_column"]]) - set(config["canonical_race_groups"]))
    if bad_races:
        messages.append(f"Non-canonical race values: {bad_races}")

    return len(messages) == 0, messages


def validate_stratification_completeness(df, schema_config):
    """
    Validate the tenure x race matrix per (Geographic Level, Location, Year) group.

    A group missing a race is reported as a warning (ACS small-population suppression is
    expected). A present race missing any tenure is an error (the cost-burden math should
    always yield all 5 tenures). Groups are never pooled.

    Returns:
        tuple of (is_valid, messages) where messages label warnings vs errors.

    Test file: scripts/unit_tests/housing_stress/validation/test_housing_stress_validators.py
    """
    group_columns = schema_config["completeness_group_columns"]
    race_column = schema_config["race_column"]
    tenure_column = schema_config["tenure_column"]
    canonical_tenures = schema_config["canonical_tenures"]
    canonical_races = schema_config["canonical_race_groups"]

    messages = []
    has_error = False
    for group_key, group in df.groupby(group_columns):
        keys = group_key if isinstance(group_key, tuple) else (group_key,)
        identifier = ", ".join(f"{column}={value}" for column, value in zip(group_columns, keys))
        present_races = set(group[race_column])

        for race in canonical_races:
            if race not in present_races:
                messages.append(f"WARNING: group ({identifier}) is missing race '{race}' (ACS suppression is expected).")
                continue
            present_tenures = set(group.loc[group[race_column] == race, tenure_column])
            missing_tenures = [tenure for tenure in canonical_tenures if tenure not in present_tenures]
            if missing_tenures:
                has_error = True
                messages.append(f"ERROR: group ({identifier}) race '{race}' is missing tenures: {missing_tenures}.")

    return not has_error, messages


"""
========================================================================================================================
Final Dataset Validation
========================================================================================================================
"""


def validate_housing_stress_dataset(df, validation_config):
    """
    Validate the final merged dataset before writing.

    Checks required columns, row-count bounds, presence of every expected geographic level,
    year range and excluded years, non-negative numbers, shares within [0, 1], and duplicate
    contract keys.

    Returns:
        tuple of (is_valid, messages).

    Test file: scripts/unit_tests/housing_stress/validation/test_housing_stress_validators.py
    """
    messages = []

    missing = validate_required_columns(df, validation_config["required_columns"])
    if missing:
        messages.append(f"Missing required columns: {missing}")
        return False, messages

    row_count = len(df)
    min_rows = validation_config.get("min_rows")
    max_rows = validation_config.get("max_rows")
    if min_rows is not None and row_count < min_rows:
        messages.append(f"Row count {row_count} is below the minimum of {min_rows}.")
    if max_rows is not None and row_count > max_rows:
        messages.append(f"Row count {row_count} is above the maximum of {max_rows}.")

    present_levels = set(df[_LEVEL_COLUMN])
    for level in validation_config["expected_levels"]:
        if level not in present_levels:
            messages.append(f"Expected geographic level is missing: {level}.")

    year_min, year_max = validation_config["year_range"]
    years = pd.to_numeric(df[_YEAR_COLUMN], errors="coerce")
    if year_min is not None and years.lt(year_min).any():
        messages.append(f"Years below {year_min} are present.")
    if year_max is not None and years.gt(year_max).any():
        messages.append(f"Years above {year_max} are present.")

    excluded_present = sorted(set(years.dropna().astype(int)) & set(validation_config.get("excluded_years", set())))
    if excluded_present:
        messages.append(f"Excluded years are present: {excluded_present}.")

    for column in validation_config.get("number_columns", []):
        violations = validate_numeric_range(df, column, 0, None, None)
        if not violations.empty:
            messages.append(f"Negative values in {column}: {len(violations)} row(s).")

    for column in validation_config.get("share_columns", []):
        violations = validate_numeric_range(df, column, 0.0, 1.0, None)
        if not violations.empty:
            messages.append(f"Share values outside [0, 1] in {column}: {len(violations)} row(s).")

    duplicates = find_duplicate_rows(df, validation_config["duplicate_key_columns"])
    if not duplicates.empty:
        messages.append(f"Duplicate contract-key rows found: {len(duplicates)}.")

    return len(messages) == 0, messages
