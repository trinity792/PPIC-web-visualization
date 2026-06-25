"""
boundary_year_resolution.py — resolves duplicate decade-boundary rows across historical E-8 sources.

Data sources:
    - pandas.DataFrame input — merged historical records tagged with a "Dataset Source"
    - source_priority — ordering used to keep one row per (Location, Level, Year)

Outputs:
    - pandas.DataFrame — historical records with boundary-year duplicates resolved

Usage:
    python scripts/pophousing/historical/boundary_year_resolution.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

"""
========================================================================================================================
Boundary-Year Resolution
========================================================================================================================
"""

_SOURCE_COLUMN = "Dataset Source"
_KEY_COLUMNS = ["Location", "Geographic Level", "Year"]


def resolve_boundary_year_overlaps(historical_housing_df, source_priority):
    """Keep one row per location-year, preferring higher-priority sources. Test file: scripts/unit_tests/pophousing/historical/test_boundary_year_resolution.py"""
    if len(source_priority) != len(set(source_priority)):
        raise ValueError("source_priority contains duplicates")

    missing_columns = [
        column
        for column in (*_KEY_COLUMNS, _SOURCE_COLUMN)
        if column not in historical_housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    observed_sources = set(historical_housing_df[_SOURCE_COLUMN].dropna())
    unknown_sources = sorted(str(source) for source in observed_sources - set(source_priority))
    if unknown_sources:
        raise ValueError(
            "source_priority does not include sources: " + ", ".join(unknown_sources)
        )

    result = historical_housing_df.copy()
    priority_column = "_source_priority"
    while priority_column in result.columns:
        priority_column = f"_{priority_column}"
    order_column = "_original_order"
    while order_column in result.columns or order_column == priority_column:
        order_column = f"_{order_column}"

    priority_mapping = {
        source: priority for priority, source in enumerate(source_priority)
    }
    result[priority_column] = result[_SOURCE_COLUMN].map(priority_mapping)
    result[order_column] = range(len(result))
    result = result.sort_values(
        [priority_column, order_column], kind="stable"
    ).drop_duplicates(subset=_KEY_COLUMNS, keep="first")
    return (
        result.sort_values(order_column, kind="stable")
        .drop(columns=[priority_column, order_column])
        .reset_index(drop=True)
    )
