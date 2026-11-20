"""
historical_merge.py — loads the saved Zillow Affordability table, decides whether a release is new, and summarizes revisions.

Data sources:
    - data/data-cleaned/zillow-affordability/ZillowAffordability_Current.csv — last saved table

Outputs:
    - pandas.DataFrame or None — the saved table
    - bool — whether a build differs from the saved table
    - dict — shared revision diff (added months, changed cells)

Usage:
    from scripts.zillow_affordability.merging.historical_merge import detect_new_data

Test Folders:
    - scripts/unit_tests/zillow_affordability/merging/
"""

import pandas as pd

from scripts.shared.logging.revision_diff import diff_revisions

"""
========================================================================================================================
Load
========================================================================================================================
"""

_TEXT_COLUMNS = ["Release Date", "Geographic Level", "Location", "Date", "Housing Scenario"]


def load_current_dataset(paths):
    """Return the saved current table with its key columns read as text, or None when none is saved. Test file: scripts/unit_tests/zillow_affordability/merging/test_historical_merge.py"""
    path = paths["current_data_path"]
    if not path.is_file():
        return None
    return pd.read_csv(path, dtype={column: str for column in _TEXT_COLUMNS})


"""
========================================================================================================================
Change Detection
========================================================================================================================
"""


def _comparable(frame, schema_config):
    """Grain-sorted, Release-Date-free CSV text of a frame, insensitive to row order and dtype drift."""
    columns = [column for column in schema_config["output_columns"] if column != "Release Date"]
    ordered = frame[columns].sort_values(schema_config["grain_keys"]).reset_index(drop=True)
    return ordered.to_csv(index=False)


def detect_new_data(existing, new, schema_config):
    """
    Return True when there is no saved table or any grain key or measure differs.

    Release Date is ignored, so a release Zillow re-stamped without changing any value is not
    new data and the saved table (with its original release date) is kept.

    Test file:
        scripts/unit_tests/zillow_affordability/merging/test_historical_merge.py
    """
    if existing is None:
        return True
    return _comparable(existing, schema_config) != _comparable(new, schema_config)


def summarize_revisions(existing, new, schema_config):
    """Summarize added months and revised cells between the saved table and a new release, via the shared diff. Test file: scripts/unit_tests/zillow_affordability/merging/test_historical_merge.py"""
    return diff_revisions(
        new,
        existing,
        key_columns=schema_config["grain_keys"],
        period_column="Date",
        value_columns=schema_config["measure_columns"],
    )
