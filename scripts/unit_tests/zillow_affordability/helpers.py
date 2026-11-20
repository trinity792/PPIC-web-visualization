"""
helpers.py — synthetic Zillow affordability inputs and paths shared by the zillow_affordability tests.

Data sources:
    - scripts/zillow_affordability/config — the real source and schema configs the fixtures mirror

Outputs:
    - Raw Zillow-shaped CSVs and tmp-path path dicts for tests

Usage:
    from scripts.unit_tests.zillow_affordability.helpers import write_raw_files, make_paths

Test Folders:
    - scripts/unit_tests/zillow_affordability/
"""

from pathlib import Path

import pandas as pd

from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config

"""
========================================================================================================================
Constants
========================================================================================================================
"""

BUY_MONTHS = ["2012-01-31", "2012-02-29", "2012-03-31"]
RENT_MONTHS = ["2012-02-29", "2012-03-31"]
RELEASE_DATE = "2026-11-16"
ID_COLUMNS = ["RegionID", "SizeRank", "RegionName", "RegionType", "StateName"]

# Base value per series key, chosen so Total Monthly Payment > Mortgage Payment and the
# 30% identity holds (income = total * 12 / 0.30) for the 20% down scenario.
_SERIES_BASE = {
    "mortgage_payment_05": 1400.0,
    "mortgage_payment_10": 1300.0,
    "mortgage_payment_20": 1000.0,
    "total_monthly_payment_05": 1900.0,
    "total_monthly_payment_10": 1800.0,
    "total_monthly_payment_20": 1500.0,
    "new_homeowner_income_needed": 60000.0,
    "new_homeowner_affordability": 0.35,
    "affordable_price": 300000.0,
    "years_to_save": 9.5,
    "new_renter_income_needed": 50000.0,
    "new_renter_affordability": 0.28,
}

"""
========================================================================================================================
Builders
========================================================================================================================
"""


def raw_places():
    """Return (RegionName, RegionType, StateName) for the US, every expected CA metro, and one out-of-state metro."""
    schema = get_schema_config()
    places = [("United States", "country", None)]
    places += [(f"{name}, CA", "msa", "CA") for name in schema["expected_locations"] if name != "United States"]
    places.append(("New York, NY", "msa", "NY"))
    return places


def make_raw_frame(series_key, months, places=None, scale=1.0):
    """Build one wide Zillow-shaped frame: ID columns then one month-end column per month."""
    places = places or raw_places()
    base = _SERIES_BASE[series_key] * scale
    rows = []
    for index, (name, region_type, state) in enumerate(places):
        row = {
            "RegionID": 100000 + index,
            "SizeRank": index,
            "RegionName": name,
            "RegionType": region_type,
            "StateName": state,
        }
        for month in months:
            # Identity-preserving values: every series moves by the same factor per place.
            row[month] = base * (1 + index / 100)
        rows.append(row)
    return pd.DataFrame(rows, columns=[*ID_COLUMNS, *months])


def series_months(series_key):
    """Return the synthetic month columns for a series: renter files start later, like the real ones."""
    return RENT_MONTHS if "renter" in series_key else BUY_MONTHS


def write_raw_files(directory, scale=1.0, overrides=None):
    """
    Write all 12 synthetic Zillow files into a directory under their real Zillow filenames.

    Args:
        directory: destination folder (created if missing)
        scale: multiplier applied to every value, to simulate a revised release
        overrides: optional {series_key: DataFrame} replacing a generated frame

    Returns:
        dict of series key -> written Path.
    """
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    overrides = overrides or {}
    written = {}
    for series in get_source_config()["series"]:
        key = series["key"]
        frame = overrides.get(key)
        if frame is None:
            frame = make_raw_frame(key, series_months(key), scale=scale)
        path = directory / series["filename"]
        frame.to_csv(path, index=False)
        written[key] = path
    return written


def make_paths(tmp_path):
    """Return a get_paths()-shaped dict rooted under a pytest tmp_path."""
    tmp_path = Path(tmp_path)
    cleaned = tmp_path / "data-cleaned" / "zillow-affordability"
    raw = tmp_path / "data-raw" / "zillow-affordability"
    return {
        "project_root": tmp_path,
        "current_data_path": cleaned / "ZillowAffordability_Current.csv",
        "snapshot_directory": cleaned / "snapshots",
        "download_directory": raw,
        "manual_directory": raw / "manual",
        "archive_directory": tmp_path / "archive" / "zillow-affordability",
        "logs_directory": tmp_path / "logs",
    }
