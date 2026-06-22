import pandas as pd

from scripts.pophousing.aggregation.aggregation_utils import (
    _aggregate_additive_columns,
    deduplicate_geographic_rows,
)
from scripts.pophousing.calculations.housing_metrics import recalculate_housing_rates

_RATE_COLUMNS = {"Vacancy Rate (%)", "Persons Per Household"}


def find_missing_state_years(housing_df, state_name, year_col):
    required_columns = ["Location", "Geographic Level", year_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    years = pd.to_numeric(housing_df[year_col], errors="coerce")
    if years.isna().any():
        raise ValueError(f"invalid {year_col} values")
    county_years = set(years[housing_df["Geographic Level"].eq("County")].astype(int))
    state_rows = housing_df["Location"].eq(state_name) & housing_df[
        "Geographic Level"
    ].eq("State")
    state_years = set(years[state_rows].astype(int))
    return sorted(county_years - state_years)


def build_state_rows_from_counties(housing_df, missing_years, state_name):
    required_columns = ["Location", "Geographic Level", "Year"]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    county_rows = housing_df.loc[
        housing_df["Geographic Level"].eq("County")
        & housing_df["Year"].isin(missing_years)
    ].copy()
    county_rows = deduplicate_geographic_rows(
        county_rows,
        "Location",
        "Year",
        "Geographic Level",
        "County",
    )
    if county_rows.empty:
        return pd.DataFrame(columns=housing_df.columns)

    excluded_columns = {
        "Location",
        "Geographic Level",
        "Year",
        "Source",
        *_RATE_COLUMNS,
    }
    aggregated = _aggregate_additive_columns(
        county_rows, "Year", excluded_columns
    )
    state_rows = aggregated.reindex(columns=housing_df.columns)
    state_rows["Location"] = state_name
    state_rows["Geographic Level"] = "State"
    for rate_column in _RATE_COLUMNS & set(state_rows.columns):
        state_rows[rate_column] = float("nan")
    if "Source" in state_rows.columns:
        state_rows["Source"] = "Aggregated"
    return state_rows.loc[:, housing_df.columns].reset_index(drop=True)


def add_state_data_for_missing_years(housing_df, state_name):
    missing_years = find_missing_state_years(housing_df, state_name, "Year")
    if not missing_years:
        return housing_df.copy()

    state_rows = build_state_rows_from_counties(
        housing_df, missing_years, state_name
    )
    if state_rows.empty:
        return housing_df.copy()
    result = pd.concat([housing_df.copy(), state_rows], ignore_index=True)
    new_state_mask = result.index.isin(
        range(len(housing_df), len(result))
    )
    return recalculate_housing_rates(
        result, pd.Series(new_state_mask, index=result.index)
    )
