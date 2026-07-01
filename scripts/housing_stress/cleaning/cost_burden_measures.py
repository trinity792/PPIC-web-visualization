"""
cost_burden_measures.py — derives the four cost-burden measures for each tenure label from B25140 estimate columns.

This is the single shared implementation of the tenure/burden math that the legacy module
copy-pasted into all three geographic builders. It consumes a frame whose estimate columns
(E001..E013) have already been aggregated to the target geography, and emits one row per
(input row) x (tenure label).

Data sources:
    - Aggregated estimate frame (state rows, or PUMA-summed county/region rows)
    - Schema config — tenure_formulas

Outputs:
    - pandas.DataFrame — long by tenure, with Number/Share Over 30%/50% columns

Usage:
    Called by geographic_levels.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/cleaning/
"""

import numpy as np
import pandas as pd

"""
========================================================================================================================
Cost-Burden Measures
========================================================================================================================
"""


def _referenced_columns(tenure_formulas):
    """Return the sorted set of estimate columns referenced by any tenure formula."""
    referenced = set()
    for formula in tenure_formulas.values():
        for key in ("num_30", "num_50", "denom"):
            referenced.update(formula[key])
    return sorted(referenced)


def compute_tenure_measures(df, id_columns, schema_config):
    """
    Expand each geography row into 5 tenure rows and compute the four cost-burden measures.

    For each tenure, sums the configured numerator columns for the 30% and 50% thresholds
    and divides by the configured denominator to get shares. A zero denominator yields NA
    (not infinity). Does not mutate the input.

    Returns:
        pandas.DataFrame — id_columns + Tenure + the four measure columns, five rows per input row.

    Raises:
        ValueError — if any estimate column referenced by a tenure formula is absent from df.

    Test file: scripts/unit_tests/housing_stress/cleaning/test_cost_burden_measures.py
    """
    tenure_formulas = schema_config["tenure_formulas"]
    tenure_column = schema_config["tenure_column"]
    number_30, number_50, share_30, share_50 = schema_config["measure_columns"]

    missing = [column for column in _referenced_columns(tenure_formulas) if column not in df.columns]
    if missing:
        raise ValueError(f"Estimate columns required by tenure formulas are missing from the data: {missing}")

    blocks = []
    for tenure, formula in tenure_formulas.items():
        numerator_30 = df[formula["num_30"]].sum(axis=1)
        numerator_50 = df[formula["num_50"]].sum(axis=1)
        denominator = df[formula["denom"]].sum(axis=1)

        with np.errstate(divide="ignore", invalid="ignore"):
            fraction_30 = numerator_30 / denominator
            fraction_50 = numerator_50 / denominator
        fraction_30 = fraction_30.where(denominator != 0)
        fraction_50 = fraction_50.where(denominator != 0)

        block = df[id_columns].copy()
        block[tenure_column] = tenure
        block[number_30] = numerator_30.to_numpy()
        block[number_50] = numerator_50.to_numpy()
        block[share_30] = fraction_30.to_numpy()
        block[share_50] = fraction_50.to_numpy()
        blocks.append(block)

    return pd.concat(blocks, ignore_index=True)
