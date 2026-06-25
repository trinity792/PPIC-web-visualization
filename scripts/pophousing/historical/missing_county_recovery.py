"""
missing_county_recovery.py — recovers county rows the era cleaners drop and integrates them.

Data sources:
    - pandas.DataFrame inputs — raw 2010-2020 E-8 workbook and cleaned historical records
    - target_years — years whose county rows must be recovered

Outputs:
    - pandas.DataFrame — extracted county rows, or historical records with them integrated

Usage:
    python scripts/pophousing/historical/missing_county_recovery.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

import pandas as pd

from scripts.pophousing.calculations.housing_metrics import add_housing_derived_columns
from scripts.pophousing.cleaning.e5_schema_normalizer import rename_e5_schema
from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.historical.e8_schema_normalizer import normalize_e8_columns
from scripts.pophousing.historical.e8_standardization import extract_annual_year
from scripts.shared.data_cleaning.dataframe_operations import forward_fill_columns
from scripts.shared.data_cleaning.type_conversions import coerce_numeric_columns

"""
========================================================================================================================
Missing County Recovery
========================================================================================================================
"""

_KEY_COLUMNS = ["Geographic Level", "Location", "Year"]


def extract_missing_county_rows(raw_e8_df, target_years):
    """Pull County Total rows for target years from a raw 2010-2020 workbook. Test file: scripts/unit_tests/pophousing/historical/test_missing_county_recovery.py"""
    schema_config = get_schema_config()

    housing_df = normalize_e8_columns(
        raw_e8_df, {"column_names": schema_config["e5_column_names"]}
    )
    housing_df = rename_e5_schema(housing_df, schema_config["raw_column_mapping"])
    housing_df = forward_fill_columns(housing_df, ["County"])

    county_total_rows = (
        housing_df["Location"].astype("string").str.strip().eq("County Total")
    )
    housing_df = housing_df.loc[county_total_rows].copy()
    if housing_df.empty:
        return housing_df.reset_index(drop=True)

    years = extract_annual_year(housing_df[schema_config["date_column"]])
    target = {int(year) for year in target_years}
    keep_rows = years.notna() & years.isin(target)
    housing_df = housing_df.loc[keep_rows].copy()
    housing_df["Year"] = years.loc[keep_rows].astype(int)
    housing_df = housing_df.drop(columns=[schema_config["date_column"]])
    if housing_df.empty:
        return housing_df.reset_index(drop=True)

    housing_df = coerce_numeric_columns(housing_df, schema_config["numeric_columns"])
    housing_df[schema_config["zero_fill_columns"]] = housing_df[
        schema_config["zero_fill_columns"]
    ].fillna(0)
    housing_df = add_housing_derived_columns(housing_df)

    housing_df["Location"] = housing_df["County"].astype("string").str.strip()
    housing_df["Geographic Level"] = "County"
    helper_columns = [
        column
        for column in ("County", schema_config["date_column"])
        if column in housing_df.columns
    ]
    return housing_df.drop(columns=helper_columns).reset_index(drop=True)


def integrate_missing_county_rows(historical_housing_df, missing_county_df):
    """Append recovered county rows absent from the historical records. Test file: scripts/unit_tests/pophousing/historical/test_missing_county_recovery.py"""
    if missing_county_df.empty:
        return historical_housing_df.copy().reset_index(drop=True)

    missing_columns = [
        column
        for column in _KEY_COLUMNS
        if column not in historical_housing_df.columns
        or column not in missing_county_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    existing_keys = set(
        map(tuple, historical_housing_df[_KEY_COLUMNS].itertuples(index=False, name=None))
    )
    candidate_keys = missing_county_df[_KEY_COLUMNS].itertuples(index=False, name=None)
    new_row_mask = [key not in existing_keys for key in candidate_keys]
    new_rows = missing_county_df.loc[new_row_mask]
    if new_rows.empty:
        return historical_housing_df.copy().reset_index(drop=True)

    return pd.concat(
        [historical_housing_df, new_rows], ignore_index=True, sort=False
    )
