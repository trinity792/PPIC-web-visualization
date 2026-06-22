import pandas as pd


def validate_required_columns(dataframe, required_columns):
    return [column for column in required_columns if column not in dataframe.columns]


def validate_not_empty(dataframe):
    return not dataframe.empty


def find_duplicate_rows(dataframe, key_columns):
    missing_columns = validate_required_columns(dataframe, key_columns)
    if missing_columns:
        raise KeyError(f"Cannot check duplicates; missing columns: {missing_columns}")
    return dataframe[dataframe.duplicated(subset=key_columns, keep=False)].copy()


def validate_null_counts(dataframe, columns):
    existing_columns = [column for column in columns if column in dataframe.columns]
    return {
        column: int(null_count)
        for column, null_count in dataframe[existing_columns].isna().sum().items()
        if null_count > 0
    }


def validate_numeric_range(dataframe, value_col, min_value, max_value, row_mask):
    if value_col not in dataframe.columns:
        raise KeyError(f"missing column: {value_col}")
    if row_mask is None:
        selected_rows = pd.Series(True, index=dataframe.index)
    else:
        if not dataframe.index.equals(row_mask.index):
            raise ValueError("row_mask must align with dataframe index")
        selected_rows = row_mask.fillna(False).astype(bool)

    numeric_values = pd.to_numeric(dataframe[value_col], errors="coerce")
    violations = pd.Series(False, index=dataframe.index)
    if min_value is not None:
        violations |= numeric_values.lt(min_value)
    if max_value is not None:
        violations |= numeric_values.gt(max_value)
    violations &= selected_rows & numeric_values.notna()
    return dataframe.loc[violations].copy()
