"""
precomputed_totals.py — generates pre-aggregated "All Ages", "Both Sexes", and "All" race rows.

Data sources:
    - Merged DataFrame from the merge/regional aggregation phase

Outputs:
    - pandas.DataFrame — input rows plus newly computed aggregation rows

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/aggregation/
"""

import pandas as pd

# ── Individual Aggregators ────────────────────────────────────────────────────


def add_all_ages_totals(df, age_column, population_column, groupby_columns):
    """Sum population across all age groups and append rows labeled "All Ages". Test file: scripts/unit_tests/projections/aggregation/test_precomputed_totals.py"""
    totals = df.groupby(groupby_columns, as_index=False)[population_column].sum()
    totals[age_column] = "All Ages"
    return pd.concat([df, totals], ignore_index=True)


def add_both_sexes_totals(df, sex_column, population_column, groupby_columns):
    """Sum population across Male and Female and append rows labeled "Both Sexes". Test file: scripts/unit_tests/projections/aggregation/test_precomputed_totals.py"""
    totals = df.groupby(groupby_columns, as_index=False)[population_column].sum()
    totals[sex_column] = "Both Sexes"
    return pd.concat([df, totals], ignore_index=True)


def add_all_races_totals(df, race_column, population_column, groupby_columns):
    """Sum population across all race/ethnicity groups and append rows labeled "All". Test file: scripts/unit_tests/projections/aggregation/test_precomputed_totals.py"""
    totals = df.groupby(groupby_columns, as_index=False)[population_column].sum()
    totals[race_column] = "All"
    return pd.concat([df, totals], ignore_index=True)


# ── Orchestrator ──────────────────────────────────────────────────────────────


def build_precomputed_totals(df, schema_config):
    """Orchestrate all three aggregation dimensions, respecting the correct order. Test file: scripts/unit_tests/projections/aggregation/test_precomputed_totals.py"""
    age_column = schema_config["age_group_column"]
    sex_column = schema_config["sex_column"]
    race_column = schema_config["race_column"]
    population_column = schema_config["population_column"]

    with_ages = add_all_ages_totals(
        df, age_column, population_column, _groupby_except(df, {age_column, population_column})
    )
    with_sexes = add_both_sexes_totals(
        with_ages, sex_column, population_column, _groupby_except(with_ages, {sex_column, population_column})
    )
    return add_all_races_totals(
        with_sexes, race_column, population_column, _groupby_except(with_sexes, {race_column, population_column})
    )


def _groupby_except(df, excluded_columns):
    """Return every column except the aggregated dimension and the population column."""
    return [column for column in df.columns if column not in excluded_columns]
