"""
aggregation_utils.py — provides shared row filtering, deduplication, and additive aggregation helpers.

Data sources:
    - pandas.DataFrame inputs — Population & Housing records supplied by aggregation stages

Outputs:
    - pandas.DataFrame — filtered, deduplicated, or aggregated housing records

Usage:
    python scripts/pophousing/aggregation/aggregation_utils.py

Test Folders:
    - scripts/unit_tests/pophousing/aggregation/
"""

from scripts.shared.data_cleaning.aggregation import aggregate_additive_columns, detect_additive_columns

# The additive-sum helpers now live in scripts/shared so Components of Change can
# reuse them without importing a Population & Housing private (refactor guide A5).
# Re-exported here (including the legacy underscore alias) for existing callers.
_aggregate_additive_columns = aggregate_additive_columns

__all__ = [
    "remove_existing_geographic_level",
    "deduplicate_geographic_rows",
    "detect_additive_columns",
    "aggregate_additive_columns",
    "_aggregate_additive_columns",
]

"""
========================================================================================================================
Aggregation Helpers
========================================================================================================================
"""


def remove_existing_geographic_level(housing_df, level_col, level_name):
    """Remove rows for a named geographic level. Test file: scripts/unit_tests/pophousing/aggregation/test_aggregation_utils.py"""
    if level_col not in housing_df.columns:
        raise KeyError(f"missing column: {level_col}")
    return housing_df.loc[~housing_df[level_col].eq(level_name)].copy().reset_index(
        drop=True
    )


def deduplicate_geographic_rows(housing_df, location_col, year_col, level_col, preferred_level):
    """Deduplicate location-year rows while preferring one level. Test file: scripts/unit_tests/pophousing/aggregation/test_aggregation_utils.py"""
    required_columns = [location_col, year_col, level_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    preference_column = "_geographic_preference"
    while preference_column in result.columns:
        preference_column = f"_{preference_column}"
    order_column = "_original_order"
    while order_column in result.columns or order_column == preference_column:
        order_column = f"_{order_column}"

    result[preference_column] = (~result[level_col].eq(preferred_level)).astype(int)
    result[order_column] = range(len(result))
    result = result.sort_values(
        [preference_column, order_column], kind="stable"
    ).drop_duplicates(subset=[location_col, year_col], keep="first")
    return (
        result.sort_values(order_column, kind="stable")
        .drop(columns=[preference_column, order_column])
        .reset_index(drop=True)
    )
