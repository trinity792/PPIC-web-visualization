"""
final_dataset_validator.py — validates the complete canonical Population & Housing dataset.

Data sources:
    - pandas.DataFrame input — finalized Population & Housing records
    - validation_config — schema, key, geography, year, and numeric-range rules

Outputs:
    - tuple — validity flag and detailed validation-message list

Usage:
    python scripts/pophousing/validation/final_dataset_validator.py

Test Folders:
    - scripts/unit_tests/pophousing/validation/
"""

import pandas as pd

from scripts.shared.validation.dataframe_validators import (
    find_duplicate_rows,
    validate_numeric_range,
    validate_required_columns,
)

"""
========================================================================================================================
Final Dataset Validation
========================================================================================================================
"""


def validate_final_housing_dataset(housing_df, validation_config):
    """Validate final housing data against all configured output rules. Test file: scripts/unit_tests/pophousing/validation/test_final_dataset_validator.py"""
    messages = []
    if housing_df.empty:
        messages.append("Final housing dataset is empty")

    required_columns = validation_config.get("required_columns", [])
    missing_columns = validate_required_columns(housing_df, required_columns)
    if missing_columns:
        messages.append(
            f"Missing required columns: {', '.join(missing_columns)}"
        )

    duplicate_keys = validation_config.get("duplicate_key_columns", [])
    if duplicate_keys and not validate_required_columns(housing_df, duplicate_keys):
        duplicate_rows = find_duplicate_rows(housing_df, duplicate_keys)
        if not duplicate_rows.empty:
            messages.append(
                f"Found {len(duplicate_rows)} rows with duplicate output keys"
            )

    location_column = validation_config.get("location_column", "Location")
    level_column = validation_config.get("level_column", "Geographic Level")
    year_column = validation_config.get("year_column", "Year")

    if level_column in housing_df.columns:
        if housing_df[level_column].isna().any():
            messages.append("Found null geographic levels")
        observed_levels = set(housing_df[level_column].dropna())
        valid_levels = set(validation_config.get("valid_levels", []))
        invalid_levels = sorted(observed_levels - valid_levels)
        if invalid_levels:
            messages.append(
                "Invalid geographic levels: "
                + ", ".join(str(level) for level in invalid_levels)
            )
        missing_levels = sorted(
            set(validation_config.get("required_levels", [])) - observed_levels
        )
        if missing_levels:
            messages.append(
                "Missing geographic levels: " + ", ".join(missing_levels)
            )

    if location_column in housing_df.columns and level_column in housing_df.columns:
        state_name = validation_config.get("state_name", "California")
        state_level = validation_config.get("state_level", "State")
        state_rows = housing_df[location_column].eq(state_name) & housing_df[
            level_column
        ].eq(state_level)
        if not state_rows.any():
            messages.append(f"No {state_name} State rows found")

    numeric_years = None
    if year_column in housing_df.columns:
        numeric_years = pd.to_numeric(housing_df[year_column], errors="coerce")
        invalid_year_count = int(numeric_years.isna().sum())
        if invalid_year_count:
            messages.append(f"Found {invalid_year_count} invalid year values")
        observed_years = numeric_years.dropna()
        minimum_year = validation_config.get("minimum_year")
        maximum_year = validation_config.get("maximum_year")
        if not observed_years.empty:
            range_is_incomplete = (
                minimum_year is not None and observed_years.min() > minimum_year
            ) or (
                maximum_year is not None and observed_years.max() < maximum_year
            )
            if range_is_incomplete:
                messages.append(
                    "Dataset year range does not span "
                    f"{minimum_year} through {maximum_year}"
                )
            if maximum_year is not None and observed_years.gt(maximum_year).any():
                future_years = sorted(
                    observed_years[observed_years.gt(maximum_year)].astype(int).unique()
                )
                messages.append(f"Dataset contains future years: {future_years}")

    if (
        location_column in housing_df.columns
        and level_column in housing_df.columns
        and numeric_years is not None
    ):
        san_francisco_name = validation_config.get(
            "san_francisco_name", "San Francisco"
        )
        san_francisco_rows = housing_df.loc[
            housing_df[location_column].eq(san_francisco_name)
        ].copy()
        if not san_francisco_rows.empty:
            san_francisco_rows["_numeric_year"] = numeric_years.loc[
                san_francisco_rows.index
            ]
            for year, year_rows in san_francisco_rows.groupby("_numeric_year"):
                observed_sf_levels = set(year_rows[level_column].dropna())
                if not {"City", "County"}.issubset(observed_sf_levels):
                    messages.append(
                        f"San Francisco must have City and County rows for {int(year)}"
                    )
                if len(year_rows) > 2:
                    messages.append(
                        f"San Francisco appears more than twice for {int(year)}"
                    )

        bay_area_year = validation_config.get("bay_area_year", 2020)
        bay_area_rows = (
            housing_df[location_column].eq(
                validation_config.get("bay_area_name", "Bay Area")
            )
            & housing_df[level_column].eq("Region")
            & numeric_years.eq(bay_area_year)
        )
        if bay_area_rows.any() and "Total Population" in housing_df.columns:
            bay_area_populations = pd.to_numeric(
                housing_df.loc[bay_area_rows, "Total Population"], errors="coerce"
            )
            minimum_population = validation_config.get(
                "bay_area_population_minimum"
            )
            maximum_population = validation_config.get(
                "bay_area_population_maximum"
            )
            implausible_population = (
                bay_area_populations.lt(minimum_population)
                | bay_area_populations.gt(maximum_population)
            )
            if implausible_population.any():
                messages.append(
                    f"Bay Area {bay_area_year} population is outside the plausible range"
                )

    for column in validation_config.get("nonnegative_columns", []):
        if column not in housing_df.columns:
            continue
        violations = validate_numeric_range(
            housing_df, column, 0, None, row_mask=None
        )
        if not violations.empty:
            messages.append(f"{column} contains negative values")

    range_checks = [
        (
            validation_config.get("vacancy_rate_column", "Vacancy Rate (%)"),
            validation_config.get("vacancy_rate_minimum", 0),
            validation_config.get("vacancy_rate_maximum", 100),
        ),
        (
            validation_config.get(
                "persons_per_household_column", "Persons Per Household"
            ),
            validation_config.get("persons_per_household_minimum", 0),
            validation_config.get("persons_per_household_maximum", 10),
        ),
    ]
    for column, minimum_value, maximum_value in range_checks:
        if column not in housing_df.columns:
            continue
        violations = validate_numeric_range(
            housing_df,
            column,
            minimum_value,
            maximum_value,
            row_mask=None,
        )
        if not violations.empty:
            messages.append(
                f"{column} contains values outside {minimum_value} to {maximum_value}"
            )

    return not messages, messages
