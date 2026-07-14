"""
finalize_dataset.py — orders columns, casts types, and performs conditional archival for the contract CSV.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — updated canonical dataset
    - data/archive/housing-stress/HousingStress_Current_{TIMESTAMP}.csv — archived prior output (when data changed)

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/output/
"""

import hashlib
import os
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd

# Contract columns whose types are cast on output, regardless of config.
_INTEGER_COLUMNS = ["Year"]
_NUMBER_COLUMNS = ["Number Over 30%", "Number Over 50%"]
_SHARE_COLUMNS = ["Share Over 30%", "Share Over 50%"]
_SORT_COLUMNS = ["Year", "Geographic Level", "Location", "Race/Ethnicity", "Tenure"]
_HASH_CHUNK_BYTES = 1 << 20  # 1 MiB streaming reads for the byte-identity check


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


"""
========================================================================================================================
Conditional Archival
========================================================================================================================
"""


def archive_and_save(df, current_path, archive_directory):
    """
    Save only when the data changed; archive the prior version with an mm-dd-yy timestamp.

    If the existing CSV is byte-identical to what would be written, no file is touched.
    Otherwise the existing file is copied to archive_directory with a timestamp and the new
    data overwrites current_path. Decoupled from any chart rendering.

    Returns:
        pathlib.Path or None — the output path if written, None if skipped.

    Test file: scripts/unit_tests/housing_stress/output/test_finalize_dataset.py
    """
    current_path = Path(current_path)
    archive_directory = Path(archive_directory)
    new_bytes = df.to_csv(index=False).encode("utf-8")

    if current_path.is_file():
        # Compare by streamed hash so a match leaves the existing file byte- and
        # mtime-identical and never holds a second full-file copy in memory.
        if _sha256_of_file(current_path) == hashlib.sha256(new_bytes).hexdigest():
            return None
        archive_directory.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%m-%d-%y")
        archive_path = archive_directory / f"{current_path.stem}_{timestamp}{current_path.suffix}"
        shutil.copy2(current_path, archive_path)

    current_path.parent.mkdir(parents=True, exist_ok=True)
    # Write atomically: stage to a sibling temp file, then os.replace() it into
    # place (atomic on the same filesystem), so a crash mid-write can never leave a
    # truncated contract file — which also doubles as the next run's history.
    # Ordering: archive old -> write tmp -> atomic replace.
    tmp_path = current_path.with_suffix(current_path.suffix + ".tmp")
    try:
        tmp_path.write_bytes(new_bytes)
        os.replace(tmp_path, current_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
    return current_path


def _sha256_of_file(path):
    """Return the SHA-256 hex digest of a file read in fixed-size chunks."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(_HASH_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()
