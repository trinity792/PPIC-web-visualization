"""
e8_standardization.py — applies common post-clean standardization to historical E-8 records.

Data sources:
    - pandas.DataFrame input — cleaned historical E-8 records from an era cleaner
    - year_start and year_end — inclusive year bounds for the records to retain

Outputs:
    - pandas.DataFrame — canonical historical Population & Housing records for one era

Usage:
    python scripts/pophousing/historical/e8_standardization.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

import pandas as pd

from scripts.shared.data_cleaning.type_conversions import coerce_numeric_columns

"""
========================================================================================================================
E-8 Standardization
========================================================================================================================
"""

_NON_NUMERIC_COLUMNS = {"Geographic Level", "Location", "Year", "Source"}
# E-8 reports both an April 1 census row and a January 1 estimate for many
# years; the annual estimate is canonical, so census rows are dropped.
_CENSUS_MONTH = 4
_CENSUS_DAY = 1
# Pre-2020 workbooks store the vacancy rate as a fraction (0-1) rather than a
# percentage; values in this open interval are scaled up to match the contract.
_DECIMAL_RATE_YEAR = 2020
_VACANCY_RATE_COLUMN = "Vacancy Rate (%)"


def extract_annual_year(date_series):
    """Return the year per annual-estimate date; census (4/1) and unparseable dates become NA. Test file: scripts/unit_tests/pophousing/historical/test_e8_standardization.py"""
    parsed_dates = pd.to_datetime(
        date_series.astype("string"), errors="coerce", format="mixed"
    )
    census_rows = parsed_dates.dt.month.eq(_CENSUS_MONTH) & parsed_dates.dt.day.eq(
        _CENSUS_DAY
    )
    return parsed_dates.dt.year.mask(census_rows.fillna(False))


def standardize_e8_data(historical_housing_df, year_start, year_end):
    """Parse years, drop census rows, bound years, and normalize rates. Test file: scripts/unit_tests/pophousing/historical/test_e8_standardization.py"""
    if year_start > year_end:
        raise ValueError("year_start cannot exceed year_end")
    if "Year" not in historical_housing_df.columns:
        raise KeyError("missing column: Year")

    result = historical_housing_df.copy()
    years = extract_annual_year(result["Year"])
    keep_rows = years.notna() & years.ge(year_start) & years.le(year_end)
    result = result.loc[keep_rows].copy()
    result["Year"] = years.loc[keep_rows].astype(int)

    numeric_columns = [
        column
        for column in result.columns
        if column not in _NON_NUMERIC_COLUMNS
    ]
    result = coerce_numeric_columns(result, numeric_columns)
    result = _normalize_decimal_vacancy_rates(result)
    return result.reset_index(drop=True)


def _normalize_decimal_vacancy_rates(historical_housing_df):
    """Scale pre-2020 fractional vacancy rates to percentages. Test file: scripts/unit_tests/pophousing/historical/test_e8_standardization.py"""
    if _VACANCY_RATE_COLUMN not in historical_housing_df.columns:
        return historical_housing_df

    result = historical_housing_df.copy()
    rates = pd.to_numeric(result[_VACANCY_RATE_COLUMN], errors="coerce")
    decimal_rows = (
        result["Year"].lt(_DECIMAL_RATE_YEAR) & rates.gt(0) & rates.lt(1.0)
    ).fillna(False)
    result.loc[decimal_rows, _VACANCY_RATE_COLUMN] = (
        rates.loc[decimal_rows] * 100
    ).round(2)
    return result
