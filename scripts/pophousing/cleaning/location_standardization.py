"""
location_standardization.py — standardizes configured city and town names in housing records.

Data sources:
    - pandas.DataFrame inputs — classified housing locations
    - lib/pophousing_config.py — canonical and historical city-name mappings

Outputs:
    - pandas.DataFrame — selected geographic levels with canonical location names

Usage:
    python scripts/pophousing/cleaning/location_standardization.py

Test Folders:
    - scripts/unit_tests/pophousing/cleaning/
"""

import re

import pandas as pd

from scripts.pophousing.config.geography import get_geography_config

"""
========================================================================================================================
Location Standardization
========================================================================================================================
"""


def standardize_location_column(housing_df, location_col, geo_col, only_levels, geography_config=None):
    """Standardize location names for selected geographic levels. Test file: scripts/unit_tests/pophousing/cleaning/test_location_standardization.py"""
    missing_columns = [
        column for column in (location_col, geo_col) if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    # Accept a prebuilt config so callers that already hold one avoid rebuilding it (A6).
    config = geography_config if geography_config is not None else get_geography_config()
    city_mappings = config["city_name_mappings"]
    historical_mappings = config["historical_name_standardization"]
    protected_city_names = config["proper_names_ending_in_city"]

    def standardize_name(location):
        """Return one canonical location name. Test file: scripts/unit_tests/pophousing/cleaning/test_location_standardization.py"""
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
