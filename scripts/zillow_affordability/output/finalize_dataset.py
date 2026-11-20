"""
finalize_dataset.py — orders, types, and saves the Zillow Housing Affordability table and its per-release snapshot.

Data sources:
    - pandas.DataFrame — the cleaned, validated table

Outputs:
    - data/data-cleaned/zillow-affordability/ZillowAffordability_Current.csv — latest release (via archive_and_save)
    - data/data-cleaned/zillow-affordability/snapshots/ZillowAffordability_Release_<YYYY-MM-DD>.csv — written once per release

Usage:
    from scripts.zillow_affordability.output.finalize_dataset import finalize_dataset

Test Folders:
    - scripts/unit_tests/zillow_affordability/output/
"""

from pathlib import Path

import pandas as pd

from scripts.shared.archives.dataset_archive import archive_and_save

"""
========================================================================================================================
Errors
========================================================================================================================
"""


class SnapshotConflictError(RuntimeError):
    """A snapshot for this release already exists with different contents; snapshots are never overwritten. Test file: scripts/unit_tests/zillow_affordability/output/test_finalize_dataset.py"""


"""
========================================================================================================================
Finalize
========================================================================================================================
"""

_MODULE_ID = "zillow-affordability"


def finalize_dataset(df, schema_config):
    """
    Return the table in contract column order, with pinned dtypes and a deterministic sort.

    Sort: Geographic Level (Nation first), Location, Housing Scenario (contract order), Date.

    Test file:
        scripts/unit_tests/zillow_affordability/output/test_finalize_dataset.py
    """
    prepared = df[schema_config["output_columns"]].copy()
    for column in schema_config["text_columns"]:
        prepared[column] = prepared[column].astype(str)
    for column in schema_config["measure_columns"]:
        prepared[column] = pd.to_numeric(prepared[column], errors="raise").astype("float64")
    level_rank = {value: index for index, value in enumerate(schema_config["geographic_level_order"])}
    scenario_rank = {value: index for index, value in enumerate(schema_config["scenario_order"])}
    prepared = prepared.assign(
        _level=prepared["Geographic Level"].map(level_rank),
        _scenario=prepared["Housing Scenario"].map(scenario_rank),
    )
    prepared = prepared.sort_values(["_level", "Location", "_scenario", "Date"], kind="mergesort")
    return prepared.drop(columns=["_level", "_scenario"]).reset_index(drop=True)


"""
========================================================================================================================
Save
========================================================================================================================
"""


def write_current_dataset(df, paths):
    """Save the current table through the shared archive_and_save; return the path, or None when bytes are unchanged. Test file: scripts/unit_tests/zillow_affordability/output/test_finalize_dataset.py"""
    return archive_and_save(df, paths["current_data_path"], paths["archive_directory"], _MODULE_ID)


def snapshot_path_for(paths, release_date):
    """Return the snapshot file path for a release date. Test file: scripts/unit_tests/zillow_affordability/output/test_finalize_dataset.py"""
    return Path(paths["snapshot_directory"]) / f"ZillowAffordability_Release_{release_date}.csv"


def write_release_snapshot(df, paths):
    """
    Write this release's snapshot once.

    An identical existing snapshot is left untouched (returns None). A different one with the
    same release date raises SnapshotConflictError: a snapshot is a permanent record and is
    never overwritten, so a developer must look at why one release produced two versions.

    Returns:
        Path of the written snapshot, or None when an identical one already exists.

    Test file:
        scripts/unit_tests/zillow_affordability/output/test_finalize_dataset.py
    """
    release_dates = df["Release Date"].unique()
    if len(release_dates) != 1:
        raise ValueError(f"a snapshot must hold exactly one release, found {sorted(release_dates)}")
    path = snapshot_path_for(paths, release_dates[0])
    new_bytes = df.to_csv(index=False).encode("utf-8")
    if path.exists():
        if path.read_bytes() == new_bytes:
            return None
        raise SnapshotConflictError(f"{path.name} already exists with different values; snapshots are never overwritten")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f"{path.name}.tmp")
    try:
        temporary_path.write_bytes(new_bytes)
        temporary_path.replace(path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    return path
