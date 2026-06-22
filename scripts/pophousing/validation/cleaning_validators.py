import pandas as pd


def validate_cleaned_e5_data(housing_df, validation_config):
    messages = []
    if housing_df.empty:
        messages.append("Cleaned E-5 data is empty")
        return False, messages

    required_columns = validation_config.get("required_columns", [])
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        messages.append(f"Missing required columns: {', '.join(missing_columns)}")

    critical_columns = [
        column
        for column in validation_config.get("critical_columns", [])
        if column in housing_df.columns
    ]
    null_columns = [
        column for column in critical_columns if housing_df[column].isna().any()
    ]
    if null_columns:
        messages.append(
            f"Critical columns contain null values: {', '.join(null_columns)}"
        )

    duplicate_keys = validation_config.get("duplicate_key_columns", [])
    if duplicate_keys and all(
        column in housing_df.columns for column in duplicate_keys
    ):
        duplicate_count = int(housing_df.duplicated(duplicate_keys).sum())
        if duplicate_count:
            messages.append(f"Found {duplicate_count} duplicate geographic records")

    level_column = "Geographic Level"
    if level_column in housing_df.columns:
        valid_levels = set(validation_config.get("valid_levels", []))
        invalid_levels = set(housing_df[level_column].dropna()) - valid_levels
        if invalid_levels:
            messages.append(
                "Invalid geographic levels: "
                + ", ".join(sorted(str(level) for level in invalid_levels))
            )

    nonnegative_columns = validation_config.get(
        "nonnegative_columns",
        validation_config.get("nonnegative_numeric_columns", []),
    )
    negative_columns = []
    for column in nonnegative_columns:
        if column not in housing_df.columns:
            continue
        values = pd.to_numeric(housing_df[column], errors="coerce")
        if values.lt(0).any():
            negative_columns.append(column)
    if negative_columns:
        messages.append(
            f"Numeric columns contain negative values: {', '.join(negative_columns)}"
        )

    return not messages, messages
