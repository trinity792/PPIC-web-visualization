import pandas as pd


def find_decimal_fraction_rates(housing_df, year_col, rate_col, level_col, min_year):
    required_columns = [year_col, rate_col, level_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    years = pd.to_numeric(housing_df[year_col], errors="coerce")
    rates = pd.to_numeric(housing_df[rate_col], errors="coerce")
    return (
        years.ge(min_year)
        & rates.gt(0.01)
        & rates.lt(1.0)
        & housing_df[level_col].ne("State")
    ).fillna(False)


def normalize_decimal_fraction_rates(housing_df, rate_col, mask):
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
