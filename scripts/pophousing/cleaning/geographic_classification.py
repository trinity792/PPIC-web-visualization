"""
geographic_classification.py — classifies and normalizes geographic rows in DoF E-5 housing data.

Data sources:
    - pandas.DataFrame inputs — cleaned E-5 locations, county context, and population values
    - lib/pophousing_config.py — California geography names and classification settings

Outputs:
    - geographic level strings — row-level classification results
    - pandas.DataFrame — records with normalized geographic levels and helper rows removed

Usage:
    python scripts/pophousing/cleaning/geographic_classification.py

Test Folders:
    - scripts/unit_tests/pophousing/cleaning/
"""

import pandas as pd

from scripts.pophousing.config.geography import get_geography_config

"""
========================================================================================================================
Geographic Classification
========================================================================================================================
"""


def classify_ambiguous_location(location, county_context, population, config):
    """Classify an ambiguous California location using row context. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    # NOTE: A prior ten-row "County Total" lookahead was removed (refactor guide
    # A5): the E-5 hierarchy already promotes County/State rows via resolve_county_
    # total_rows/normalize_state_total_rows before this runs, so the neighbor scan
    # was redundant in the wired path. To restore it, pass the frame and the row
    # index in, find the row's position, and return "County" when any of the next
    # ten Location values equals "County Total".
    if location == "County Total":
        return "County"
    if location == "State Total":
        return "State"
    if location in config["town_names"]:
        return "Town"
    if (
        location == "San Joaquin"
        and county_context == "San Joaquin"
        and pd.notna(population)
        and float(population)
        >= config["san_joaquin_county_population_threshold"]
    ):
        return "County"
    return config["default_level"]


def assign_geographic_level_with_context(location, county_context, population, housing_row, geography_config):
    """Assign a geographic level from configured names and context. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    if location == "State Total" or location == geography_config["state_name"]:
        return "State"
    if location in geography_config["region_names"]:
        return "Region"
    if location == "County Total":
        return "County"
    if location in geography_config["town_names"]:
        return "Town"
    if location in geography_config["ambiguous_city_names"]:
        return classify_ambiguous_location(
            location, county_context, population, geography_config
        )
    return geography_config["default_level"]


def resolve_county_total_rows(housing_df, location_col, temp_county_col):
    """Replace county-total labels with their county context. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    missing_columns = [
        column
        for column in (location_col, temp_county_col)
        if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    if "Geographic Level" not in result.columns:
        result["Geographic Level"] = pd.NA
    total_rows = result[location_col].eq("County Total")
    resolvable_rows = total_rows & result[temp_county_col].notna()
    result.loc[resolvable_rows, location_col] = result.loc[
        resolvable_rows, temp_county_col
    ]
    result.loc[resolvable_rows, "Geographic Level"] = "County"
    return result


def normalize_state_total_rows(housing_df, location_col, state_name):
    """Normalize state-total labels and levels. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    result = housing_df.copy()
    if "Geographic Level" not in result.columns:
        result["Geographic Level"] = pd.NA
    state_total_rows = result[location_col].eq("State Total")
    result.loc[state_total_rows, location_col] = state_name
    result.loc[state_total_rows, "Geographic Level"] = "State"
    return result


