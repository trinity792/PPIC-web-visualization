"""
regional_aggregation.py — builds regional Population & Housing rows from county records.

Data sources:
    - pandas.DataFrame inputs — canonical county-level housing records
    - regions_mapping — region names mapped to their member counties

Outputs:
    - pandas.DataFrame — original records with recalculated regional aggregates

Usage:
    python scripts/pophousing/aggregation/regional_aggregation.py

Test Folders:
    - scripts/unit_tests/pophousing/aggregation/
"""

import pandas as pd

from scripts.pophousing.aggregation.aggregation_utils import (
    _aggregate_additive_columns,
    deduplicate_geographic_rows,
    remove_existing_geographic_level,
)
from scripts.pophousing.calculations.housing_metrics import recalculate_housing_rates

# ── Constants ─────────────────────────────────────────────────────────────────

_RATE_COLUMNS = {"Vacancy Rate (%)", "Persons Per Household"}

"""
========================================================================================================================
Regional Aggregation
========================================================================================================================
"""


def build_regional_rows(housing_df, regions_mapping, location_col, level_col, year_col):
    """Aggregate county records into configured regional rows. Test file: scripts/unit_tests/pophousing/aggregation/test_regional_aggregation.py"""
    required_columns = [location_col, level_col, year_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    county_rows = housing_df.loc[housing_df[level_col].eq("County")].copy()
    county_rows = deduplicate_geographic_rows(
        county_rows, location_col, year_col, level_col, "County"
    )
    excluded_columns = {
        location_col,
        level_col,
        year_col,
        "Source",
        *_RATE_COLUMNS,
    }
    regional_frames = []
    for region_name, county_names in regions_mapping.items():
        region_counties = county_rows.loc[
            county_rows[location_col].isin(county_names)
        ]
        if region_counties.empty:
            continue
        aggregated = _aggregate_additive_columns(
            region_counties, year_col, excluded_columns
        )
        region_rows = aggregated.reindex(columns=housing_df.columns)
        region_rows[location_col] = region_name
        region_rows[level_col] = "Region"
        for rate_column in _RATE_COLUMNS & set(region_rows.columns):
            region_rows[rate_column] = float("nan")
        if "Source" in region_rows.columns:
            region_rows["Source"] = "Aggregated"
        regional_frames.append(region_rows)

    if not regional_frames:
        return pd.DataFrame(columns=housing_df.columns)
    return pd.concat(regional_frames, ignore_index=True).loc[:, housing_df.columns]


def add_regional_data(housing_df, regions_mapping):
    """Replace regional rows with recalculated county aggregates. Test file: scripts/unit_tests/pophousing/aggregation/test_regional_aggregation.py"""
    level_column = "Geographic Level"
    base_rows = remove_existing_geographic_level(
        housing_df, level_column, "Region"
    )
    regional_rows = build_regional_rows(
        base_rows,
        regions_mapping,
        "Location",
        level_column,
        "Year",
    )
    if regional_rows.empty:
        return base_rows

    result = pd.concat([base_rows, regional_rows], ignore_index=True)
    region_mask = result[level_column].eq("Region")
    return recalculate_housing_rates(result, region_mask)
