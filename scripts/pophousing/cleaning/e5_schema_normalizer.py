def normalize_e5_columns(raw_e5_df, column_names):
    actual_width = len(raw_e5_df.columns)
    expected_width = len(column_names)
    if actual_width != expected_width:
        raise ValueError(
            f"E-5 data expected {expected_width} columns but found {actual_width}"
        )

    result = raw_e5_df.copy()
    result.columns = list(column_names)
    return result


def trim_to_first_data_row(raw_e5_df, anchor_value, column):
    if column not in raw_e5_df.columns:
        raise KeyError(f"missing column: {column}")

    anchor_rows = raw_e5_df.index[raw_e5_df[column].eq(anchor_value)]
    if anchor_rows.empty:
        raise ValueError(f"Data anchor {anchor_value!r} not found in {column}")

    first_anchor_position = raw_e5_df.index.get_loc(anchor_rows[0])
    return raw_e5_df.iloc[first_anchor_position:].copy().reset_index(drop=True)


def rename_e5_schema(raw_e5_df, mapping):
    missing_columns = [column for column in mapping if column not in raw_e5_df.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")
    return raw_e5_df.rename(columns=mapping).copy()
