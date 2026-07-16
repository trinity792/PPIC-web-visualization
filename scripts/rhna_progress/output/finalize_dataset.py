"""
finalize_dataset.py — orders/casts the contract columns and performs the atomic, conditional write.

Data sources:
    - the validated long RHNA Progress frame
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — existing output

Outputs:
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — updated canonical dataset
    - data/archive/RHNA-progress-report/RHNAProgress_{TIMESTAMP}.csv — archived prior output

Usage:
    Called by the RHNA Progress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/output/
"""

from datetime import datetime

import pandas as pd

_INT_COLUMNS = ("Units", "RHNA", "Cycle", "Total Days", "Elapsed Days", "Tiers Met", "Tiers With Goal")
_FLOAT_COLUMNS = (
    "Percent",
    "Projected Units",
    "On Track Score",
    "Percent Elapsed",
    "Overall Progress",
    "Overall On Track Score",
)
_BOOL_COLUMNS = ("Most Recent", "Cycle Started")

"""
========================================================================================================================
Output Preparation
========================================================================================================================
"""


def _to_bool(value):
    """Coerce a stored flag ('True'/'False'/bool) to a Python bool."""
    if isinstance(value, bool):
        return value
    return str(value).strip().upper() in {"TRUE", "T", "YES", "1"}


def finalize_dataset(df, schema_config):
    """Order columns to the canonical schema and return the frame ready to persist. Test file: scripts/unit_tests/rhna_progress/output/test_finalize_dataset.py"""
    output_columns = schema_config["output_columns"]
    missing = [column for column in output_columns if column not in df.columns]
    if missing:
        raise ValueError(f"Cannot finalize; missing contract columns: {missing}")

    result = df[output_columns].copy()
    for column in _INT_COLUMNS:
        if column in result.columns:
            result[column] = pd.to_numeric(result[column], errors="coerce").astype("Int64")
    for column in _FLOAT_COLUMNS:
        if column in result.columns:
            result[column] = pd.to_numeric(result[column], errors="coerce").astype("Float64")
    for column in _BOOL_COLUMNS:
        if column in result.columns:
            result[column] = result[column].map(_to_bool).astype(bool)
    return result


"""
========================================================================================================================
Conditional Atomic Write
========================================================================================================================
"""


def write_dataset(df, paths, new_snapshot):
    """
    Atomically write RHNAProgress_Current.csv (staged .tmp + os.replace) only when new_snapshot is True; refresh the archive per retention. Returns the output path or None.

    Test file: scripts/unit_tests/rhna_progress/output/test_finalize_dataset.py
    """
    if not new_snapshot:
        return None

    current_path = paths["current_data_path"]
    archive_directory = paths["archive_directory"]
    new_csv = df.to_csv(index=False)

    if current_path.exists():
        archive_directory.mkdir(parents=True, exist_ok=True)
        prefix = current_path.stem.split("_")[0]
        timestamp = datetime.now().strftime("%m-%d-%y")
        archive_path = archive_directory / f"{prefix}_{timestamp}.csv"
        archive_path.write_bytes(current_path.read_bytes())

    current_path.parent.mkdir(parents=True, exist_ok=True)
    # Stage to a temp file and atomically replace so a crash mid-write can never leave a
    # truncated CSV that would poison the accumulated snapshot series on the next load.
    temporary_path = current_path.with_name(f"{current_path.name}.tmp")
    try:
        temporary_path.write_text(new_csv)
        temporary_path.replace(current_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    return current_path
