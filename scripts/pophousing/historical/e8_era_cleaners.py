"""
e8_era_cleaners.py — cleans the three historical DoF E-8 workbook eras into canonical housing rows.

Data sources:
    - pandas.DataFrame inputs — raw E-8 worksheets for 1990-2000, 2000-2010, and 2010-2020
    - lib/pophousing_config.py — California geography and E-5/E-8 schema settings

Outputs:
    - pandas.DataFrame — cleaned, classified records for each historical workbook era

Usage:
    python scripts/pophousing/historical/e8_era_cleaners.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

import pandas as pd

from scripts.pophousing.calculations.housing_metrics import add_housing_derived_columns
from scripts.pophousing.cleaning.e5_schema_normalizer import rename_e5_schema
from scripts.pophousing.cleaning.geographic_classification import (
    apply_town_overrides,
    assign_geographic_level_with_context,
    assign_missing_geographic_levels,
    drop_helper_columns,
    normalize_state_total_rows,
    remove_balance_rows,
    resolve_county_total_rows,
    sanitize_geographic_levels,
)
from scripts.pophousing.cleaning.hierarchical_location_cleaning import (
    build_county_context_column,
    forward_fill_locations_with_context,
    identify_county_headers,
)
from scripts.pophousing.cleaning.location_standardization import standardize_location_column
from scripts.pophousing.config.geography import get_geography_config
from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.historical.e8_schema_normalizer import normalize_e8_columns
from scripts.shared.data_cleaning.dataframe_operations import forward_fill_columns
from scripts.shared.data_cleaning.row_filters import (
    drop_empty_rows_without_data,
    remove_header_like_rows,
    remove_summary_rows,
)
from scripts.shared.data_cleaning.type_conversions import coerce_numeric_columns

"""
========================================================================================================================
Era Column Layouts
========================================================================================================================
"""

# The 1990-2000 and 2000-2010 workbooks share a single-column hierarchical
# layout: one "Location" column holding county headers, "County Total"/"State
# Total" summary rows, and city names, followed by the annual data columns.
# Some workbooks include an explicit "Vacant Units" column (13 wide); others
# derive it from Total Housing Units minus Occupied Units (12 wide).
_OLD_FORMAT_COLUMNS_12 = [
    "Location",
    "Year",
    "Total Population",
    "Household Population",
    "Group Quarters Population",
    "Total Housing Units",
    "Single Family Units",
    "Multiple Family Units",
    "Mobile Homes",
    "Occupied Units",
    "Vacancy Rate (%)",
    "Persons Per Household",
]
_OLD_FORMAT_COLUMNS_13 = [
    "Location",
    "Year",
    "Total Population",
    "Household Population",
    "Group Quarters Population",
    "Total Housing Units",
    "Single Family Units",
    "Multiple Family Units",
    "Mobile Homes",
    "Occupied Units",
    "Vacant Units",
    "Vacancy Rate (%)",
    "Persons Per Household",
]

_BLANK_LOCATION_VALUES = {"", "nan", "none"}

"""
========================================================================================================================
Era-Specific Cleaning
========================================================================================================================
"""


def clean_1990_2000(raw_e8_df):
    """Clean the single-column 1990-2000 E-8 layout. Test file: scripts/unit_tests/pophousing/historical/test_e8_era_cleaners.py"""
    return _clean_old_format(raw_e8_df)


def clean_2000_2010(raw_e8_df):
    """Clean the 2000-2010 E-8 layout, which matches the 1990-2000 structure. Test file: scripts/unit_tests/pophousing/historical/test_e8_era_cleaners.py"""
    return _clean_old_format(raw_e8_df)


def clean_2010_2020(raw_e8_df):
    """Clean the 2010-2020 E-8 layout, which mirrors the modern E-5 workbook. Test file: scripts/unit_tests/pophousing/historical/test_e8_era_cleaners.py"""
    schema_config = get_schema_config()
    geography_config = get_geography_config()

    housing_df = normalize_e8_columns(
        raw_e8_df, {"column_names": schema_config["e5_column_names"]}
    )
    housing_df = rename_e5_schema(housing_df, schema_config["raw_column_mapping"])
    housing_df = forward_fill_columns(housing_df, ["County"])
    housing_df = remove_summary_rows(
        housing_df,
        "Location",
        schema_config["summary_keep_values"],
        schema_config["summary_patterns"],
    )
    housing_df = remove_header_like_rows(
        housing_df, "Location", schema_config["header_patterns"]
    )
    housing_df = forward_fill_locations_with_context(housing_df, "Location", "County")
    housing_df = drop_empty_rows_without_data(
        housing_df, "Location", schema_config["meaningful_data_columns"]
    )
    housing_df = build_county_context_column(
        housing_df, "Location", "County", "_temp_county"
    )
    # Keep the raw date in the Year column so standardization can drop census
    # (April 1) rows; the year is extracted there once census rows are removed.
    housing_df = housing_df.rename(
        columns={schema_config["date_column"]: schema_config["year_column"]}
    )
    housing_df = coerce_numeric_columns(housing_df, schema_config["numeric_columns"])
    housing_df[schema_config["zero_fill_columns"]] = housing_df[
        schema_config["zero_fill_columns"]
    ].fillna(0)
    housing_df = add_housing_derived_columns(housing_df)
    housing_df = _classify_and_standardize(
        housing_df, geography_config, county_context_col="_temp_county"
    )
    return drop_helper_columns(housing_df, ["County", "_temp_county"])


"""
========================================================================================================================
Old-Format Helpers
========================================================================================================================
"""


def _clean_old_format(raw_e8_df):
    """Flatten a single-column hierarchical E-8 layout into canonical rows. Test file: scripts/unit_tests/pophousing/historical/test_e8_era_cleaners.py"""
    schema_config = get_schema_config()
    geography_config = get_geography_config()
    county_names = geography_config["county_names"]
    state_name = geography_config["state_name"]

    column_names = (
        _OLD_FORMAT_COLUMNS_13
        if len(raw_e8_df.columns) >= len(_OLD_FORMAT_COLUMNS_13)
        else _OLD_FORMAT_COLUMNS_12
    )
    housing_df = normalize_e8_columns(raw_e8_df, {"column_names": column_names})

    locations = housing_df["Location"].astype("string").str.strip()
    housing_df["Location"] = locations.mask(
        locations.str.lower().isin(_BLANK_LOCATION_VALUES)
    )

    numeric_columns = [
        column for column in column_names if column not in ("Location", "Year")
    ]
    housing_df = coerce_numeric_columns(housing_df, numeric_columns)
    if "Vacant Units" not in housing_df.columns:
        housing_df["Vacant Units"] = housing_df["Total Housing Units"].fillna(
            0
        ) - housing_df["Occupied Units"].fillna(0)

    # Record the county owning each block, then drop the county-header label
    # rows so only "County Total", state, and city/town rows remain.
    header_indices = identify_county_headers(housing_df, county_names, "Location")
    housing_df = _attach_block_county(
        housing_df, header_indices, "Location", "County", state_name
    )
    housing_df = housing_df.drop(index=list(header_indices)).reset_index(drop=True)

    housing_df = forward_fill_locations_with_context(housing_df, "Location", "County")
    housing_df = drop_empty_rows_without_data(
        housing_df, "Location", schema_config["meaningful_data_columns"]
    )
    housing_df = _classify_and_standardize(
        housing_df, geography_config, county_context_col="County"
    )
    return drop_helper_columns(housing_df, ["County"])


def _attach_block_county(housing_df, header_indices, location_col, county_col, state_name):
    """Forward-fill the parent county of each row from county-header rows. Test file: scripts/unit_tests/pophousing/historical/test_e8_era_cleaners.py"""
    result = housing_df.copy()
    current_county = pd.NA
    block_counties = []
    for row_index, location in result[location_col].items():
        text = "" if pd.isna(location) else str(location).strip()
        if row_index in header_indices:
            current_county = text
        elif text in (state_name, "State Total"):
            current_county = pd.NA
        block_counties.append(current_county)
    result[county_col] = block_counties
    return result


def _classify_and_standardize(housing_df, geography_config, county_context_col):
    """Resolve summary rows, classify levels, and standardize names. Test file: scripts/unit_tests/pophousing/historical/test_e8_era_cleaners.py"""
    housing_df = resolve_county_total_rows(housing_df, "Location", county_context_col)
    housing_df = normalize_state_total_rows(
        housing_df, "Location", geography_config["state_name"]
    )
    housing_df = assign_missing_geographic_levels(
        housing_df,
        assign_geographic_level_with_context,
        "Location",
        county_context_col,
        "Total Population",
        "Geographic Level",
    )
    housing_df = apply_town_overrides(
        housing_df, geography_config["town_names"], "Location", "Geographic Level"
    )
    housing_df = sanitize_geographic_levels(
        housing_df,
        geography_config["valid_levels"],
        geography_config["default_level"],
    )
    housing_df = standardize_location_column(
        housing_df, "Location", "Geographic Level", ("City", "Town")
    )
    return remove_balance_rows(housing_df, "Location")
