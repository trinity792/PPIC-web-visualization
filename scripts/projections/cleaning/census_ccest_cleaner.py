"""
census_ccest_cleaner.py — cleans and reshapes Census Bureau cc-est demographic estimate files.

Data sources:
    - {download_directory}/cc-est_{FILENAME}.csv — official wide-format
      CC-EST{VINTAGE}-ALLDATA CSV

The raw file contains one row per county, coded year, and coded age group. Race
and sex populations are stored in wide columns. The cleaner uses the mutually
exclusive non-Hispanic race fields (NHWA, NHBA, NHIA, NHAA, NHNA, NHTOM) plus
Hispanic-of-any-race (H), each split into MALE and FEMALE columns.

Only SUMLEV=050 county observations are used. Before reshaping, the cleaner sums
the 14 selected population columns by (STNAME, YEAR, AGEGRP), excludes District of
Columbia and Puerto Rico, and validates that all configured states are present.
YEAR=1 (April 2020 base) and AGEGRP=0 (Census total) rows are excluded.

Outputs:
    - pandas.DataFrame — cleaned long-format `US State` rows matching the
      canonical cleaning-stage schema

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

import pandas as pd

# ── Constants ─────────────────────────────────────────────────────────────────

_IDENTIFIER_COLUMNS = ["SUMLEV", "STATE", "COUNTY", "STNAME", "CTYNAME", "YEAR", "AGEGRP"]
_COUNTY_SUMMARY_LEVEL = 50
_BASE_YEAR_CODE = 1
_TOTAL_AGE_CODE = 0
# Census wide totals share the MALE/FEMALE suffix but are not race strata.
_TOTAL_COLUMN_PREFIXES = {"TOT"}

_CLEANING_OUTPUT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
]

"""
========================================================================================================================
Parsing and Reshaping
========================================================================================================================
"""


def parse_ccest_csv(csv_path, schema_config):
    """Read the raw cc-est CSV and return a DataFrame with validated headers. Test file: scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py"""
    df = pd.read_csv(csv_path)
    required = schema_config["ccest_raw_columns"]
    missing = [column for column in required if column not in df.columns]
    if missing:
        raise ValueError(f"cc-est CSV is missing required column(s): {', '.join(missing)}")
    return df


def aggregate_ccest_counties_to_states(df, schema_config):
    """Aggregate official CC-EST county observations into the configured state totals. Test file: scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py"""
    raw_columns = schema_config["ccest_raw_columns"]
    population_columns = [column for column in raw_columns if column not in _IDENTIFIER_COLUMNS]
    state_names = schema_config["census_state_names"]

    counties = df[df["SUMLEV"] == _COUNTY_SUMMARY_LEVEL]
    counties = counties[counties["STNAME"].isin(state_names)]

    observed_states = set(counties["STNAME"])
    missing = [state for state in state_names if state not in observed_states]
    if missing:
        raise ValueError(f"cc-est data is missing required state(s): {', '.join(missing)}")

    return counties.groupby(["STNAME", "YEAR", "AGEGRP"], as_index=False)[population_columns].sum()


def rename_ccest_columns(df, schema_config):
    """Rename aggregated cc-est headers to canonical pipeline names via the configured map. Test file: scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py"""
    rename_map = schema_config["census_rename_map"]
    missing = [source for source in rename_map if source not in df.columns]
    if missing:
        raise ValueError(f"cc-est data is missing configured header(s): {', '.join(missing)}")
    return df.rename(columns=rename_map)


def reshape_ccest_to_long(df, schema_config):
    """Reshape the official wide cc-est data to the canonical long format. Test file: scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py"""
    race_map = schema_config["census_race_code_map"]
    sex_map = schema_config["sex_label_map"]
    year_map = schema_config["census_year_code_map"]
    age_map = schema_config["census_age_group_code_map"]
    id_columns = ["Location", "Year", "Age Group"]

    value_columns = []
    column_race_sex = {}
    for column in df.columns:
        if column in id_columns or "_" not in column:
            continue
        prefix, _, suffix = column.rpartition("_")
        if suffix not in sex_map:
            continue
        if prefix in _TOTAL_COLUMN_PREFIXES:
            continue
        if prefix not in race_map:
            raise ValueError(f"Unmapped cc-est race column prefix: {prefix} (column {column})")
        value_columns.append(column)
        column_race_sex[column] = (race_map[prefix], sex_map[suffix])

    work = df[(df["Year"] != _BASE_YEAR_CODE) & (df["Age Group"] != _TOTAL_AGE_CODE)]
    melted = work.melt(
        id_vars=id_columns,
        value_vars=value_columns,
        var_name="_race_sex",
        value_name="Population",
    )
    melted["Race/Ethnicity"] = melted["_race_sex"].map(lambda column: column_race_sex[column][0])
    melted["Sex"] = melted["_race_sex"].map(lambda column: column_race_sex[column][1])

    unknown_years = sorted(set(melted["Year"]) - set(year_map))
    if unknown_years:
        raise ValueError(f"Unknown cc-est YEAR code(s): {unknown_years}")
    unknown_ages = sorted(set(melted["Age Group"]) - set(age_map))
    if unknown_ages:
        raise ValueError(f"Unknown cc-est AGEGRP code(s): {unknown_ages}")

    melted["Year"] = melted["Year"].map(year_map)
    melted["Age Group"] = melted["Age Group"].map(age_map)
    return melted[["Location", "Year", "Age Group", "Sex", "Race/Ethnicity", "Population"]].reset_index(drop=True)


def clean_census_estimates(csv_path, schema_config):
    """Full cc-est cleaner entry point: parse, aggregate to states, rename, reshape, and tag. Test file: scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py"""
    parsed = parse_ccest_csv(csv_path, schema_config)
    aggregated = aggregate_ccest_counties_to_states(parsed, schema_config)
    renamed = rename_ccest_columns(aggregated, schema_config)
    reshaped = reshape_ccest_to_long(renamed, schema_config)

    reshaped["Geographic Level"] = "US State"
    return reshaped[_CLEANING_OUTPUT_COLUMNS].reset_index(drop=True)
