"""
reshape_series.py — turns the 12 wide Zillow files into one long table on (Location, Date, Housing Scenario).

Data sources:
    - data/data-raw/zillow-affordability/*.csv — raw Zillow files (live or manual)
    - scripts/zillow_affordability/config — source and schema configs

Outputs:
    - pandas.DataFrame — contract-shaped table with Release Date stamped

Usage:
    from scripts.zillow_affordability.cleaning.reshape_series import build_cleaned_dataset

Test Folders:
    - scripts/unit_tests/zillow_affordability/cleaning/
"""

import re
from functools import reduce

import pandas as pd

"""
========================================================================================================================
Constants
========================================================================================================================
"""

ID_COLUMNS = ["RegionID", "SizeRank", "RegionName", "RegionType", "StateName"]
_MONTH_COLUMN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LONG_KEYS = ["Geographic Level", "Location", "Date", "Housing Scenario"]

"""
========================================================================================================================
Per-file Steps
========================================================================================================================
"""


def read_series_file(path):
    """Read one Zillow CSV, keeping ID and month-end columns; raise ValueError if ID columns or month columns are missing. Test file: scripts/unit_tests/zillow_affordability/cleaning/test_reshape_series.py"""
    raw = pd.read_csv(path)
    missing = [column for column in ID_COLUMNS if column not in raw.columns]
    if missing:
        raise ValueError(f"{path} is missing Zillow ID columns: {missing}")
    months = [column for column in raw.columns if _MONTH_COLUMN.match(str(column))]
    if not months:
        raise ValueError(f"{path} has no month columns (expected YYYY-MM-DD headers)")
    return raw[[*ID_COLUMNS, *months]]


def select_places(raw, schema_config):
    """Keep California metros and the national row. Test file: scripts/unit_tests/zillow_affordability/cleaning/test_reshape_series.py"""
    is_state_metro = (raw["RegionType"] == "msa") & (raw["StateName"] == schema_config["state_code"])
    is_nation = raw["RegionType"] == "country"
    return raw[is_state_metro | is_nation].copy()


def melt_series(selected, column, scenario, schema_config):
    """
    Melt one series from wide months into long rows on the contract grain.

    Location drops the ", CA" suffix; Date becomes YYYY-MM; blank cells stay NaN (never 0).

    Returns:
        DataFrame with Geographic Level, Location, Date, Housing Scenario, and the measure column.

    Test file:
        scripts/unit_tests/zillow_affordability/cleaning/test_reshape_series.py
    """
    months = [name for name in selected.columns if name not in ID_COLUMNS]
    long_rows = selected.melt(id_vars=["RegionName", "RegionType"], value_vars=months, var_name="Month", value_name=column)
    suffix = schema_config["state_suffix"]
    long_rows["Location"] = long_rows["RegionName"].str.removesuffix(suffix)
    long_rows["Geographic Level"] = long_rows["RegionType"].map(schema_config["geographic_level_map"])
    long_rows["Date"] = long_rows["Month"].str.slice(0, 7)
    long_rows["Housing Scenario"] = scenario
    return long_rows[[*_LONG_KEYS, column]]


"""
========================================================================================================================
Combine
========================================================================================================================
"""


def _missing_places(long_rows, schema_config):
    """Return expected locations absent from one series."""
    return sorted(set(schema_config["expected_locations"]) - set(long_rows["Location"]))


def build_cleaned_dataset(files, release_date, source_config, schema_config):
    """
    Read, select, and melt every series, join them onto the grain, and stamp the release date.

    Series sharing a scenario are outer-joined on the grain; scenarios are then stacked. A
    measure a scenario does not have is added as an all-blank column.

    Args:
        files: {series key: Path}
        release_date: YYYY-MM-DD release the files came from
        source_config: get_source_config() output
        schema_config: get_schema_config() output

    Returns:
        DataFrame with the contract's output columns.

    Raises:
        ValueError: a series is missing an expected place (renamed or dropped by Zillow)

    Test file:
        scripts/unit_tests/zillow_affordability/cleaning/test_reshape_series.py
    """
    by_scenario = {}
    for series in source_config["series"]:
        selected = select_places(read_series_file(files[series["key"]]), schema_config)
        long_rows = melt_series(selected, series["column"], series["scenario"], schema_config)
        missing = _missing_places(long_rows, schema_config)
        if missing:
            raise ValueError(f"series {series['key']} is missing expected places: {', '.join(missing)}")
        by_scenario.setdefault(series["scenario"], []).append(long_rows)

    scenario_frames = [reduce(lambda left, right: left.merge(right, on=_LONG_KEYS, how="outer"), frames) for frames in by_scenario.values()]
    combined = pd.concat(scenario_frames, ignore_index=True)
    for column in schema_config["measure_columns"]:
        if column not in combined.columns:
            combined[column] = float("nan")
    combined["Release Date"] = release_date
    return combined[schema_config["output_columns"]]
