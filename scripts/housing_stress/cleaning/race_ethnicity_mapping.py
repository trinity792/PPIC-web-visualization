"""
race_ethnicity_mapping.py — reconciles the 9 ACS B25140 race iterations to canonical labels.

Data sources:
    - Schema config — race_iteration_map and race_reconciliation_map

Outputs:
    - pandas.DataFrame — with a Race/Ethnicity column reconciled to canonical values

Usage:
    Called by geographic_levels.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/cleaning/
"""

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# The 9 stored categories: the 7 canonical projections groups plus "Other" (some
# other race alone) and "All" (base table). "White" is sourced from ACS iteration
# H (White alone, not Hispanic) so it does not double-count Hispanic. "Other" and
# "All" have no projections counterpart and must never be folded into "Multiracial".
CANONICAL_RACE_GROUPS = [
    "All",
    "White",
    "Black",
    "Asian",
    "NHPI",
    "AIAN",
    "Multiracial",
    "Hispanic",
    "Other",
]

# B25140 table iteration id -> canonical race label. Iteration "a" (White alone,
# includes Hispanic) is deliberately unused in favor of "h" (White non-Hispanic).
RACE_ITERATION_MAP = {
    "b25140": "All",
    "b25140b": "Black",
    "b25140c": "AIAN",
    "b25140d": "Asian",
    "b25140e": "NHPI",
    "b25140f": "Other",
    "b25140g": "Multiracial",
    "b25140h": "White",
    "b25140i": "Hispanic",
}


"""
========================================================================================================================
Reconciliation
========================================================================================================================
"""


def get_canonical_race_groups():
    """Return the ordered list of 9 canonical race/ethnicity labels stored in the contract. Test file: scripts/unit_tests/housing_stress/cleaning/test_race_ethnicity_mapping.py"""
    return list(CANONICAL_RACE_GROUPS)


def reconcile_race_label(df, race_column, reconciliation_map):
    """
    Map raw iteration labels to canonical labels, validating that no raw label is unmapped.

    Does not mutate the input; other columns are preserved.

    Raises:
        ValueError — if any raw label has no canonical mapping (all unmapped labels listed).

    Test file: scripts/unit_tests/housing_stress/cleaning/test_race_ethnicity_mapping.py
    """
    values = df[race_column]
    unmapped = sorted(set(values[~values.isin(reconciliation_map)].tolist()))
    if unmapped:
        raise ValueError(f"Unmapped race labels: {unmapped}")

    result = df.copy()
    result[race_column] = values.map(reconciliation_map)
    return result
