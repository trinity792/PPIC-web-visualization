"""
historical_merge.py — combines the freshly built vintage with historical rows and detects new data.

Data sources:
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — saved canonical data
    - Freshly built contract frame from geographic_levels.build_all_levels

Outputs:
    - pandas.DataFrame — merged dataset
    - bool — whether new data was detected

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/merging/
"""

import pandas as pd

# Contract columns for an empty canonical dataset, and the grain used for sorting.
_CONTRACT_COLUMNS = [
    "Year",
    "Geographic Level",
    "Location",
    "Race/Ethnicity",
    "Tenure",
    "Number Over 30%",
    "Number Over 50%",
    "Share Over 30%",
    "Share Over 50%",
]
_SORT_COLUMNS = ["Year", "Geographic Level", "Location", "Race/Ethnicity", "Tenure"]


"""
========================================================================================================================
Historical Data Access
========================================================================================================================
"""


def load_canonical_dataset(current_data_path):
    """
    Read the existing contract CSV, or return an empty contract-shaped frame if absent.

    Test file: scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """
    if not current_data_path.exists():
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    return pd.read_csv(current_data_path)


"""
========================================================================================================================
Merging
========================================================================================================================
"""


def combine_with_historical(new_df, historical_df, year_column, completeness_validator):
    """
    Atomically merge a complete incoming vintage year with historical rows.

    Runs completeness_validator against the incoming vintage before touching history. On
    failure, raises without modifying either input. On success, drops every historical row
    whose year appears in new_df and appends the incoming rows whole, preserving
    non-overlapping historical years. Never performs key-level upserts.

    Raises:
        ValueError — if the incoming vintage fails completeness validation.

    Test file: scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """
    is_valid, messages = completeness_validator(new_df)
    if not is_valid:
        raise ValueError(f"Incoming vintage failed completeness validation: {messages}")

    incoming_years = set(new_df[year_column])
    retained = historical_df[~historical_df[year_column].isin(incoming_years)]
    combined = pd.concat([retained, new_df], ignore_index=True)
    return combined.sort_values(_SORT_COLUMNS, ignore_index=True)


def detect_new_data(merged_df, historical_df):
    """
    Determine whether the merged dataset differs from the saved historical dataset.

    Ignores row ordering and index. Returns a plain bool.

    Test file: scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """
    if list(merged_df.columns) != list(historical_df.columns):
        return True

    left = merged_df.sort_values(list(merged_df.columns)).reset_index(drop=True)
    right = historical_df.sort_values(list(historical_df.columns)).reset_index(drop=True)
    return not left.equals(right)
