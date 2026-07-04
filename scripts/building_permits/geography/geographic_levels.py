"""
geographic_levels.py — validates CA metro names against shared config and tags geographic level.

Data sources:
    - Cleaned CA-metro rows from metro_permits_cleaner
    - Cleaned 50-state rows from state_permits_cleaner
    - scripts/shared/geography/california_geography.py — canonical cbsa_metros set

Outputs:
    - pandas.DataFrame — level-tagged State/Metro contract rows

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/geography/
"""

import pandas as pd

_LEVEL_COLUMN = "Geographic Level"
_SORT_COLUMNS = ["Geographic Level", "Location", "Date"]


def validate_metro_names(metro_df, geography):
    """
    Confirm every cleaned metro Location is one of the canonical shared metro names.

    Raises if any Location is not in california_geography's cbsa_metros. Returns the
    frame unchanged (same object) on success.

    Test file: scripts/unit_tests/building_permits/geography/test_geographic_levels.py
    """
    canonical = set(geography["cbsa_metros"])
    unknown = sorted(set(metro_df["Location"]) - canonical)
    if unknown:
        raise ValueError(f"Unknown metro names not in shared cbsa_metros: {unknown}")
    return metro_df


def tag_geographic_levels(state_df, metro_df):
    """
    Concatenate state and metro frames with a Geographic Level column.

    State rows are tagged "State", metro rows "Metro". Returns the combined frame with
    contract column order, sorted by Geographic Level, Location, Date.

    Test file: scripts/unit_tests/building_permits/geography/test_geographic_levels.py
    """
    states = state_df.copy()
    states[_LEVEL_COLUMN] = "State"
    metros = metro_df.copy()
    metros[_LEVEL_COLUMN] = "Metro"

    combined = pd.concat([states, metros], ignore_index=True)
    measure_columns = [column for column in state_df.columns if column not in ("Location", "Date")]
    ordered = combined[[_LEVEL_COLUMN, "Location", "Date", *measure_columns]]
    return ordered.sort_values(_SORT_COLUMNS, ignore_index=True)
