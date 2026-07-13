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
    # Note: the trailing space in "San " is the discriminator DoF's export uses for
    # San Bernardino versus the bare "San" stubs (San Francisco / San Joaquin), so
    # the keys are matched exactly rather than whitespace-normalized.
    basic_mapping = {
        "Contra ": "Contra Costa",
        "Los": "Los Angeles",
        "San ": "San Bernardino",
        "San Luis": "San Luis Obispo",
    }
    if repair_mapping:
        basic_mapping.update(repair_mapping)
    result["Location"] = result["Location"].replace(basic_mapping)

    # The remaining bare stubs are assigned by position, valid only because DoF
    # lists counties alphabetically within each year block. Verify the expected
    # count of each stub before assigning so a layout, ordering, or count shift in
    # the E-6 export fails loudly instead of silently mislabeling a county (guide
    # A2). A failed repair drops the DoF pull to the fallback cascade rather than
    # writing mislabeled rows.
    positional_repairs = (
        ("San", ["San Francisco", "San Joaquin"]),
        ("Santa", ["Santa Barbara", "Santa Clara"]),
    )
    for stub, expected_names in positional_repairs:
        stub_indexes = result.index[result["Location"].eq(stub)].tolist()
        if stub_indexes and len(stub_indexes) != len(expected_names):
            raise ValueError(
                f"Expected {len(expected_names)} truncated '{stub}' county rows in E-6 data, "
                f"found {len(stub_indexes)} — E-6 layout may have changed"
            )
        for index, county_name in zip(stub_indexes, expected_names):
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
    # Each county name appears once at the top of its year block; the rows beneath it
    # carry a blank location. Forward-fill bounded by the next non-null name rather
    # than by a fixed year span, so a location with a shorter or longer series is
    # handled correctly instead of over-running into the next block (guide B3).
    result[location_col] = result[location_col].ffill()
    # A missing/blank name row would merge two blocks under one location, producing a
    # duplicate (location, year). Footnote rows have no valid year, so restricting the
    # check to rows with a numeric year keeps it loud but footnote-safe.
    year_labeled = result.loc[result[year_col].notna()]
    duplicated = year_labeled.duplicated(subset=[location_col, year_col], keep=False)
    if duplicated.any():
        offending = sorted(year_labeled.loc[duplicated, location_col].dropna().unique())
        raise ValueError(f"E-6 year blocks overlap for locations: {', '.join(map(str, offending))}")
    return result


def clean_e6(raw_e6_df, columns_config, geography_config):
    """Clean raw DoF E-6 data into canonical Components records. Test file: scripts/unit_tests/components_of_change/cleaning/test_e6_cleaner.py"""
    result = normalize_e6_columns(raw_e6_df, columns_config["canonical_columns"])
    result = repair_truncated_county_names(result)
    result = forward_fill_locations_by_year_block(result, "Location", "Year")
    # Drop each location's own earliest year (its percent change has no prior year to
    # difference against); computing the minimum per location keeps this correct even
    # if DoF ever ships a location with a different start year (guide A7). The dropped
    # year is a rolling-window edge supplied by saved history downstream.
    earliest_year_by_location = result.groupby("Location")["Year"].transform("min")
    result = result.loc[result["Year"].ne(earliest_year_by_location)].copy()
    yuba_indexes = result.index[result["Location"].eq("Yuba")]
    if yuba_indexes.empty:
        raise ValueError("Could not find final Yuba row in E-6 data")
    # Scope the drop to the columns that define a real row so a county-year with a
    # single blank component survives with that field null, rather than the whole row
    # being discarded (guide B2). Trailing footnote rows lack a Location or Year.
    result = result.loc[: yuba_indexes[-1]].dropna(subset=["Location", "Year"]).reset_index(drop=True)
    result = coerce_numeric_columns(result, columns_config["numeric_columns"])
    result["Year"] = pd.to_numeric(result["Year"], errors="raise").astype(int)
    result = add_crude_rates(result, "Total Population", columns_config["crude_rate_component_map"])
    result["Source"] = "DoF"
    result["Location"] = result["Location"].replace({geography_config["state_name"]: geography_config["california_abbreviation"]})
    result = add_regional_data(result, geography_config["regions_mapping"], columns_config)
    return result.reset_index(drop=True)
