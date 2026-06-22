from pathlib import Path

import pandas as pd

from scripts.pophousing.config.schemas import get_schema_config


def load_historical_housing_data(historical_file_path):
    historical_file_path = Path(historical_file_path)
    if not historical_file_path.is_file():
        raise FileNotFoundError(
            f"Historical data file not found: {historical_file_path}"
        )

    historical_housing_df = pd.read_csv(historical_file_path)
    if historical_housing_df.empty:
        raise ValueError("Historical housing data is empty")

    expected_columns = get_schema_config()["output_columns"]
    missing_columns = [
        column
        for column in expected_columns
        if column not in historical_housing_df.columns
    ]
    if missing_columns:
        raise ValueError(
            f"missing required columns: {', '.join(missing_columns)}"
        )

    result = historical_housing_df.loc[:, expected_columns].copy()
    result["Source"] = "E-8"
    return result


def filter_historical_years(historical_housing_df, max_year):
    year_column = "Year"
    if year_column not in historical_housing_df.columns:
        raise KeyError(f"missing column: {year_column}")

    numeric_years = pd.to_numeric(
        historical_housing_df[year_column], errors="coerce"
    )
    invalid_year_count = int(numeric_years.isna().sum())
    if invalid_year_count:
        raise ValueError(f"Found {invalid_year_count} invalid Year values")

    result = historical_housing_df.copy()
    result[year_column] = numeric_years.astype("Int64")
    return result.loc[result[year_column].le(max_year)].reset_index(drop=True)


def merge_historical_and_modern_data(historical_housing_df, modern_housing_df):
    historical_columns = historical_housing_df.columns.tolist()
    modern_columns = modern_housing_df.columns.tolist()
    historical_only_columns = [
        column for column in historical_columns if column not in modern_columns
    ]
    modern_only_columns = [
        column for column in modern_columns if column not in historical_columns
    ]
    if historical_only_columns or modern_only_columns:
        raise ValueError(
            "Housing schemas do not match; "
            f"historical-only columns: {', '.join(historical_only_columns) or 'none'}; "
            f"modern-only columns: {', '.join(modern_only_columns) or 'none'}"
        )

    aligned_modern_housing_df = modern_housing_df.loc[:, historical_columns]
    return pd.concat(
        [historical_housing_df.copy(), aligned_modern_housing_df.copy()],
        ignore_index=True,
    )


def resolve_source_overlap(merged_housing_df, key_columns, source_priority):
    if len(source_priority) != len(set(source_priority)):
        raise ValueError("source_priority contains duplicates")

    missing_key_columns = [
        column for column in key_columns if column not in merged_housing_df.columns
    ]
    if missing_key_columns:
        raise KeyError(f"missing columns: {', '.join(missing_key_columns)}")
    if "Source" not in merged_housing_df.columns:
        raise KeyError("missing column: Source")

    null_key_columns = [
        column
        for column in key_columns
        if merged_housing_df[column].isna().any()
    ]
    if null_key_columns:
        raise ValueError(
            "key columns contain null values: " + ", ".join(null_key_columns)
        )
    if merged_housing_df["Source"].isna().any():
        raise ValueError("Source contains null values")

    observed_sources = set(merged_housing_df["Source"])
    unknown_sources = sorted(observed_sources - set(source_priority))
    if unknown_sources:
        raise ValueError(
            "source_priority does not include sources: "
            + ", ".join(str(source) for source in unknown_sources)
        )

    result = merged_housing_df.copy()
    priority_column = "_source_priority"
    while priority_column in result.columns:
        priority_column = f"_{priority_column}"
    order_column = "_original_order"
    while order_column in result.columns or order_column == priority_column:
        order_column = f"_{order_column}"

    priority_mapping = {
        source: priority for priority, source in enumerate(source_priority)
    }
    result[priority_column] = result["Source"].map(priority_mapping)
    result[order_column] = range(len(result))
    result = result.sort_values(
        [priority_column, order_column], kind="stable"
    ).drop_duplicates(subset=key_columns, keep="first")
    return (
        result.sort_values(order_column, kind="stable")
        .drop(columns=[priority_column, order_column])
        .reset_index(drop=True)
    )
