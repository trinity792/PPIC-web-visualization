def forward_fill_columns(dataframe, columns):
    missing_columns = [column for column in columns if column not in dataframe.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    result = dataframe.copy()
    result[columns] = result[columns].ffill()
    return result


def assign_values_from_mapping(dataframe, source_col, target_col, value_mapping):
    if source_col not in dataframe.columns:
        raise KeyError(f"missing column: {source_col}")

    result = dataframe.copy()
    mapped_values = result[source_col].map(value_mapping)
    if target_col in result.columns:
        result[target_col] = mapped_values.where(
            mapped_values.notna(), result[target_col]
        )
    else:
        result[target_col] = mapped_values
    return result
