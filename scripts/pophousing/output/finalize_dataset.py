from pathlib import Path

import pandas as pd


def prepare_housing_output(housing_df, source_name, output_columns, sort_columns):
    missing_columns = [
        column
        for column in output_columns
        if column not in housing_df.columns and column != "Source"
    ]
    if missing_columns:
        raise ValueError(
            f"missing output columns: {', '.join(missing_columns)}"
        )
    missing_sort_columns = [
        column for column in sort_columns if column not in output_columns
    ]
    if missing_sort_columns:
        raise ValueError(
            f"sort columns are not in output schema: {', '.join(missing_sort_columns)}"
        )

    result = housing_df.copy()
    result["Source"] = source_name
    numeric_years = pd.to_numeric(result["Year"], errors="coerce")
    invalid_years = numeric_years.isna() | numeric_years.mod(1).ne(0)
    if invalid_years.any():
        raise ValueError(f"Found {int(invalid_years.sum())} invalid Year values")
    result["Year"] = numeric_years.astype("Int64").astype("string")
    return (
        result.loc[:, output_columns]
        .sort_values(sort_columns, kind="stable")
        .reset_index(drop=True)
    )


def write_housing_output(housing_df, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(f"{output_path.name}.tmp")
    try:
        housing_df.to_csv(temporary_path, index=False)
        temporary_path.replace(output_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    return output_path
