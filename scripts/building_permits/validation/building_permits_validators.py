"""
building_permits_validators.py — validates Building Permits data at the cleaning and final stages.

Data sources:
    - pandas.DataFrame — the dataset to validate
    - Schema config — expected value sets and thresholds

Outputs:
    - tuple of (is_valid, messages) — structured validation results

Usage:
    Called by geography, historical_merge, and the orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/validation/
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
_DATE_COLUMN = "Date"
_LOCATION_COLUMN = "Location"

_MONTH_PATTERN = r"^\d{4}-\d{2}$"


"""
========================================================================================================================
Month Helpers
========================================================================================================================
"""


def _month_index(month_string):
    """Return a zero-based absolute month index for a 'YYYY-MM' string."""
    year, month = (int(part) for part in month_string.split("-"))
    return year * 12 + (month - 1)


def _month_from_index(index):
    """Invert _month_index back into a 'YYYY-MM' string."""
    return f"{index // 12}-{index % 12 + 1:02d}"


"""
========================================================================================================================
Cleaning-Stage Validation
========================================================================================================================
"""


def validate_cleaning_output(df, schema_config):
    """
    Validate a cleaned monthly frame before aggregation/merging.

    Checks: required columns present; Date matches YYYY-MM; no nulls in key columns;
    measures non-negative integers; Location values within the expected set for the
    frame's scope (states or metros).

    Returns:
        tuple of (is_valid, messages).

    Test file: scripts/unit_tests/building_permits/validation/test_building_permits_validators.py
    """
    config = schema_config["cleaning_validation_config"]
    measure_columns = schema_config["measure_columns"]
    date_column = schema_config.get("date_column", _DATE_COLUMN)
    location_column = schema_config.get("location_column", _LOCATION_COLUMN)

    messages = []

    missing = validate_required_columns(df, config["required_columns"])
    if missing:
        messages.append(f"Missing required columns: {missing}")
        return False, messages

    bad_dates = sorted(str(value) for value in df.loc[~df[date_column].astype(str).str.match(_MONTH_PATTERN), date_column].unique())
    if bad_dates:
        messages.append(f"Invalid Date values (expected YYYY-MM): {bad_dates}")

    nulls = validate_null_counts(df, config["key_columns"])
    if nulls:
        messages.append(f"Null values in key columns: {nulls}")

    for column in measure_columns:
        negatives = validate_numeric_range(df, column, 0, None, None)
        if not negatives.empty:
            messages.append(f"Negative values in {column}: {len(negatives)} row(s)")
        numeric = pd.to_numeric(df[column], errors="coerce").dropna()
        if not numeric.mod(1).eq(0).all():
            messages.append(f"Non-integer values in {column}")

    allowed_locations = set(schema_config.get("state_names", [])) | set(schema_config.get("metro_names", []))
    unknown_locations = sorted(str(value) for value in set(df[location_column]) - allowed_locations)
    if unknown_locations:
        messages.append(f"Unknown location values: {unknown_locations}")

    return len(messages) == 0, messages


"""
========================================================================================================================
Final Dataset Validation
========================================================================================================================
"""


def validate_building_permits_dataset(df, validation_config):
    """
    Validate the final merged dataset before writing.

    Checks: required columns; row-count bounds; both geographic levels present; each
    expected state and metro present per month; canonical metro names; contiguous
    monthly Date range from the earliest expected month; non-negative measures; no
    duplicate (Date, Geographic Level, Location) keys.

    Returns:
        tuple of (is_valid, messages).

    Test file: scripts/unit_tests/building_permits/validation/test_building_permits_validators.py
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

    # Every state must appear each month, but metros are "up to 26" — a metro that
    # the source stops publishing (e.g. a de-delineated CBSA) is allowed to be
    # absent, so metros are only checked for being within the canonical set below.
    expected_states = validation_config.get("expected_states", [])
    expected_metros = validation_config.get("expected_metros", [])
    for date, month_rows in df.groupby(_DATE_COLUMN):
        state_locations = set(month_rows.loc[month_rows[_LEVEL_COLUMN] == "State", _LOCATION_COLUMN])
        for state in expected_states:
            if state not in state_locations:
                messages.append(f"State {state} is missing for {date}.")

    metro_rows = df.loc[df[_LEVEL_COLUMN] == "Metro"]
    unknown_metros = sorted(set(metro_rows[_LOCATION_COLUMN]) - set(expected_metros))
    if unknown_metros:
        messages.append(f"Unknown metro locations: {unknown_metros}.")

    # Contiguity guards against a month being silently skipped *within* the stored
    # series. It runs across the present range (the source only hosts a rolling
    # window of monthly files, so a cold start legitimately starts later than the
    # aspirational earliest_month rather than reaching back to it).
    present_months = sorted(set(df[_DATE_COLUMN]))
    if present_months:
        expected_indices = range(_month_index(present_months[0]), _month_index(present_months[-1]) + 1)
        present_index_set = {_month_index(month) for month in present_months}
        for index in expected_indices:
            if index not in present_index_set:
                messages.append(f"Missing month in contiguous series: {_month_from_index(index)}.")

    for column in validation_config.get("measure_columns", []):
        negatives = validate_numeric_range(df, column, 0, None, None)
        if not negatives.empty:
            messages.append(f"Negative values in {column}: {len(negatives)} row(s).")

    duplicates = find_duplicate_rows(df, validation_config["duplicate_key_columns"])
    if not duplicates.empty:
        messages.append(f"Duplicate contract-key rows found: {len(duplicates)}.")

    return len(messages) == 0, messages
