import pandas as pd

from scripts.pophousing.config.geography import get_geography_config


def classify_ambiguous_location(location, county_context, population, housing_row, housing_df, row_index):
    config = get_geography_config()
    if location == "County Total":
        return "County"
    if location == "State Total":
        return "State"
    if location in config["town_names"]:
        return "Town"

    if housing_df is not None and row_index is not None and "Location" in housing_df:
        try:
            row_position = housing_df.index.get_loc(row_index)
        except KeyError:
            row_position = None
        if isinstance(row_position, int):
            following_locations = (
                housing_df["Location"]
                .iloc[row_position + 1 : row_position + 11]
                .astype("string")
                .str.strip()
            )
            if following_locations.eq("County Total").any():
                return "County"

    if (
        location == "San Joaquin"
        and county_context == "San Joaquin"
        and pd.notna(population)
        and float(population)
        >= config["san_joaquin_county_population_threshold"]
    ):
        return "County"
    return config["default_level"]


def assign_geographic_level_with_context(location, county_context, population, housing_row, geography_config):
    if location == "State Total" or location == geography_config["state_name"]:
        return "State"
    if location in geography_config["region_names"]:
        return "Region"
    if location == "County Total":
        return "County"
    if location in geography_config["town_names"]:
        return "Town"
    if location in geography_config["ambiguous_city_names"]:
        return classify_ambiguous_location(
            location, county_context, population, housing_row, None, None
        )
    return geography_config["default_level"]


def resolve_county_total_rows(housing_df, location_col, temp_county_col):
    missing_columns = [
        column
        for column in (location_col, temp_county_col)
        if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    if "Geographic Level" not in result.columns:
        result["Geographic Level"] = pd.NA
    total_rows = result[location_col].eq("County Total")
    resolvable_rows = total_rows & result[temp_county_col].notna()
    result.loc[resolvable_rows, location_col] = result.loc[
        resolvable_rows, temp_county_col
    ]
    result.loc[resolvable_rows, "Geographic Level"] = "County"
    return result


def normalize_state_total_rows(housing_df, location_col, state_name):
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    result = housing_df.copy()
    if "Geographic Level" not in result.columns:
        result["Geographic Level"] = pd.NA
    state_total_rows = result[location_col].eq("State Total")
    result.loc[state_total_rows, location_col] = state_name
    result.loc[state_total_rows, "Geographic Level"] = "State"
    return result


def assign_missing_geographic_levels(housing_df, classifier_fn, location_col, county_col, population_col, level_col):
    required_columns = [location_col, population_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    if level_col not in result.columns:
        result[level_col] = pd.NA
    geography_config = get_geography_config()
    missing_level_rows = result[level_col].isna() | result[level_col].eq("")
    for row_index in result.index[missing_level_rows]:
        row = result.loc[row_index]
        county_context = row.get(county_col)
        result.at[row_index, level_col] = classifier_fn(
            row[location_col],
            county_context,
            row[population_col],
            row,
            geography_config,
        )
    return result


def apply_town_overrides(housing_df, town_list, location_col, level_col):
    missing_columns = [
        column for column in (location_col, level_col) if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    result.loc[result[location_col].isin(town_list), level_col] = "Town"
    return result


def sanitize_geographic_levels(housing_df, valid_levels, default_level):
    level_col = "Geographic Level"
    if level_col not in housing_df.columns:
        raise KeyError(f"Missing column: {level_col}")

    result = housing_df.copy()
    valid_level_rows = result[level_col].isin(valid_levels)
    result.loc[~valid_level_rows, level_col] = default_level
    return result


def remove_balance_rows(housing_df, location_col):
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    balance_rows = housing_df[location_col].astype("string").str.contains(
        r"^Balance of ", case=False, na=False, regex=True
    )
    return housing_df.loc[~balance_rows].copy().reset_index(drop=True)


def drop_helper_columns(housing_df, columns):
    existing_columns = [column for column in columns if column in housing_df.columns]
    return housing_df.drop(columns=existing_columns).copy()


def standardize_san_francisco_classification(housing_df, location_col, level_col):
    missing_columns = [
        column for column in (location_col, level_col) if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    san_francisco_rows = result[location_col].eq("San Francisco")
    if not san_francisco_rows.any():
        return result

    non_level_columns = [column for column in result.columns if column != level_col]
    san_francisco = result.loc[san_francisco_rows].drop_duplicates(
        subset=non_level_columns
    )
    city_rows = san_francisco.copy()
    city_rows[level_col] = "City"
    county_rows = san_francisco.copy()
    county_rows[level_col] = "County"
    return pd.concat(
        [result.loc[~san_francisco_rows], city_rows, county_rows],
        ignore_index=True,
    ).drop_duplicates().reset_index(drop=True)
