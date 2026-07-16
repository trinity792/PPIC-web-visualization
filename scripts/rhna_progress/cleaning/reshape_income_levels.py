"""
reshape_income_levels.py — appends the Total row and melts the wide tiers into the long Income Level grain.

Data sources:
    - the typed wide frame from income_measures

Outputs:
    - pandas.DataFrame — five rows per jurisdiction-snapshot (four tiers + Total)

Usage:
    Called by the RHNA Progress cleaning phase; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/cleaning/
"""

import pandas as pd

"""
========================================================================================================================
Long Reshape
========================================================================================================================
"""


def reshape_to_income_levels(wide_df, schema_config):
    """
    Append the summed Total row (Units/RHNA = tier sums, Percent = Total/goal) then melt the four tiers + Total into the long (Income Level, Units, RHNA, Percent) grain, one row per level.

    Test file: scripts/unit_tests/rhna_progress/cleaning/test_reshape_income_levels.py
    """
    tier_levels = schema_config["tier_income_levels"]
    tier_columns = schema_config["income_tier_columns"]

    measure_columns = set()
    for columns in tier_columns.values():
        measure_columns.update([columns["units"], columns["rhna"], columns["percent"]])
    metadata_columns = [column for column in wide_df.columns if column not in measure_columns]

    frames = []
    for level in tier_levels:
        columns = tier_columns[level]
        sub = wide_df[metadata_columns].copy()
        sub["Income Level"] = level
        sub["Units"] = wide_df[columns["units"]].to_numpy()
        sub["RHNA"] = wide_df[columns["rhna"]].to_numpy()
        sub["Percent"] = wide_df[columns["percent"]].to_numpy()
        frames.append(sub)

    tier_units_columns = [tier_columns[level]["units"] for level in tier_levels]
    tier_rhna_columns = [tier_columns[level]["rhna"] for level in tier_levels]
    total_units = wide_df[tier_units_columns].sum(axis=1)
    total_rhna = wide_df[tier_rhna_columns].sum(axis=1)
    # Percent is only defined where the goal is positive; a zero-goal Total stays null
    # (matching the tier Infinity/#DIV/0! sentinel handling) instead of dividing by zero.
    total_percent = pd.Series(pd.NA, index=wide_df.index, dtype="Float64")
    has_goal = total_rhna > 0
    total_percent[has_goal] = total_units[has_goal].astype("Float64") / total_rhna[has_goal].astype("Float64")

    total = wide_df[metadata_columns].copy()
    total["Income Level"] = "Total"
    total["Units"] = total_units.to_numpy()
    total["RHNA"] = total_rhna.to_numpy()
    total["Percent"] = total_percent.to_numpy()
    frames.append(total)

    return pd.concat(frames, ignore_index=True)
