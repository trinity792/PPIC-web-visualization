"""
demographic_rates.py — recalculates Components of Change demographic rate and population-change columns.

Data sources:
    - pandas.DataFrame inputs — cleaned DoF, Census, or merged Components records

Outputs:
    - pandas.DataFrame — copied records with crude rates and population-change metrics recalculated

Usage:
    python scripts/components_of_change/calculations/demographic_rates.py

Test Folders:
    - scripts/unit_tests/components_of_change/calculations/
"""

import numpy as np
import pandas as pd

"""
========================================================================================================================
Demographic Calculations
========================================================================================================================
"""


def add_crude_rates(dataframe, population_col, components_map):
    """Add crude demographic rate columns using component / population * 1000. Test file: scripts/unit_tests/components_of_change/calculations/test_demographic_rates.py"""
    required_columns = [population_col, *components_map.values()]
    missing_columns = [column for column in required_columns if column not in dataframe.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    result = dataframe.copy()
    population = pd.to_numeric(result[population_col], errors="coerce")
    for rate_column, component_column in components_map.items():
        component_values = pd.to_numeric(result[component_column], errors="coerce")
        # Guard the denominator so a zero (or missing) population yields 0 rather than
        # inf/-inf, which would pass the validator and blow out a chart scale (B6).
        rate = np.where(population > 0, component_values.div(population).mul(1000), 0.0)
        result[rate_column] = pd.Series(rate, index=result.index)
    return result


def recalculate_population_change(dataframe, group_col, population_col):
    """Recalculate percent and numeric population change within each location. Test file: scripts/unit_tests/components_of_change/calculations/test_demographic_rates.py"""
    required_columns = [group_col, population_col, "Year"]
    missing_columns = [column for column in required_columns if column not in dataframe.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")

    result = dataframe.copy()
    result["Year"] = pd.to_numeric(result["Year"], errors="coerce")
    result[population_col] = pd.to_numeric(result[population_col], errors="coerce")
    result = result.sort_values([group_col, "Year"], kind="stable").reset_index(drop=True)
    grouped_population = result.groupby(group_col, sort=False)[population_col]
    result["Percent Change in Population"] = (grouped_population.pct_change() * 100).round(2)
    result["Numeric Change in Population"] = grouped_population.diff()
    return result
