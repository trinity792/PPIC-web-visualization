"""
hierarchical_location_cleaning.py — recovers location and county context from hierarchical E-5 rows.

Data sources:
    - pandas.DataFrame inputs — E-5 rows with hierarchical location and county labels
    - lib/pophousing_config.py — canonical California county names

Outputs:
    - boolean and index-set helpers — detected meaningful rows and county headers
    - pandas.DataFrame — records with filled locations or temporary county context

Usage:
    python scripts/pophousing/cleaning/hierarchical_location_cleaning.py

Test Folders:
    - scripts/unit_tests/pophousing/cleaning/
"""

import pandas as pd

from scripts.pophousing.config.geography import get_geography_config

"""
========================================================================================================================
Hierarchical Location Cleaning
========================================================================================================================
"""


def identify_county_headers(housing_df, county_names, location_col):
    """Identify county header rows followed by a county total. Test file: scripts/unit_tests/pophousing/cleaning/test_hierarchical_location_cleaning.py"""
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    county_headers = set()
    locations = housing_df[location_col].astype("string").str.strip()
    for position, (row_index, location) in enumerate(locations.items()):
        if location not in county_names:
            continue

        following_locations = locations.iloc[position + 1 : position + 11].dropna()
        if following_locations.eq("County Total").any():
            county_headers.add(row_index)
    return county_headers


def forward_fill_locations_with_context(housing_df, location_col, county_col):
    """Forward-fill blank hierarchical location labels. Test file: scripts/unit_tests/pophousing/cleaning/test_hierarchical_location_cleaning.py"""
    missing_columns = [
        column
        for column in (location_col, county_col)
        if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    locations = result[location_col].astype("string").str.strip()
    locations = locations.mask(locations.eq(""))
    result[location_col] = locations.ffill()
    return result


def build_county_context_column(housing_df, location_col, county_col, temp_col):
    """Build a forward-filled temporary county context column. Test file: scripts/unit_tests/pophousing/cleaning/test_hierarchical_location_cleaning.py"""
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    result = housing_df.copy()
    if county_col in result.columns:
        counties = result[county_col].astype("string").str.strip()
        result[temp_col] = counties.mask(counties.eq("")).ffill()
        return result

    county_names = get_geography_config()["county_names"]
    header_indices = identify_county_headers(result, county_names, location_col)
    current_county = pd.NA
    county_context = []
    for row_index, location in result[location_col].items():
        if row_index in header_indices:
            current_county = str(location).strip()
        county_context.append(current_county)
    result[temp_col] = county_context
    return result
