"""
e6_cleaner.py — normalizes raw California DOF E-6 Components of Change workbooks.

Data sources:
    - pandas.DataFrame — raw second sheet from a DOF E-6 workbook or manual CSV
    - Components column and geography configuration dictionaries

Outputs:
    - pandas.DataFrame — cleaned DoF Components records with regional aggregates, rates, and source labels

Usage:
    python scripts/components_of_change/cleaning/e6_cleaner.py

Test Folders:
    - scripts/unit_tests/components_of_change/cleaning/
"""

import pandas as pd

from scripts.components_of_change.aggregation.regional_aggregation import add_regional_data
from scripts.components_of_change.calculations.demographic_rates import add_crude_rates
from scripts.shared.data_cleaning.type_conversions import coerce_numeric_columns

"""
========================================================================================================================
E-6 Cleaning
========================================================================================================================
"""


def normalize_e6_columns(raw_e6_df, column_names):
    """Assign canonical E-6 columns and trim non-data rows. Test file: scripts/unit_tests/components_of_change/cleaning/test_e6_cleaner.py"""
    result = raw_e6_df.dropna(axis=1, how="all").copy()
    if len(result.columns) != len(column_names):
        raise ValueError(f"Expected {len(column_names)} E-6 columns, found {len(result.columns)}")
    result.columns = column_names
    first_data_indexes = result.index[result["Location"].isin(["California", "Alameda"])]
    if first_data_indexes.empty:
        raise ValueError("Could not find first E-6 data row")
    result = result.loc[first_data_indexes[0] :].copy()
    result = result.loc[~result["Year"].isin(["Apr-Jun 2010", "Apr-Jun 2020"])].copy()
    return result.reset_index(drop=True)


def repair_truncated_county_names(e6_df, repair_mapping=None):
    """Repair known E-6 truncated county names. Test file: scripts/unit_tests/components_of_change/cleaning/test_e6_cleaner.py"""
    result = e6_df.copy()
    basic_mapping = {
        "Contra ": "Contra Costa",
        "Los": "Los Angeles",
        "San ": "San Bernardino",
        "San Luis": "San Luis Obispo",
    }
    if repair_mapping:
        basic_mapping.update(repair_mapping)
    result["Location"] = result["Location"].replace(basic_mapping)

    san_indexes = result.index[result["Location"].eq("San")].tolist()
    for index, county_name in zip(san_indexes, ["San Francisco", "San Joaquin"]):
        result.at[index, "Location"] = county_name

    santa_indexes = result.index[result["Location"].eq("Santa")].tolist()
    for index, county_name in zip(santa_indexes, ["Santa Barbara", "Santa Clara"]):
        result.at[index, "Location"] = county_name
    return result


def forward_fill_locations_by_year_block(e6_df, location_col, year_col):
    """Forward-fill E-6 location labels across each location's year block. Test file: scripts/unit_tests/components_of_change/cleaning/test_e6_cleaner.py"""
    result = e6_df.dropna(how="all").reset_index(drop=True).copy()
    result[year_col] = result[year_col].apply(lambda value: value.replace("Census ", "") if isinstance(value, str) else value)
    result[year_col] = pd.to_numeric(result[year_col], errors="coerce")
    valid_years = result[year_col].dropna()
    if valid_years.empty:
        raise ValueError("E-6 dataframe does not contain valid years")
    year_diff = int(valid_years.max() - valid_years.min())
    seen_locations = set()
    for row_index in range(len(result)):
        location_value = result.loc[row_index, location_col]
        if pd.notna(location_value) and location_value not in seen_locations:
            for fill_index in range(row_index + 1, min(row_index + 1 + year_diff, len(result))):
                result.loc[fill_index, location_col] = location_value
            seen_locations.add(location_value)
    return result


def clean_e6(raw_e6_df, columns_config, geography_config):
    """Clean raw DoF E-6 data into canonical Components records. Test file: scripts/unit_tests/components_of_change/cleaning/test_e6_cleaner.py"""
    result = normalize_e6_columns(raw_e6_df, columns_config["canonical_columns"])
    result = repair_truncated_county_names(result)
    result = forward_fill_locations_by_year_block(result, "Location", "Year")
    result = result.loc[result["Year"].ne(result["Year"].min())].copy()
    yuba_indexes = result.index[result["Location"].eq("Yuba")]
    if yuba_indexes.empty:
        raise ValueError("Could not find final Yuba row in E-6 data")
    result = result.loc[: yuba_indexes[-1]].dropna().reset_index(drop=True)
    result = coerce_numeric_columns(result, columns_config["numeric_columns"])
    result["Year"] = pd.to_numeric(result["Year"], errors="raise").astype(int)
    result = add_crude_rates(result, "Total Population", columns_config["crude_rate_component_map"])
    result["Source"] = "DoF"
    result["Location"] = result["Location"].replace({geography_config["state_name"]: geography_config["california_abbreviation"]})
    result = add_regional_data(result, geography_config["regions_mapping"])
    return result.reset_index(drop=True)
