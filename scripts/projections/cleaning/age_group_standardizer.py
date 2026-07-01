"""
age_group_standardizer.py — defines canonical 5-year age groups and provides binning/normalization utilities.

The P-3 source provides single-year ages (0-110) that must be binned into 5-year groups.
The Census cc-est source provides coded 5-year groups that map directly to the same
canonical set. This module owns the bin edges, the canonical labels, and both conversion
paths so the two cleaners produce identical age group values.

Data sources:
    - Schema config — bin edges and label normalization maps from get_schema_config()

Outputs:
    - pandas.DataFrame — with a canonical Age Group column

Usage:
    Called by dof_p3_cleaner.py and census_ccest_cleaner.py; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

import pandas as pd

# ── Constants ─────────────────────────────────────────────────────────────────

# Bin edges for converting single-year ages to 5-year groups. Ages 0-4 go into the
# first bin, 5-9 into the second, etc. Ages 85-110 all go into the open-ended "85+" bin.
AGE_BIN_EDGES = list(range(0, 90, 5))

CANONICAL_AGE_GROUPS = [
    "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39",
    "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79",
    "80-84", "85+",
]

_MAX_AGE = 110
_TOP_BIN_INDEX = len(CANONICAL_AGE_GROUPS) - 1


# ── Functions ─────────────────────────────────────────────────────────────────


def get_canonical_age_groups():
    """Return the ordered list of canonical 5-year age group labels. Test file: scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py"""
    return list(CANONICAL_AGE_GROUPS)


def get_age_bin_edges():
    """Return the bin edge list for single-year-to-5-year conversion. Test file: scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py"""
    return list(AGE_BIN_EDGES)


def assign_age_group_from_single_year(df, age_column):
    """Map single-year integer ages to 5-year group labels using AGE_BIN_EDGES. Test file: scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py"""
    ages = pd.to_numeric(df[age_column], errors="coerce")
    out_of_range = sorted({int(age) for age in ages.dropna() if age < 0 or age > _MAX_AGE})
    if out_of_range:
        raise ValueError(f"Ages outside 0-{_MAX_AGE} cannot be assigned to a group: {out_of_range}")

    result = df.copy()
    result["Age Group"] = [CANONICAL_AGE_GROUPS[min(int(age) // 5, _TOP_BIN_INDEX)] for age in ages]
    return result


def standardize_age_group_labels(df, raw_column, label_map):
    """Normalize variant age-group labels from non-P-3 sources to canonical labels. Test file: scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py"""
    unmapped = sorted(
        (value for value in df[raw_column].unique() if value not in label_map),
        key=str,
    )
    if unmapped:
        raise ValueError(f"Unmapped age-group label(s): {unmapped}")

    result = df.copy()
    result["Age Group"] = result[raw_column].map(label_map)
    return result.drop(columns=[raw_column])


def validate_age_group_completeness(df, age_column):
    """Assert that every row has a mapped value and no raw labels or ages remain. Test file: scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py"""
    messages = []
    column = df[age_column]
    if column.isnull().any():
        messages.append(f"{age_column} contains null values")

    canonical = set(CANONICAL_AGE_GROUPS)
    non_canonical = sorted(
        {str(value) for value in column.dropna().unique() if value not in canonical}
    )
    if non_canonical:
        messages.append(f"{age_column} contains non-canonical (raw) values: {non_canonical}")

    return len(messages) == 0, messages
