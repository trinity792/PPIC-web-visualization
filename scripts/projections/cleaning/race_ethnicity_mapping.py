"""
race_ethnicity_mapping.py — maps raw race/ethnicity codes to the canonical 7-group set.

Data sources:
    - Schema config — source-specific code-to-label maps from get_schema_config()

Outputs:
    - pandas.DataFrame — with a canonical Race/Ethnicity column replacing raw codes

Usage:
    Called by dof_p3_cleaner.py and census_ccest_cleaner.py; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

# ── Constants ─────────────────────────────────────────────────────────────────

CANONICAL_RACE_GROUPS = [
    "White",
    "Black",
    "AIAN",
    "Asian",
    "NHPI",
    "Multiracial",
    "Hispanic",
]

# P-3 race7 codes from the DoF data dictionary (Baseline 2024, Vintage 2026).
P3_RACE7_CODE_MAP = {
    1: "White",        # White, Non-Hispanic
    2: "Black",        # Black, Non-Hispanic
    3: "AIAN",         # American Indian or Alaska Native, Non-Hispanic
    4: "Asian",        # Asian, Non-Hispanic
    5: "NHPI",         # Native Hawaiian or Pacific Islander, Non-Hispanic
    6: "Multiracial",  # Multiracial (two or more of above races), Non-Hispanic
    7: "Hispanic",     # Hispanic (any race)
}


# ── Functions ─────────────────────────────────────────────────────────────────


def get_canonical_race_groups():
    """Return the ordered list of 7 canonical race/ethnicity group labels. Test file: scripts/unit_tests/projections/cleaning/test_race_ethnicity_mapping.py"""
    return list(CANONICAL_RACE_GROUPS)


def map_race_ethnicity(df, raw_column, source_code_map):
    """Replace raw race/ethnicity codes with canonical group labels. Test file: scripts/unit_tests/projections/cleaning/test_race_ethnicity_mapping.py"""
    unmapped = sorted(
        (value for value in df[raw_column].unique() if value not in source_code_map),
        key=str,
    )
    if unmapped:
        raise ValueError(f"Unmapped race/ethnicity code(s): {unmapped}")

    result = df.copy()
    result["Race/Ethnicity"] = result[raw_column].map(source_code_map)
    return result.drop(columns=[raw_column])


def validate_race_mapping_completeness(df, race_column):
    """Assert that every row has a mapped value and no raw codes remain. Test file: scripts/unit_tests/projections/cleaning/test_race_ethnicity_mapping.py"""
    messages = []
    column = df[race_column]
    if column.isnull().any():
        messages.append(f"{race_column} contains null values")

    canonical = set(CANONICAL_RACE_GROUPS)
    non_canonical = sorted(
        {str(value) for value in column.dropna().unique() if value not in canonical}
    )
    if non_canonical:
        messages.append(f"{race_column} contains non-canonical (raw) values: {non_canonical}")

    return len(messages) == 0, messages
