"""
finalize_dataset.py — assigns geographic levels, orders columns, and performs conditional archival.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — updated canonical dataset
    - data/archive/demographic-projections/{FILENAME}_{TIMESTAMP}.csv — archived prior output (when data changed)

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/output/
"""

import hashlib
import os
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd

_HASH_CHUNK_BYTES = 1 << 20  # 1 MiB streaming reads for the byte-identity check

_SORT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Source",
]

"""
========================================================================================================================
Geographic Level Assignment
========================================================================================================================
"""


def assign_geographic_level(df, geography_config):
    """Tag each row with its Geographic Level based on Location and Source. Test file: scripts/unit_tests/projections/output/test_finalize_dataset.py"""
    counties = set(geography_config["california_counties"])
    regions = set(geography_config["region_names"])
    us_states = set(geography_config["us_state_names"])

    result = df.copy()
    location = result["Location"]

    # Vectorized equivalent of the priority ladder
    # (US State > State > County > Region > Other): start at the lowest priority
    # and overwrite upward so the highest-priority match wins.
    level = pd.Series("Other", index=result.index)
    level = level.mask(location.isin(regions), "Region")
    level = level.mask(location.isin(counties), "County")
    level = level.mask(location == "California", "State")
    level = level.mask((result["Source"] == "Census cc-est") & location.isin(us_states), "US State")

    result["Geographic Level"] = level
    return result


"""
========================================================================================================================
Output Preparation
========================================================================================================================
"""


def prepare_projections_output(df, schema_config):
    """Enforce contract column order, sort rows, and cast types for the final CSV. Test file: scripts/unit_tests/projections/output/test_finalize_dataset.py"""
    output_columns = schema_config["output_columns"]
    missing = [column for column in output_columns if column not in df.columns]
    if missing:
        raise ValueError(f"Missing contract column(s): {', '.join(missing)}")

    result = df.copy()
    result["Year"] = pd.to_numeric(result["Year"]).astype("int64")
    sort_columns = [column for column in _SORT_COLUMNS if column in result.columns]
    result = result.sort_values(sort_columns).reset_index(drop=True)
    return result[output_columns]


def archive_and_save(df, current_path, archive_directory):
    """Compare the new dataset against the existing file and save only when data changed. Test file: scripts/unit_tests/projections/output/test_finalize_dataset.py"""
    current_path = Path(current_path)
    archive_directory = Path(archive_directory)
    new_bytes = df.to_csv(index=False).encode("utf-8")

    if current_path.is_file():
        # Compare by streamed hash so we never hold a second full-file string in
        # memory; on a match the existing file is left byte- and mtime-identical.
        if _sha256_of_file(current_path) == hashlib.sha256(new_bytes).hexdigest():
            return None
        archive_directory.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%m-%d-%y")
        archive_path = archive_directory / f"{current_path.stem}_{timestamp}{current_path.suffix}"
        # Copy the file rather than round-tripping its contents through a string.
        shutil.copy2(current_path, archive_path)

    current_path.parent.mkdir(parents=True, exist_ok=True)
    # Write atomically (B1): stage to a sibling temp file, then os.replace() it
    # into place. os.replace is atomic on the same filesystem, so a crash
    # mid-write can never leave a truncated contract file — which also doubles as
    # the next run's history. Ordering: archive old -> write tmp -> atomic replace.
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
