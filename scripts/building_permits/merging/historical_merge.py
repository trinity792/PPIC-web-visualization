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


def detect_new_data(merged_df, historical_df):
    """
    Determine whether the merged dataset differs from the saved historical dataset.

    Ignores row ordering and index. Returns a plain bool.

    Test file: scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
    if list(merged_df.columns) != list(historical_df.columns):
        return True

    left = merged_df.sort_values(list(merged_df.columns)).reset_index(drop=True)
    right = historical_df.sort_values(list(historical_df.columns)).reset_index(drop=True)
    return not left.equals(right)
