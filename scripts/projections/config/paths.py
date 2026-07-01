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
        "historical_data_path": current_data_path,
        "download_directory": raw_directory,
        "archive_directory": archive_directory,
        "manual_p3_path": raw_directory / "P-3_Downloaded.csv",
        "manual_ccest_path": raw_directory / "cc-est_Downloaded.csv",
    }
