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

import warnings
from pathlib import Path

import numpy as np
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
    current_data_path = Path(current_data_path)
    if not current_data_path.exists():
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    return pd.read_csv(current_data_path)


def load_historical_baseline(historical_data_path):
    """
    Load the immutable deep-history seed, or an empty contract-shaped frame when it is absent.

    The seed is a frozen, known-good copy of the contract produced by the backfill driver.
    It is read-only to the live pipeline, so a bad current run cannot poison the deep-history
    baseline. A missing seed is not an error: the module cold-starts on live data.

    Test file: scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """
    if not historical_data_path:
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    path = Path(historical_data_path)
    if not path.exists():
        warnings.warn(
            f"Housing Stress history seed not found at {path}; proceeding on current output only.",
            stacklevel=2,
        )
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    return pd.read_csv(path)


def combine_history_sources(baseline_df, current_df):
    """
    Union the immutable deep-history seed with the current output, preferring current rows.

    The current output is concatenated last, so on a duplicate contract key keep="last"
    prefers the live output while the seed still supplies any deep year the current file may
    have lost. Returns an empty contract-shaped frame when both inputs are empty.

    Test file: scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """
    frames = [frame for frame in (baseline_df, current_df) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame(columns=_CONTRACT_COLUMNS)
    combined = pd.concat(frames, ignore_index=True)
    key_columns = [column for column in _SORT_COLUMNS if column in combined.columns]
    if key_columns:
        combined = combined.drop_duplicates(subset=key_columns, keep="last").reset_index(drop=True)
    return combined


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


# Two share values closer than this are treated as unchanged: freshly-computed
# floats and the same values round-tripped through the CSV differ only by ~1e-16
# ULP noise that never survives serialization, so a tighter comparison would flag a
# "change" the write step (a byte compare) correctly ignores.
_FLOAT_ABS_TOLERANCE = 1e-9


def _is_numeric(series):
    """Return True when a column is entirely numeric (ignoring nulls), so it is compared with a tolerance."""
    coerced = pd.to_numeric(series, errors="coerce")
    return coerced.notna().sum() == series.notna().sum()


def detect_new_data(merged_df, historical_df):
    """
    Determine whether the merged dataset differs from the saved historical dataset.

    Ignores row ordering and index. Numeric columns are compared with an absolute tolerance
    (and NaN treated as equal to NaN), so an int-vs-float dtype drift or the ~1e-16 float ULP
    noise introduced by the CSV round-trip does not spuriously report a change — the flag then
    agrees with the write step, which decides on serialized bytes. Non-numeric columns are
    compared exactly. Returns a plain bool.

    Test file: scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """
    if list(merged_df.columns) != list(historical_df.columns):
        return True
    if len(merged_df) != len(historical_df):
        return True

    columns = list(merged_df.columns)
    left = merged_df.sort_values(columns).reset_index(drop=True)
    right = historical_df.sort_values(columns).reset_index(drop=True)

    for column in columns:
        left_column = left[column]
        right_column = right[column]
        if _is_numeric(left_column) and _is_numeric(right_column):
            left_values = pd.to_numeric(left_column, errors="coerce").to_numpy(dtype="float64")
            right_values = pd.to_numeric(right_column, errors="coerce").to_numpy(dtype="float64")
            if not np.allclose(left_values, right_values, rtol=0, atol=_FLOAT_ABS_TOLERANCE, equal_nan=True):
                return True
        elif not left_column.astype("object").equals(right_column.astype("object")):
            return True
    return False
