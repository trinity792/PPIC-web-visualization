"""
column_normalization.py — normalizes raw ACS Summary File columns to the pipeline's estimate schema.

Data sources:
    - Raw joined table frame from acs_sf_downloader

Outputs:
    - pandas.DataFrame — with bare E-columns, geography columns renamed, MOE columns dropped

Usage:
    Called by geographic_levels.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/cleaning/
"""

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# The B25140 estimate columns expected after the table prefix is stripped.
_EXPECTED_ESTIMATE_COLUMNS = [f"E{number:03d}" for number in range(1, 14)]


"""
========================================================================================================================
Column Normalization
========================================================================================================================
"""


def strip_table_prefix(df):
    """
    Strip the "B25140xxx_" table prefix from column names, leaving E001..E013 and M001..M013.

    Replaces the fragile inline regex with a validated transform: after stripping, each
    expected estimate column must be present exactly once. Does not mutate the input.

    Raises:
        ValueError — if any expected estimate column is missing or duplicated after stripping.

    Test file: scripts/unit_tests/housing_stress/cleaning/test_column_normalization.py
    """
    result = df.copy()
    result.columns = result.columns.str.replace(r"^.*_", "", regex=True)

    counts = result.columns.value_counts()
    problems = [column for column in _EXPECTED_ESTIMATE_COLUMNS if counts.get(column, 0) != 1]
    if problems:
        raise ValueError(f"Estimate columns missing or duplicated after prefix strip: {problems}")

    return result


def drop_margin_of_error_columns(df):
    """
    Drop the ACS margin-of-error columns (those matching exactly M followed by three digits).

    Columns such as MARGIN_NOTE are retained. Does not mutate the input.

    Test file: scripts/unit_tests/housing_stress/cleaning/test_column_normalization.py
    """
    keep_mask = ~df.columns.str.fullmatch(r"M\d{3}")
    return df.loc[:, keep_mask].copy()


def rename_geography_columns(df, geography_names):
    """
    Rename the raw ACS NAME/STUSAB columns to the pipeline's geography column names.

    Args:
        df: pandas.DataFrame with raw NAME/STUSAB columns
        geography_names: dict with keys location_column and state_column

    Returns:
        pandas.DataFrame — with NAME renamed to the location column and STUSAB to the state column.

    Test file: scripts/unit_tests/housing_stress/cleaning/test_column_normalization.py
    """
    return df.rename(
        columns={
            "NAME": geography_names["location_column"],
            "STUSAB": geography_names["state_column"],
        }
    )
