"""
dataframe_validators.py — provides reusable schema, emptiness, duplicate, null, and range checks.

Data sources:
    - pandas.DataFrame inputs — tabular records supplied by validation stages
    - configured columns, keys, masks, and numeric bounds — validation criteria

Outputs:
    - lists, booleans, and dictionaries — validation summaries
    - pandas.DataFrame — copied rows that violate duplicate or numeric-range rules

Usage:
    python scripts/shared/validation/dataframe_validators.py

Test Folders:
    - scripts/unit_tests/shared/validation/
"""

import pandas as pd

"""
========================================================================================================================
Dataframe Validation
========================================================================================================================
"""


def validate_required_columns(dataframe, required_columns):
    """Return required columns absent from a dataframe. Test file: scripts/unit_tests/shared/validation/test_dataframe_validators.py"""
    return [column for column in required_columns if column not in dataframe.columns]


def validate_not_empty(dataframe):
    """Report whether a dataframe contains rows. Test file: scripts/unit_tests/shared/validation/test_dataframe_validators.py"""
    return not dataframe.empty


def find_duplicate_rows(dataframe, key_columns):
    """Return all rows participating in duplicate keys. Test file: scripts/unit_tests/shared/validation/test_dataframe_validators.py"""
    missing_columns = validate_required_columns(dataframe, key_columns)
    if missing_columns:
        raise KeyError(f"Cannot check duplicates; missing columns: {missing_columns}")
    return dataframe[dataframe.duplicated(subset=key_columns, keep=False)].copy()


def validate_null_counts(dataframe, columns):
    """Return positive null counts for existing configured columns. Test file: scripts/unit_tests/shared/validation/test_dataframe_validators.py"""
    existing_columns = [column for column in columns if column in dataframe.columns]
    return {
        column: int(null_count)
        for column, null_count in dataframe[existing_columns].isna().sum().items()
        if null_count > 0
    }


def validate_numeric_range(dataframe, value_col, min_value, max_value, row_mask):
    """Return selected rows outside optional inclusive numeric bounds. Test file: scripts/unit_tests/shared/validation/test_dataframe_validators.py"""
    if value_col not in dataframe.columns:
        raise KeyError(f"missing column: {value_col}")
    if row_mask is None:
        selected_rows = pd.Series(True, index=dataframe.index)
    else:
        if not dataframe.index.equals(row_mask.index):
            raise ValueError("row_mask must align with dataframe index")
        selected_rows = row_mask.fillna(False).astype(bool)

    numeric_values = pd.to_numeric(dataframe[value_col], errors="coerce")
    violations = pd.Series(False, index=dataframe.index)
    if min_value is not None:
        violations |= numeric_values.lt(min_value)
    if max_value is not None:
        violations |= numeric_values.gt(max_value)
    violations &= selected_rows & numeric_values.notna()
    return dataframe.loc[violations].copy()
