"""
paths.py — exposes Building Permits pipeline paths as pathlib objects.

Data sources:
    - lib.config — project, data, archive, download, and log path settings

Outputs:
    - dict — named pathlib.Path values used throughout the pipeline

Usage:
    python scripts/building_permits/config/paths.py

Test Folders:
    - scripts/unit_tests/building_permits/config/
"""

from pathlib import Path

from lib.config import get_project_paths

"""
========================================================================================================================
Path Configuration
========================================================================================================================
"""


def get_paths():
    """Return configured pipeline paths (data-cleaned, archive, download cache, logs) as pathlib objects. Test file: scripts/unit_tests/building_permits/config/test_paths.py"""
    project_paths = get_project_paths()
    cleaned_directory = project_paths["cleaned_data_directory"] / "building-permits"
    raw_directory = project_paths["raw_data_directory"] / "building-permits"
    archive_directory = project_paths["archive_directory"] / "building-permits"
    current_data_path = cleaned_directory / "BuildingPermits_Current.csv"
    return {
        "project_root": Path(project_paths["project_root"]),
        "current_data_path": current_data_path,
        # Immutable deep-history seed (2010-01…2023-12), read-only and distinct from the
        # live output. The Census only hosts a ~2-year rolling window of monthly files, so
        # the pre-2024 series cannot be re-fetched; this artifact is its system of record
        # and is never in the pipeline's write path. See the guide's "Deep-history seed".
        "historical_data_path": cleaned_directory / "BuildingPermits_Historical.csv",
        "download_directory": raw_directory,
        "archive_directory": archive_directory,
        "logs_directory": Path(project_paths["logs_directory"]),
        # County geometry used by the frontend map to broadcast metro/region values.
        "california_counties_geojson_path": raw_directory / "california-counties.geojson",
    }
