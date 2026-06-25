"""
census_cleaner.py — normalizes raw Census Components county estimates into canonical records.

Data sources:
    - pandas.DataFrame — raw Census co-est{YEAR}-alldata records
    - Components column and geography configuration dictionaries

Outputs:
    - pandas.DataFrame — cleaned Census Components records with regions, rates, and source labels

Usage:
    python scripts/components_of_change/cleaning/census_cleaner.py

Test Folders:
    - scripts/unit_tests/components_of_change/cleaning/
"""

import pandas as pd

from scripts.components_of_change.aggregation.regional_aggregation import add_regional_data
from scripts.components_of_change.calculations.demographic_rates import add_crude_rates, recalculate_population_change
from scripts.shared.data_cleaning.dataframe_operations import assign_values_from_mapping

"""
========================================================================================================================
Census Cleaning
========================================================================================================================
"""


def map_state_abbreviations(census_df, mapping):
    """Map Census state total names to two-letter abbreviations. Test file: scripts/unit_tests/components_of_change/cleaning/test_census_cleaner.py"""
    return assign_values_from_mapping(census_df, "CTYNAME", "CTYNAME", mapping)


def reshape_census_wide_to_long(raw_census_df, schema):
    """Reshape Census component columns from wide-year columns to canonical long records. Test file: scripts/unit_tests/components_of_change/cleaning/test_census_cleaner.py"""
    if "CTYNAME" not in raw_census_df.columns:
        raise KeyError("missing column: CTYNAME")
    census_values = raw_census_df.loc[:, raw_census_df.columns[6:]].copy()
    if "CTYNAME" not in census_values.columns:
        census_values.insert(0, "CTYNAME", raw_census_df["CTYNAME"])
    long_df = pd.melt(census_values, id_vars=["CTYNAME"], var_name="Statistic_Year", value_name="Value")
    extracted = long_df["Statistic_Year"].str.extract(r"([a-zA-Z]+)(\d+)", expand=True)
    long_df["Statistic"] = extracted[0]
    long_df["Year"] = extracted[1]
    result = long_df.dropna(subset=["Statistic", "Year"]).pivot_table(index=["CTYNAME", "Year"], columns="Statistic", values="Value").reset_index()
    result = result.rename(columns=schema["census_rename_map"])
    uppercase_columns = [column for column in result.columns if isinstance(column, str) and column.isupper()]
    result = result.drop(columns=uppercase_columns)
    result["Location"] = result["Location"].astype("string").str.replace("County", "", case=False, regex=False).str.strip()
    result["Year"] = pd.to_numeric(result["Year"], errors="raise").astype(int)
    return result


def clean_census_components(raw_census_df, columns_config, geography_config):
    """Clean raw Census Components data into canonical records. Test file: scripts/unit_tests/components_of_change/cleaning/test_census_cleaner.py"""
    required_columns = ["STNAME", "CTYNAME"]
    missing_columns = [column for column in required_columns if column not in raw_census_df.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    national_state_names = geography_config["national_state_names"]
    result = raw_census_df.loc[raw_census_df["STNAME"].eq("California") | raw_census_df["CTYNAME"].isin(national_state_names)].copy()
    result = map_state_abbreviations(result, geography_config["state_to_abbreviation"])
    result = reshape_census_wide_to_long(result, columns_config)
    result = add_regional_data(result, geography_config["regions_mapping"])
    result = add_crude_rates(result, "Total Population", columns_config["crude_rate_component_map"])
    result = recalculate_population_change(result, "Location", "Total Population")
    result = result.loc[result["Year"].ne(2020)].copy()
    result["Source"] = "Census"
    return result.reset_index(drop=True)
