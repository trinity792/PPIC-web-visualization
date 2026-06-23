"""
dataframe_operations.py — provides reusable forward-fill and mapping operations for dataframe columns.

Data sources:
    - pandas.DataFrame inputs — tabular records supplied by data-cleaning pipelines

Outputs:
    - pandas.DataFrame — copied records with filled or mapped column values

Usage:
    python scripts/shared/data_cleaning/dataframe_operations.py

Test Folders:
    - scripts/unit_tests/shared/data_cleaning/
"""

"""
========================================================================================================================
Dataframe Operations
========================================================================================================================
"""


def forward_fill_columns(dataframe, columns):
    """Forward-fill selected columns in a dataframe copy. Test file: scripts/unit_tests/shared/data_cleaning/test_dataframe_operations.py"""
    missing_columns = [column for column in columns if column not in dataframe.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    result = dataframe.copy()
    result[columns] = result[columns].ffill()
    return result


def assign_values_from_mapping(dataframe, source_col, target_col, value_mapping):
    """Map source values into a target column while retaining unmatched values. Test file: scripts/unit_tests/shared/data_cleaning/test_dataframe_operations.py"""
    if source_col not in dataframe.columns:
        raise KeyError(f"missing column: {source_col}")

    result = dataframe.copy()
    mapped_values = result[source_col].map(value_mapping)
    if target_col in result.columns:
        result[target_col] = mapped_values.where(
            mapped_values.notna(), result[target_col]
        )
    else:
        result[target_col] = mapped_values
    return result
