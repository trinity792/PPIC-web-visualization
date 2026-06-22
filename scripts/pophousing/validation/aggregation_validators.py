import pandas as pd

from scripts.shared.validation.dataframe_validators import validate_numeric_range


def validate_normalized_housing_rates(housing_df, year_col, rate_col, level_col):
    required_columns = [year_col, rate_col, level_col]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    messages = []
    range_violations = validate_numeric_range(
        housing_df, rate_col, 0, 100, row_mask=None
    )
    if not range_violations.empty:
        messages.append(
            f"Found {len(range_violations)} vacancy rates outside 0 to 100"
        )

    years = pd.to_numeric(housing_df[year_col], errors="coerce")
    rates = pd.to_numeric(housing_df[rate_col], errors="coerce")
    suspicious_mask = (
        years.ge(2020)
        & rates.gt(0.01)
        & rates.lt(1.0)
        & housing_df[level_col].ne("State")
    )
    if suspicious_mask.any():
        messages.append(
            f"Found {int(suspicious_mask.sum())} suspected decimal fractions"
        )
    return not messages, messages
