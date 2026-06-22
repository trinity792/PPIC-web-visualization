import re

import pandas as pd

from scripts.pophousing.config.geography import get_geography_config


def standardize_location_column(housing_df, location_col, geo_col, only_levels):
    missing_columns = [
        column for column in (location_col, geo_col) if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    config = get_geography_config()
    city_mappings = config["city_name_mappings"]
    historical_mappings = config["historical_name_standardization"]
    protected_city_names = config["proper_names_ending_in_city"]

    def standardize_name(location):
        if pd.isna(location):
            return location
        normalized_location = str(location).strip()
        normalized_location = city_mappings.get(
            normalized_location, normalized_location
        )
        normalized_location = historical_mappings.get(
            normalized_location, normalized_location
        )
        if normalized_location not in protected_city_names:
            normalized_location = re.sub(
                r"\s+City$", "", normalized_location, flags=re.IGNORECASE
            )
        return normalized_location

    result = housing_df.copy()
    selected_rows = result[geo_col].isin(only_levels)
    result.loc[selected_rows, location_col] = result.loc[
        selected_rows, location_col
    ].map(standardize_name)
    return result
