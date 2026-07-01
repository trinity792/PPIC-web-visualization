"""
projections_validators.py — validates Demographic Projections data at cleaning and final stages.

Data sources:
    - pandas.DataFrame — the dataset to validate
    - Schema config — validation thresholds and expected value sets

Outputs:
    - tuple of (is_valid, messages) — structured validation results

Usage:
    Called by dof_p3_cleaner, census_ccest_cleaner, and the orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/validation/
"""

from scripts.shared.validation.dataframe_validators import (
    find_duplicate_rows,
    validate_null_counts,
    validate_numeric_range,
    validate_required_columns,
)

_LEVEL_COLUMN = "Geographic Level"
_YEAR_COLUMN = "Year"

"""
========================================================================================================================
Cleaning-Stage Validators
========================================================================================================================
"""


def validate_cleaning_output(df, schema_config):
    """Validate a single-source DataFrame after cleaning, before the merge phase. Test file: scripts/unit_tests/projections/validation/test_projections_validators.py"""
    config = schema_config["cleaning_validation_config"]
    messages = []

    missing = validate_required_columns(df, config["required_columns"])
    if missing:
        messages.append(f"Missing required columns: {missing}")

    null_counts = validate_null_counts(df, config.get("key_columns", []))
    if null_counts:
        messages.append(f"Null values in key columns: {null_counts}")

    population_column = config["population_column"]
    if population_column in df.columns:
        negatives = validate_numeric_range(df, population_column, 0, None, None)
        if not negatives.empty:
            messages.append(
                f"{population_column} has negative values below minimum 0: {len(negatives)} rows"
            )

    messages.extend(_report_noncanonical(df, schema_config["race_column"], schema_config["canonical_race_groups"], "race/ethnicity"))
    messages.extend(_report_noncanonical(df, schema_config["age_group_column"], schema_config["canonical_age_groups"], "age group"))

    return len(messages) == 0, messages


def _report_noncanonical(df, column, canonical_values, label):
    """Return a message list flagging any non-canonical values in a column."""
    if column not in df.columns:
        return []
    canonical = set(canonical_values)
    invalid = sorted({str(value) for value in df[column].dropna().unique() if value not in canonical})
    if invalid:
        return [f"Non-canonical {label} values: {invalid}"]
    return []


"""
========================================================================================================================
Final Dataset Validators
========================================================================================================================
"""


def validate_projections_dataset(df, validation_config):
    """Validate the final merged dataset before writing to CSV. Test file: scripts/unit_tests/projections/validation/test_projections_validators.py"""
    messages = []

    missing = validate_required_columns(df, validation_config["required_columns"])
    if missing:
        messages.append(f"Missing required columns: {missing}")

    row_count = len(df)
    min_rows = validation_config.get("min_rows")
    max_rows = validation_config.get("max_rows")
    if min_rows is not None and row_count < min_rows:
        messages.append(f"Row count {row_count} is below minimum {min_rows}")
    if max_rows is not None and row_count > max_rows:
        messages.append(f"Row count {row_count} is above maximum {max_rows}")

    expected_levels = validation_config.get("expected_levels", [])
    if _LEVEL_COLUMN in df.columns:
        present_levels = set(df[_LEVEL_COLUMN])
        missing_levels = [level for level in expected_levels if level not in present_levels]
        if missing_levels:
            messages.append(f"Missing geographic levels: {missing_levels}")

    year_range = validation_config.get("year_range")
    if year_range and _YEAR_COLUMN in df.columns:
        year_min, year_max = year_range
        out_of_range = validate_numeric_range(df, _YEAR_COLUMN, year_min, year_max, None)
        if not out_of_range.empty:
            messages.append(f"Year values outside range {year_min}-{year_max}: {len(out_of_range)} rows")

    duplicate_keys = validation_config.get("duplicate_key_columns", [])
    if duplicate_keys and not validate_required_columns(df, duplicate_keys):
        duplicates = find_duplicate_rows(df, duplicate_keys)
        if not duplicates.empty:
            messages.append(f"Duplicate key rows found: {len(duplicates)}")

    return len(messages) == 0, messages


def validate_stratification_completeness(df, schema_config):
    """Validate the base age x sex x race matrix independently for every geography/location/year/source group. Test file: scripts/unit_tests/projections/validation/test_projections_validators.py"""
    group_columns = schema_config["completeness_group_columns"]
    age_column = schema_config["age_group_column"]
    sex_column = schema_config["sex_column"]
    race_column = schema_config["race_column"]
    ages = schema_config["canonical_age_groups"]
    sexes = schema_config["canonical_sexes"]
    races = schema_config["canonical_race_groups"]
    expected = len(ages) * len(sexes) * len(races)

    base = df[
        df[age_column].isin(ages)
        & df[sex_column].isin(sexes)
        & df[race_column].isin(races)
    ]

    messages = []
    for group_key, group_df in base.groupby(group_columns, sort=False):
        observed = group_df[[age_column, sex_column, race_column]].drop_duplicates().shape[0]
        if observed != expected:
            identifiers = ", ".join(f"{column}={value}" for column, value in zip(group_columns, group_key))
            messages.append(
                f"Incomplete stratification for ({identifiers}): found {observed} of {expected} expected base combinations"
            )

    return len(messages) == 0, messages
