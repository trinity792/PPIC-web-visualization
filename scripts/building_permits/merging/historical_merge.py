"""
historical_merge.py — combines freshly built months with historical rows and detects new data.

Data sources:
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — saved canonical data
    - Freshly built contract frame from geographic_levels.tag_geographic_levels

Outputs:
    - pandas.DataFrame — merged dataset
    - bool — whether new data was detected

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/merging/
"""

import pandas as pd

# Contract columns for an empty canonical dataset, and the grain used for sorting.
_CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]
_SORT_COLUMNS = ["Date", "Geographic Level", "Location"]


"""
========================================================================================================================
Historical Data Access
========================================================================================================================
"""


def load_canonical_dataset(current_data_path):
    """
    Read the existing contract CSV, or return an empty contract-shaped frame if absent.

    Test file: scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
    if not current_data_path.exists():
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    return pd.read_csv(current_data_path)


def load_historical_baseline(historical_data_path):
    """
    Read the immutable deep-history seed, or an empty contract-shaped frame if absent.

    The seed (BuildingPermits_Historical.csv) is the read-only system of record for the
    pre-2024 months the live rolling-window source can no longer supply. It is never
    written by the pipeline, so a bad Current.csv write cannot corrupt it.

    Test file: scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
    if historical_data_path is None or not historical_data_path.exists():
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    return pd.read_csv(historical_data_path)


def compose_baseline(baseline_df, current_df):
    """
    Union the immutable deep-history seed with the live output, preferring live rows.

    current_df is concatenated last so keep="last" prefers the live output on any
    overlapping (Date, Geographic Level, Location) key, while the seed still supplies
    any deep-history months a truncated or lost Current.csv would otherwise miss. This
    makes the deep history recoverable from the committed seed alone (guide A1/A2).

    Test file: scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
    frames = [frame for frame in (baseline_df, current_df) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    combined = pd.concat(frames, ignore_index=True)
    key_columns = [column for column in _SORT_COLUMNS if column in combined.columns]
    if key_columns:
        combined = combined.drop_duplicates(subset=key_columns, keep="last")
    return combined.sort_values(_SORT_COLUMNS, ignore_index=True)


def latest_stored_month(historical_df, date_column):
    """
    Return the newest "YYYY-MM" present in the saved dataset, or None if empty.

    Test file: scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
    if historical_df.empty:
        return None
    return max(historical_df[date_column])


"""
========================================================================================================================
Merging
========================================================================================================================
"""


def combine_with_historical(new_df, historical_df, date_column):
    """
    Atomically merge freshly built months with historical rows.

    Drops every historical row whose Date appears in new_df and appends the incoming
    rows whole, preserving non-overlapping historical months. Never performs key-level
    upserts, so a month is always fully one scrape's data. Sorts the result.

    Test file: scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
    incoming_dates = set(new_df[date_column])
    retained = historical_df[~historical_df[date_column].isin(incoming_dates)]

    # Skip empty frames when concatenating so dtypes are never upcast to object.
    non_empty = [frame for frame in (retained, new_df) if not frame.empty]
    if not non_empty:
        return historical_df.iloc[0:0].copy()

    combined = pd.concat(non_empty, ignore_index=True)
    return combined.sort_values(_SORT_COLUMNS, ignore_index=True)


def detect_new_data(candidate_df, current_df):
    """
    Determine whether the candidate output differs from the saved current dataset.

    Shares one definition of "changed" with the write gate in archive_and_save: both
    compare the *serialized CSV text*, so the change flag can never disagree with whether
    a byte-different file is actually written. Comparing serialized text (rather than
    DataFrame.equals) also sidesteps the int-vs-CSV-inferred dtype drift that previously
    reported spurious "new data" on an unchanged dataset (guide A7). Row order and index
    are ignored by sorting both frames to the canonical contract grain first.

    Test file: scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
    if current_df is None or current_df.empty:
        return not (candidate_df is None or candidate_df.empty)
    if list(candidate_df.columns) != list(current_df.columns):
        return True

    sort_columns = [column for column in _SORT_COLUMNS if column in candidate_df.columns]
    left = candidate_df.sort_values(sort_columns).reset_index(drop=True) if sort_columns else candidate_df
    right = current_df.sort_values(sort_columns).reset_index(drop=True) if sort_columns else current_df
    return left.to_csv(index=False) != right.to_csv(index=False)
