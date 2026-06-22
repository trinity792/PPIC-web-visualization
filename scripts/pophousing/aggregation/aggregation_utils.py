import pandas as pd


def remove_existing_geographic_level(housing_df, level_col, level_name):
    if level_col not in housing_df.columns:
        raise KeyError(f"missing column: {level_col}")
    return housing_df.loc[~housing_df[level_col].eq(level_name)].copy().reset_index(
        drop=True
    )


def deduplicate_geographic_rows(housing_df, location_col, year_col, level_col, preferred_level):
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


def _aggregate_additive_columns(dataframe, group_col, excluded_columns):
    if dataframe.empty:
        return pd.DataFrame(columns=[group_col])

    numeric_data = {group_col: dataframe[group_col]}
    for column in dataframe.columns:
        if column == group_col or column in excluded_columns:
            continue
        converted_values = pd.to_numeric(dataframe[column], errors="coerce")
        original_non_null = dataframe[column].notna()
        if converted_values[original_non_null].notna().all():
            numeric_data[column] = converted_values

    numeric_dataframe = pd.DataFrame(numeric_data, index=dataframe.index)
    additive_columns = [
        column for column in numeric_dataframe.columns if column != group_col
    ]
    if not additive_columns:
        return (
            numeric_dataframe[[group_col]]
            .drop_duplicates()
            .sort_values(group_col)
            .reset_index(drop=True)
        )
    return (
        numeric_dataframe.groupby(group_col, as_index=False, sort=True)[
            additive_columns
        ]
        .sum(min_count=1)
        .reset_index(drop=True)
    )
