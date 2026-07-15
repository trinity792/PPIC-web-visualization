"""
finalize_dataset.py — orders columns, casts types, and performs conditional archival for the contract CSV.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — updated canonical dataset
    - data/archive/building-permits/BuildingPermits_{TIMESTAMP}.csv — archived prior output (when data changed)

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/output/
"""

from datetime import datetime

import pandas as pd

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


"""
========================================================================================================================
Conditional Archival
========================================================================================================================
"""


def archive_and_save(df, current_path, archive_directory):
    """
    Save only when the data changed; archive the prior version with an mm-dd-yy timestamp.

    If the existing CSV is content-identical to what would be written, no file is touched.
    Otherwise the existing file is copied to archive_directory with a timestamp and the new
    data is written **atomically** (to a temp file, then renamed over current_path) so a
    crash mid-write can never leave a truncated CSV — the highest-consequence robustness
    guard in this module, since a truncated write would silently destroy the only copy of
    the irreplaceable pre-2024 deep history on the next load.

    Returns:
        pathlib.Path or None — the output path if written, None if skipped.

    Test file: scripts/unit_tests/building_permits/output/test_finalize_dataset.py
    """
    new_csv = df.to_csv(index=False)

    if current_path.exists():
        if current_path.read_text() == new_csv:
            return None
        archive_directory.mkdir(parents=True, exist_ok=True)
        prefix = current_path.stem.split("_")[0]
        timestamp = datetime.now().strftime("%m-%d-%y")
        archive_path = archive_directory / f"{prefix}_{timestamp}.csv"
        archive_path.write_bytes(current_path.read_bytes())

    current_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = current_path.with_name(f"{current_path.name}.tmp")
    try:
        temporary_path.write_text(new_csv)
        temporary_path.replace(current_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    return current_path
