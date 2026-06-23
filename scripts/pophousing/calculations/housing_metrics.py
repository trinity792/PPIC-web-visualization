"""
housing_metrics.py — derives housing-unit totals and recalculates vacancy and household rates.

Data sources:
    - pandas.DataFrame inputs — canonical Population & Housing unit and population values

Outputs:
    - pandas.DataFrame — housing records with derived totals or recalculated rates

Usage:
    python scripts/pophousing/calculations/housing_metrics.py

Test Folders:
    - scripts/unit_tests/pophousing/calculations/
"""

import numpy as np
import pandas as pd

"""
========================================================================================================================
Housing Metrics
========================================================================================================================
"""


def add_housing_derived_columns(housing_df):
    """Add single-family, multifamily, and vacant-unit totals. Test file: scripts/unit_tests/pophousing/calculations/test_housing_metrics.py"""
    required_columns = [
        "Single Family Detached Units",
        "Single Family Attached Units",
        "Two to Four Family Units",
        "Five Plus Family Units",
        "Total Housing Units",
        "Occupied Units",
    ]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    numeric_values = result[required_columns].apply(
        pd.to_numeric, errors="coerce"
    ).fillna(0)
    result["Single Family Units"] = (
        numeric_values["Single Family Detached Units"]
        + numeric_values["Single Family Attached Units"]
    )
    result["Multiple Family Units"] = (
        numeric_values["Two to Four Family Units"]
        + numeric_values["Five Plus Family Units"]
    )
    result["Vacant Units"] = (
        numeric_values["Total Housing Units"]
        - numeric_values["Occupied Units"]
    )
    return result


def recalculate_housing_rates(housing_df, row_mask):
    """Recalculate vacancy and persons-per-household rates for selected rows. Test file: scripts/unit_tests/pophousing/calculations/test_housing_metrics.py"""
    required_columns = [
        "Vacant Units",
        "Total Housing Units",
        "Household Population",
        "Occupied Units",
    ]
    missing_columns = [
        column for column in required_columns if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")
    if not housing_df.index.equals(row_mask.index):
        raise ValueError("row_mask must align with housing_df index")

    result = housing_df.copy()
    selected_rows = row_mask.astype(bool)
    values = result[required_columns].apply(pd.to_numeric, errors="coerce").fillna(0)
    vacancy_rates = np.where(
        values["Total Housing Units"].gt(0),
        values["Vacant Units"] / values["Total Housing Units"] * 100,
        0,
    )
    persons_per_household = np.where(
        values["Occupied Units"].gt(0),
        values["Household Population"] / values["Occupied Units"],
        0,
    )
    if "Vacancy Rate (%)" not in result.columns:
        result["Vacancy Rate (%)"] = 0.0
    if "Persons Per Household" not in result.columns:
        result["Persons Per Household"] = 0.0
    result.loc[selected_rows, "Vacancy Rate (%)"] = vacancy_rates[selected_rows]
    result.loc[selected_rows, "Persons Per Household"] = persons_per_household[
        selected_rows
    ]
    return result
