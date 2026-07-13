"""
regional_aggregation.py — builds regional Components of Change rows from county records.

Data sources:
    - pandas.DataFrame inputs — county-level Components records
    - scripts.shared.geography.california_geography — region-to-county mapping supplied by config

Outputs:
    - pandas.DataFrame — original records plus recalculated regional aggregate rows

Usage:
    python scripts/components_of_change/aggregation/regional_aggregation.py

Test Folders:
    - scripts/unit_tests/components_of_change/aggregation/
"""

import pandas as pd

from scripts.components_of_change.calculations.demographic_rates import add_crude_rates
from scripts.components_of_change.config.columns import get_columns_config
from scripts.shared.data_cleaning.aggregation import aggregate_additive_columns

"""
========================================================================================================================
Regional Aggregation
========================================================================================================================
"""


def build_regional_rows(dataframe, regions_mapping, columns_config=None, location_col="Location", year_col="Year"):
    """Aggregate county records into configured regional rows. Test file: scripts/unit_tests/components_of_change/aggregation/test_regional_aggregation.py"""
    required_columns = [location_col, year_col]
    missing_columns = [column for column in required_columns if column not in dataframe.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    if columns_config is None:
        columns_config = get_columns_config()
    excluded_columns = {
        location_col,
        year_col,
        "Geographic Level",
        "Source",
        *columns_config["rate_columns"],
        "Percent Change in Population",
        "Numeric Change in Population",
    }
    regional_frames = []
    for region_name, county_names in regions_mapping.items():
        region_counties = dataframe.loc[dataframe[location_col].isin(county_names)].copy()
        if "Geographic Level" in region_counties.columns:
            region_counties = region_counties.loc[region_counties["Geographic Level"].isin(["County", pd.NA]) | region_counties["Geographic Level"].isna()]
        if region_counties.empty:
            continue
        aggregated = aggregate_additive_columns(region_counties, year_col, excluded_columns)
        region_rows = aggregated.reindex(columns=dataframe.columns)
        region_rows[location_col] = region_name
        if "Geographic Level" in region_rows.columns:
            region_rows["Geographic Level"] = "Region"
        if "Source" in region_rows.columns and "Source" in region_counties.columns:
            source_values = region_counties.groupby(year_col, sort=True)["Source"].agg(lambda values: values.dropna().iloc[0] if values.dropna().nunique() == 1 else "Aggregated")
            region_rows["Source"] = region_rows[year_col].map(source_values)
        regional_frames.append(region_rows)

    if not regional_frames:
        return pd.DataFrame(columns=dataframe.columns)
    return pd.concat(regional_frames, ignore_index=True).loc[:, dataframe.columns]


def add_regional_data(dataframe, regions_mapping, columns_config=None):
    """Replace regional rows with recalculated regional Components aggregates. Test file: scripts/unit_tests/components_of_change/aggregation/test_regional_aggregation.py"""
    if columns_config is None:
        columns_config = get_columns_config()
    if "Location" not in dataframe.columns:
        raise KeyError("missing column: Location")

    result = dataframe.loc[~dataframe["Location"].isin(regions_mapping)].copy().reset_index(drop=True)
    regional_rows = build_regional_rows(result, regions_mapping, columns_config)
    if regional_rows.empty:
        return result
    combined = pd.concat([result, regional_rows], ignore_index=True)
    return add_crude_rates(combined, "Total Population", columns_config["crude_rate_component_map"])
