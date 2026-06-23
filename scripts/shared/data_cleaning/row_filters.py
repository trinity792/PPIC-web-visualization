"""
row_filters.py — filters dataframe rows by year, summary labels, headers, and meaningful content.

Data sources:
    - pandas.DataFrame inputs — tabular records supplied by data-cleaning pipelines
    - configured year bounds and row-label patterns — criteria for retaining records

Outputs:
    - pandas.DataFrame — copied and reindexed records that satisfy each filter

Usage:
    python scripts/shared/data_cleaning/row_filters.py

Test Folders:
    - scripts/unit_tests/shared/data_cleaning/
"""

import pandas as pd

"""
========================================================================================================================
Row Filters
========================================================================================================================
"""


def filter_year_range(dataframe, year_col, min_year, max_year):
    """Keep rows within inclusive configured year bounds. Test file: scripts/unit_tests/shared/data_cleaning/test_row_filters.py"""
    if year_col not in dataframe.columns:
        raise KeyError(f"missing column: {year_col}")
    if max_year is not None and min_year > max_year:
        raise ValueError("min_year cannot exceed max_year")

    years = pd.to_numeric(dataframe[year_col], errors="coerce")
    row_mask = years.ge(min_year)
    if max_year is not None:
        row_mask &= years.le(max_year)
    return dataframe.loc[row_mask].copy().reset_index(drop=True)


def remove_summary_rows(
    dataframe, location_col, keep_values, summary_patterns=None
):
    """Remove matching summary rows except protected values. Test file: scripts/unit_tests/shared/data_cleaning/test_row_filters.py"""
    if location_col not in dataframe.columns:
        raise KeyError(f"Missing column: {location_col}")
    if not summary_patterns:
        return dataframe.copy().reset_index(drop=True)

    locations = dataframe[location_col].astype("string").str.strip()
    protected_values = set(keep_values)
    combined_pattern = "|".join(
        f"(?:{pattern})" for pattern in summary_patterns
    )
    summary_mask = locations.str.contains(
        combined_pattern, case=False, na=False, regex=True
    )
    keep_mask = locations.isin(protected_values)
    return dataframe.loc[~summary_mask | keep_mask].copy().reset_index(drop=True)


def remove_header_like_rows(dataframe, location_col, patterns):
    """Remove rows whose location text matches header patterns. Test file: scripts/unit_tests/shared/data_cleaning/test_row_filters.py"""
    if location_col not in dataframe.columns:
        raise KeyError(f"Missing column: {location_col}")
    if not patterns:
        return dataframe.copy().reset_index(drop=True)

    combined_pattern = "|".join(f"(?:{pattern})" for pattern in patterns)
    locations = dataframe[location_col].astype("string")
    header_mask = locations.str.contains(
        combined_pattern, case=False, na=False, regex=True
    )
    return dataframe.loc[~header_mask].copy().reset_index(drop=True)


def drop_empty_rows_without_data(dataframe, location_col, data_cols):
    """Drop rows lacking both a location and meaningful numeric data. Test file: scripts/unit_tests/shared/data_cleaning/test_row_filters.py"""
    required_columns = [location_col, *data_cols]
    missing_columns = [
        column for column in required_columns if column not in dataframe.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    locations = dataframe[location_col].astype("string").str.strip()
    has_location = locations.notna() & ~locations.str.lower().isin(
        {"", "nan", "none"}
    )
    numeric_data = dataframe[data_cols].apply(
        lambda column: pd.to_numeric(
            column.astype("string").str.replace(",", "", regex=False),
            errors="coerce",
        )
    )
    has_meaningful_data = numeric_data.fillna(0).gt(0).any(axis=1)
    return dataframe.loc[has_location | has_meaningful_data].copy().reset_index(
        drop=True
    )
