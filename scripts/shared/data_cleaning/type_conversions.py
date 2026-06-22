import pandas as pd


def parse_year_from_date(dataframe, date_col, out_col):
    if date_col not in dataframe.columns:
        raise KeyError(f"missing column: {date_col}")

    result = dataframe.copy()
    parsed_dates = pd.to_datetime(result[date_col], errors="coerce", format="mixed")
    result[out_col] = parsed_dates.dt.year.astype("Int64")
    return result


def coerce_numeric_columns(dataframe, numeric_cols):
    missing_columns = [
        column for column in numeric_cols if column not in dataframe.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    result = dataframe.copy()
    for column in numeric_cols:
        normalized_values = result[column].astype("string").str.replace(
            ",", "", regex=False
        )
        result[column] = pd.to_numeric(normalized_values, errors="coerce")
    return result
