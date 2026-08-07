"""
finalize_dataset.py — orders columns, casts types, and performs conditional archival for the contract CSV.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — updated canonical dataset
    - data/archive/building-permits/building-permits_BuildingPermits_{YYYY-MM-DD}.csv — archived prior output (when data changed)

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/output/
"""

import pandas as pd

from scripts.shared.archives.dataset_archive import archive_and_save  # noqa: F401 - re-exported for callers

# Contract columns whose types are cast on output, regardless of config.
_MEASURE_COLUMNS = ["Total", "1 Unit", "2 Units", "3 and 4 Units", "5 Units or More"]
_DATE_COLUMN = "Date"
_SORT_COLUMNS = ["Date", "Geographic Level", "Location"]


"""
========================================================================================================================
Output Preparation
========================================================================================================================
"""


def prepare_output(df, schema_config):
    """
    Enforce contract column order, sort rows, and cast types for the final CSV.

    Raises:
        ValueError — if any contract column is missing from df.

    Test file: scripts/unit_tests/building_permits/output/test_finalize_dataset.py
    """
    output_columns = schema_config["output_columns"]
    missing = [column for column in output_columns if column not in df.columns]
    if missing:
        raise ValueError(f"Cannot prepare output; missing contract columns: {missing}")

    result = df[output_columns].copy()
    if _DATE_COLUMN in result.columns:
        result[_DATE_COLUMN] = result[_DATE_COLUMN].astype(str)
    for column in _MEASURE_COLUMNS:
        if column in result.columns:
            result[column] = pd.to_numeric(result[column]).astype(int)

    return result.sort_values(_SORT_COLUMNS, ignore_index=True)


# archive_and_save is the shared helper (scripts.shared.archives.dataset_archive), imported
# above rather than reimplemented here — see docs/PPIC Summer 2026/refractor-guide/
# shared-archive-and-save-plan.md, Workstream B.
