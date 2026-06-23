"""
aggregation_validators.py — validates normalized housing rates after geographic aggregation.

Data sources:
    - pandas.DataFrame input — aggregated housing records containing years, rates, and levels

Outputs:
    - tuple — validity flag and validation-message list

Usage:
    python scripts/pophousing/validation/aggregation_validators.py

Test Folders:
    - scripts/unit_tests/pophousing/validation/
"""

import pandas as pd

from scripts.shared.validation.dataframe_validators import validate_numeric_range

"""
========================================================================================================================
Aggregation Validation
========================================================================================================================
"""


def validate_normalized_housing_rates(housing_df, year_col, rate_col, level_col):
    """Validate rate ranges and detect likely decimal fractions. Test file: scripts/unit_tests/pophousing/validation/test_aggregation_validators.py"""
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
