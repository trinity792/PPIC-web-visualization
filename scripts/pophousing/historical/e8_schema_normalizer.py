"""
e8_schema_normalizer.py — assigns each historical E-8 layout's positional columns to the pipeline schema.

Data sources:
    - pandas.DataFrame input — raw E-8 worksheet rows for one decade
    - format_config — positional column names and an optional rename mapping

Outputs:
    - pandas.DataFrame — E-8 records in a shared, named historical schema

Usage:
    python scripts/pophousing/historical/e8_schema_normalizer.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

"""
========================================================================================================================
E-8 Schema Normalization
========================================================================================================================
"""


def normalize_e8_columns(raw_e8_df, format_config):
    """Name an E-8 layout's positional columns and apply its rename mapping. Test file: scripts/unit_tests/pophousing/historical/test_e8_schema_normalizer.py"""
    column_names = list(format_config["column_names"])
    expected_width = len(column_names)
    actual_width = len(raw_e8_df.columns)
    # E-8 workbooks carry trailing layout columns the schema ignores, so only a
    # shortfall is fatal; surplus columns past the named ones are dropped.
    if actual_width < expected_width:
        raise ValueError(
            f"E-8 data expected at least {expected_width} columns but found {actual_width}"
        )

    result = raw_e8_df.iloc[:, :expected_width].copy()
    result.columns = column_names

    rename_mapping = format_config.get("rename_mapping")
    if rename_mapping:
        result = result.rename(columns=rename_mapping)
    return result
