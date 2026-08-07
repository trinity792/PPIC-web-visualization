"""
finalize_dataset.py — orders/casts the contract columns and performs the atomic, conditional write.

Data sources:
    - the validated long RHNA Progress frame
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — existing output

Outputs:
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — updated canonical dataset
    - data/archive/RHNA-progress-report/rhna-progress_RHNAProgress_{YYYY-MM-DD}.csv — archived prior output

Usage:
    Called by the RHNA Progress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/output/
"""

import pandas as pd

from scripts.shared.archives.dataset_archive import archive_and_save

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
    Save RHNAProgress_Current.csv only when new_snapshot is True, via the shared archive helper.

    The early return above is the "is this new" guard; by the time the shared helper runs, the
    caller has already established the data is new, so already_compared=True skips its own
    hash check and always archives + writes. Returns the output path or None.

    Test file: scripts/unit_tests/rhna_progress/output/test_finalize_dataset.py
    """
    if not new_snapshot:
        return None

    return archive_and_save(
        df,
        paths["current_data_path"],
        paths["archive_directory"],
        module_id="rhna-progress",
        already_compared=True,
    )
