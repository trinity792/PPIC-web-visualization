from pathlib import Path

import pandas as pd

from scripts.shared.validation.dataframe_validators import (
    find_duplicate_rows,
    validate_not_empty,
    validate_null_counts,
    validate_required_columns,
)


def validate_historical_housing_data(file_path, validation_config):
    file_path = Path(file_path)
    if not file_path.is_file():
        raise FileNotFoundError(f"Historical data file not found: {file_path}")

    try:
        housing_df = pd.read_csv(file_path)
    except (OSError, pd.errors.ParserError, UnicodeError) as error:
        return False, [f"Unable to read historical data: {error}"]

    validation_messages = []
    if not validate_not_empty(housing_df):
        return False, ["Historical data is empty"]

    required_columns = validation_config.get("required_columns", [])
    missing_columns = validate_required_columns(housing_df, required_columns)
    if missing_columns:
        validation_messages.append(f"Missing required columns: {missing_columns}")

    year_column = validation_config.get("year_column", "Year")
    if year_column in housing_df.columns:
        numeric_years = pd.to_numeric(housing_df[year_column], errors="coerce")
        invalid_year_count = int(numeric_years.isna().sum())
        if invalid_year_count:
            validation_messages.append(f"Found {invalid_year_count} invalid year values")

        observed_years = set(numeric_years.dropna().astype(int))
        expected_years = set(validation_config.get("expected_years", []))
        missing_years = sorted(expected_years - observed_years)
        if missing_years:
            validation_messages.append(f"Missing years: {missing_years}")
    else:
        numeric_years = pd.Series(index=housing_df.index, dtype="float64")

    level_column = validation_config.get("level_column", "Geographic Level")
    if level_column in housing_df.columns:
        observed_levels = set(housing_df[level_column].dropna())
        expected_levels = set(validation_config.get("expected_levels", []))
        missing_levels = sorted(expected_levels - observed_levels)
        if missing_levels:
            validation_messages.append(f"Missing geographic levels: {missing_levels}")

    location_column = validation_config.get("location_column", "Location")
    state_name = validation_config.get("state_name", "California")
    state_level = validation_config.get("state_level", "State")
    population_column = validation_config.get("population_column", "Total Population")
    if population_column in housing_df.columns:
        numeric_populations = pd.to_numeric(housing_df[population_column], errors="coerce")
        negative_population_count = int((numeric_populations < 0).sum())
        if negative_population_count:
            validation_messages.append(f"Found {negative_population_count} negative population values")

    if location_column in housing_df.columns and level_column in housing_df.columns:
        state_mask = (housing_df[location_column] == state_name) & (housing_df[level_column] == state_level)
        state_df = housing_df[state_mask]
        minimum_state_records = validation_config.get("minimum_state_records", 1)
        if state_df.empty:
            validation_messages.append(f"No {state_name} state data found")
        elif len(state_df) < minimum_state_records:
            validation_messages.append(
                f"{state_name} state data incomplete: found {len(state_df)} records; "
                f"expected at least {minimum_state_records}"
            )

        if population_column in state_df.columns:
            minimum_population_year = validation_config.get("minimum_population_year")
            recent_state_df = state_df
            if minimum_population_year is not None:
                recent_state_df = state_df[numeric_years.loc[state_df.index] >= minimum_population_year]

            populations = pd.to_numeric(recent_state_df[population_column], errors="coerce").dropna()
            minimum_population = validation_config.get("minimum_state_population")
            maximum_population = validation_config.get("maximum_state_population")
            if not recent_state_df.empty and populations.empty:
                validation_messages.append(f"No valid recent {state_name} population values found")
            if not populations.empty and minimum_population is not None and populations.mean() < minimum_population:
                validation_messages.append(f"Average {state_name} population is below {minimum_population:,}")
            if not populations.empty and maximum_population is not None and populations.mean() > maximum_population:
                validation_messages.append(f"Average {state_name} population is above {maximum_population:,}")

    null_counts = validate_null_counts(housing_df, required_columns)
    maximum_null_count = validation_config.get("maximum_null_count", 0)
    maximum_null_counts = validation_config.get("maximum_null_counts", {})
    excessive_null_counts = {
        column: null_count
        for column, null_count in null_counts.items()
        if null_count > maximum_null_counts.get(column, maximum_null_count)
    }
    if excessive_null_counts:
        validation_messages.append(f"Required columns contain excessive null values: {excessive_null_counts}")

    duplicate_key_columns = validation_config.get("duplicate_key_columns", [])
    if duplicate_key_columns and not validate_required_columns(housing_df, duplicate_key_columns):
        duplicate_rows = find_duplicate_rows(housing_df, duplicate_key_columns)
        duplicate_record_count = int(duplicate_rows.duplicated(subset=duplicate_key_columns).sum())
        if duplicate_record_count:
            validation_messages.append(f"Found {duplicate_record_count} duplicate entries")

    return not validation_messages, validation_messages
