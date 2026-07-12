"""
rate_normalization.py — detects and converts vacancy rates stored as decimal fractions.

Data sources:
    - pandas.DataFrame inputs — housing records containing year, rate, and geographic level

Outputs:
    - pandas.Series — mask identifying decimal-fraction rates
    - pandas.DataFrame — housing records with selected rates converted to percentages

Usage:
    python scripts/pophousing/calculations/rate_normalization.py

Test Folders:
    - scripts/unit_tests/pophousing/calculations/
"""

import pandas as pd

"""
========================================================================================================================
Rate Normalization
========================================================================================================================
"""


def find_decimal_fraction_rates(housing_df, year_col, rate_col, level_col, min_year):
    """Identify rates in fraction-encoded vintages via a per-year distribution test. Test file: scripts/unit_tests/pophousing/calculations/test_rate_normalization.py"""
    required_columns = [year_col, rate_col, level_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    years = pd.to_numeric(housing_df[year_col], errors="coerce")
    rates = pd.to_numeric(housing_df[rate_col], errors="coerce")
    eligible = years.ge(min_year) & housing_df[level_col].ne("State") & rates.notna()

    # Decide per vintage (year), not per row: a genuine sub-1% rate sits in the
    # same 0-1 band as a fraction-encoded one, so a per-row band would silently
    # rescale a real 0.4% to 40%. A vintage is fraction-encoded only if the
    # *median* of its rates is below 1.0 (all its rates live in the 0-1 band).
    # Within such a vintage, only rows still below 1.0 are scaled, so an already
    # percent-scaled outlier is never multiplied again (refactor guide B5).
    mask = pd.Series(False, index=housing_df.index)
    for year in years[eligible].dropna().unique():
        year_mask = eligible & years.eq(year)
        positive_rates = rates[year_mask & rates.gt(0)]
        if not positive_rates.empty and positive_rates.median() < 1.0:
            mask |= year_mask & rates.lt(1.0)
    return mask


def normalize_decimal_fraction_rates(housing_df, rate_col, mask):
    """Convert selected decimal-fraction rates to percentages. Test file: scripts/unit_tests/pophousing/calculations/test_rate_normalization.py"""
    if rate_col not in housing_df.columns:
        raise KeyError(f"missing column: {rate_col}")
    if not housing_df.index.equals(mask.index):
        raise ValueError("mask must align with housing_df index")

    result = housing_df.copy()
    result[rate_col] = pd.to_numeric(result[rate_col], errors="coerce")
    selected_rows = mask.fillna(False).astype(bool)
    result.loc[selected_rows, rate_col] = (
        result.loc[selected_rows, rate_col] * 100
    ).round(2)
    return result
