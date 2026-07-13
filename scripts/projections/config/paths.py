"""
paths.py — exposes Demographic Projections pipeline paths as pathlib objects.

Data sources:
    - lib.config — project data directory settings

Outputs:
    - dict — current, historical, raw download, archive, and manual-fallback paths
      used throughout the Demographic Projections pipeline

Usage:
    python scripts/projections/config/paths.py

Test Folders:
    - scripts/unit_tests/projections/config/
"""

from pathlib import Path

from lib.config import get_project_paths

"""
========================================================================================================================
Path Configuration
========================================================================================================================
"""


def get_paths():
    """Return configured pipeline paths as pathlib objects. Test file: scripts/unit_tests/projections/config/test_paths.py"""
    project_paths = get_project_paths()
    cleaned_directory = project_paths["cleaned_data_directory"] / "demographic-projections"
    raw_directory = project_paths["raw_data_directory"] / "demographic-projections"
    archive_directory = project_paths["archive_directory"] / "demographic-projections"
    current_data_path = cleaned_directory / "DemographicProjections_Current.csv"
    return {
        "project_root": Path(project_paths["project_root"]),
        "current_data_path": current_data_path,
        # Immutable deep-history seed, distinct from the live output and read-only
        # to the pipeline, so pre-existing years stop being re-derived solely from
        # the last run's own output each cycle (A5). Absent on a fresh checkout;
        # the pipeline then cold-starts on live data + current output alone (B5).
        "historical_data_path": cleaned_directory / "DemographicProjections_Historical.csv",
        "download_directory": raw_directory,
        "archive_directory": archive_directory,
        "logs_directory": Path(project_paths["logs_directory"]),
        "manual_dof_path": raw_directory / "P-3_Downloaded.csv",
        "manual_census_path": raw_directory / "cc-est_Downloaded.csv",
    }
