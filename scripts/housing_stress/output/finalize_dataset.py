"""
finalize_dataset.py — orders columns, casts types, and performs conditional archival for the contract CSV.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — updated canonical dataset
    - data/archive/housing-stress/{module_id}_HousingStress_{YYYY-MM-DD}.csv — archived prior output (when data changed)

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/output/
"""

import pandas as pd

from scripts.shared.archives.dataset_archive import archive_and_save  # noqa: F401 - re-exported for callers

# Contract columns whose types are cast on output, regardless of config.
_INTEGER_COLUMNS = ["Year"]
_NUMBER_COLUMNS = ["Number Over 30%", "Number Over 50%"]
_SHARE_COLUMNS = ["Share Over 30%", "Share Over 50%"]
_SORT_COLUMNS = ["Year", "Geographic Level", "Location", "Race/Ethnicity", "Tenure"]


"""
========================================================================================================================
Output Preparation
========================================================================================================================
"""


def prepare_output(df, schema_config):
    """
    Enforce contract column order, cast numeric types, and sort rows for the final CSV.

    Raises:
        ValueError — if any contract column is missing from df.

    Test file: scripts/unit_tests/housing_stress/output/test_finalize_dataset.py
    """
    output_columns = schema_config["output_columns"]
    missing = [column for column in output_columns if column not in df.columns]
    if missing:
        raise ValueError(f"Cannot prepare output; missing contract columns: {missing}")

    result = df[output_columns].copy()
    for column in _INTEGER_COLUMNS:
        if column in result.columns:
            result[column] = pd.to_numeric(result[column]).astype(int)
    for column in _NUMBER_COLUMNS:
        if column in result.columns:
            result[column] = pd.to_numeric(result[column])
    for column in _SHARE_COLUMNS:
        if column in result.columns:
            result[column] = pd.to_numeric(result[column]).astype(float)

    return result.sort_values(_SORT_COLUMNS, ignore_index=True)


# archive_and_save is the shared helper (scripts.shared.archives.dataset_archive), imported
# above rather than reimplemented here — see docs/PPIC Summer 2026/refractor-guide/
# shared-archive-and-save-plan.md, Workstream C. This module has two callers (the live
# pipeline and the backfill driver) that archive into the same directory under different
# module_id values ("housing-stress" / "housing-stress-backfill") so the live archive and
# the deep-history seed archive never collide on name.
