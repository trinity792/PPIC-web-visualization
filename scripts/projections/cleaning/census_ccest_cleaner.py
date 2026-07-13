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

from scripts.shared.logging.pipeline_logging import log_message

# ── Constants ─────────────────────────────────────────────────────────────────

_IDENTIFIER_COLUMNS = ["SUMLEV", "STATE", "COUNTY", "STNAME", "CTYNAME", "YEAR", "AGEGRP"]
_COUNTY_SUMMARY_LEVEL = 50
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
    # Census PEP files are Latin-1 encoded (accented county names such as
    # "Doña Ana" contain bytes that are invalid UTF-8), so decode as latin-1.
    df = pd.read_csv(csv_path, encoding="latin-1")
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


def reshape_ccest_to_long(df, schema_config, logger=None):
    """Reshape the official wide cc-est data to the canonical long format. Test file: scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py

    Value-level drift is tolerated (B2). The Census YEAR code decodes by a stable
    arithmetic law (calendar = base + code), so a new vintage ingests
    automatically (A2 derive-and-accept); YEAR=base (the April-2020 base) is a
    semantic exclusion, and any code decoding outside the sane range, an unknown
    AGEGRP code, or an unrecognized race-column prefix is dropped with a logged
    note rather than discarding the whole file. A genuine loss of a whole state is
    still caught downstream by the strict completeness gate (fail-closed).
    """
    race_map = schema_config["census_race_code_map"]
    sex_map = schema_config["sex_label_map"]
    year_base = schema_config["census_year_base"]
    base_year_code = schema_config["census_base_year_code"]
    sane_min, sane_max = schema_config["census_year_sane_range"]
    age_map = schema_config["census_age_group_code_map"]
    id_columns = ["Location", "Year", "Age Group"]

    value_columns = []
    column_race_sex = {}
    skipped_prefixes = set()
    for column in df.columns:
        if column in id_columns or "_" not in column:
            continue
        prefix, _, suffix = column.rpartition("_")
        if suffix not in sex_map:
            continue
        if prefix in _TOTAL_COLUMN_PREFIXES:
            continue
        if prefix not in race_map:
            skipped_prefixes.add(prefix)
            continue
        value_columns.append(column)
        column_race_sex[column] = (race_map[prefix], sex_map[suffix])
    if skipped_prefixes:
        log_message(logger, "Skipped unrecognized cc-est race column prefix(es)", prefixes=sorted(skipped_prefixes))

    # Exclude the April-2020 base year and the AGEGRP=0 all-ages total; both are
    # semantic exclusions, not decode gaps.
    work = df[(df["Year"] != base_year_code) & (df["Age Group"] != _TOTAL_AGE_CODE)]
    melted = work.melt(
        id_vars=id_columns,
        value_vars=value_columns,
        var_name="_race_sex",
        value_name="Population",
    )
    melted["Race/Ethnicity"] = melted["_race_sex"].map(lambda column: column_race_sex[column][0])
    melted["Sex"] = melted["_race_sex"].map(lambda column: column_race_sex[column][1])

    # Derive calendar year arithmetically, then quarantine any code whose decoded
    # year falls outside the sane window (B2 drop-and-log).
    melted["Year"] = year_base + melted["Year"]
    out_of_range = sorted(set(melted.loc[(melted["Year"] < sane_min) | (melted["Year"] > sane_max), "Year"]))
    if out_of_range:
        log_message(logger, "Dropped cc-est rows with out-of-range decoded year(s)", years=out_of_range)
        melted = melted[(melted["Year"] >= sane_min) & (melted["Year"] <= sane_max)]

    unknown_ages = sorted(set(melted["Age Group"]) - set(age_map))
    if unknown_ages:
        log_message(logger, "Dropped cc-est rows with unknown AGEGRP code(s)", codes=unknown_ages)
        melted = melted[melted["Age Group"].isin(age_map)]

    melted["Age Group"] = melted["Age Group"].map(age_map)
    return melted[["Location", "Year", "Age Group", "Sex", "Race/Ethnicity", "Population"]].reset_index(drop=True)


def clean_census_estimates(csv_path, schema_config, logger=None):
    """Full cc-est cleaner entry point: parse, aggregate to states, rename, reshape, and tag. Test file: scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py"""
    parsed = parse_ccest_csv(csv_path, schema_config)
    aggregated = aggregate_ccest_counties_to_states(parsed, schema_config)
    renamed = rename_ccest_columns(aggregated, schema_config)
    reshaped = reshape_ccest_to_long(renamed, schema_config, logger)

    reshaped["Geographic Level"] = "US State"
    return reshaped[_CLEANING_OUTPUT_COLUMNS].reset_index(drop=True)