def assign_missing_geographic_levels(
    housing_df, classifier_fn, location_col, county_col, population_col, level_col, geography_config=None
):
    """Classify rows whose geographic level is missing. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    required_columns = [location_col, population_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    if level_col not in result.columns:
        result[level_col] = pd.NA
    # Build config once and pass it through, rather than rebuilding it per row (A6).
    if geography_config is None:
        geography_config = get_geography_config()

    missing_level_rows = result[level_col].isna() | result[level_col].eq("")
    if not missing_level_rows.any():
        return result

    locations = result.loc[missing_level_rows, location_col]
    state_name = geography_config["state_name"]
    region_names = set(geography_config["region_names"])
    town_names = set(geography_config["town_names"])
    ambiguous_names = set(geography_config["ambiguous_city_names"])
    default_level = geography_config["default_level"]

    # Vectorize the unambiguous cascade (parity with assign_geographic_level_with_
    # context: State/Region/County/Town/default), which is boolean-mask work over the
    # bulk of rows. Only genuinely ambiguous names — a small minority after the
    # county/state promotion — fall through to the per-row classifier (B6).
    levels = pd.Series(default_level, index=locations.index, dtype="object")
    levels = levels.mask(locations.isin(town_names), "Town")
    levels = levels.mask(locations.eq("County Total"), "County")
    levels = levels.mask(locations.isin(region_names), "Region")
    levels = levels.mask(locations.eq("State Total") | locations.eq(state_name), "State")

    ambiguous_rows = locations.isin(ambiguous_names)
    for row_index in locations.index[ambiguous_rows]:
        row = result.loc[row_index]
        levels.at[row_index] = classifier_fn(
            row[location_col],
            row.get(county_col),
            row[population_col],
            row,
            geography_config,
        )

    result.loc[missing_level_rows, level_col] = levels
    return result


def apply_town_overrides(housing_df, town_list, location_col, level_col):
    """Force configured towns to use the Town level. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    missing_columns = [
        column for column in (location_col, level_col) if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    result.loc[result[location_col].isin(town_list), level_col] = "Town"
    return result


def sanitize_geographic_levels(housing_df, valid_levels, default_level):
    """Replace invalid geographic levels with the configured default. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    level_col = "Geographic Level"
    if level_col not in housing_df.columns:
        raise KeyError(f"Missing column: {level_col}")

    result = housing_df.copy()
    valid_level_rows = result[level_col].isin(valid_levels)
    result.loc[~valid_level_rows, level_col] = default_level
    return result


def remove_balance_rows(housing_df, location_col):
    """Remove balance-of-area summary rows. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    balance_rows = housing_df[location_col].astype("string").str.contains(
        r"^Balance of ", case=False, na=False, regex=True
    )
    return housing_df.loc[~balance_rows].copy().reset_index(drop=True)


def drop_helper_columns(housing_df, columns):
    """Drop temporary columns that exist in the dataframe. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    existing_columns = [column for column in columns if column in housing_df.columns]
    return housing_df.drop(columns=existing_columns).copy()


def standardize_san_francisco_classification(housing_df, location_col, level_col):
    """Represent San Francisco as both City and County rows. Test file: scripts/unit_tests/pophousing/cleaning/test_geographic_classification.py"""
    missing_columns = [
        column for column in (location_col, level_col) if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    san_francisco_rows = result[location_col].eq("San Francisco")
    if not san_francisco_rows.any():
        return result

    san_francisco = result.loc[san_francisco_rows].copy()
    # San Francisco is a consolidated city-county, so there is exactly one true
    # record per year. A boundary-year merge can leave two SF rows that differ
    # only in level/source (e.g. an E-8 City row from history and an E-5 County
    # row from the modern file); collapse to one canonical record per year -
    # preferring the higher-priority source - before emitting the City and County
    # copies, so SF never expands past two rows per year.
    year_col = "Year"
    source_col = "Source"
    if source_col in san_francisco.columns:
        source_rank = {"E-5": 0, "E-8": 1, "Aggregated": 2}
        san_francisco["_sf_source_rank"] = (
            san_francisco[source_col].map(source_rank).fillna(len(source_rank))
        )
        san_francisco = san_francisco.sort_values("_sf_source_rank", kind="stable")
    dedup_subset = (
        [year_col]
        if year_col in san_francisco.columns
        else [column for column in san_francisco.columns if column != level_col]
    )
    san_francisco = san_francisco.drop_duplicates(
        subset=dedup_subset, keep="first"
    ).drop(columns=["_sf_source_rank"], errors="ignore")

    city_rows = san_francisco.copy()
    city_rows[level_col] = "City"
    county_rows = san_francisco.copy()
    county_rows[level_col] = "County"
    return pd.concat(
        [result.loc[~san_francisco_rows], city_rows, county_rows],
        ignore_index=True,
    ).reset_index(drop=True)
