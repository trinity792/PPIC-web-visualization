"""
paths.py — exposes Components of Change pipeline paths as pathlib objects.

Data sources:
    - lib.config — project data directory settings
    - data/data-cleaned/components-of-change/ComponentsOfChange_Current.csv — canonical dataset when present

Outputs:
    - dict — current, archive, raw download, and GeoJSON paths used by Components modules

Usage:
    python scripts/components_of_change/config/paths.py

Test Folders:
    - scripts/unit_tests/components_of_change/config/
"""

from pathlib import Path

from lib.config import get_project_paths

"""
========================================================================================================================
Path Configuration
========================================================================================================================
"""


def get_paths():
    """Return configured Components pipeline paths. Test file: scripts/unit_tests/components_of_change/config/test_paths.py"""
    project_paths = get_project_paths()
    component_cleaned_dir = project_paths["cleaned_data_directory"] / "components-of-change"
    component_raw_dir = project_paths["raw_data_directory"] / "components-of-change"
    component_archive_dir = project_paths["archive_directory"] / "components-of-change"
    current_data_path = component_cleaned_dir / "ComponentsOfChange_Current.csv"
    return {
        "project_root": Path(project_paths["project_root"]),
        "current_data_path": current_data_path,
        "historical_data_path": current_data_path,
        "download_directory": component_raw_dir,
        "archive_directory": component_archive_dir,
        "logs_directory": Path(project_paths["logs_directory"]),
        "manual_dof_path": component_raw_dir / "E6_Downloaded.csv",
        "manual_census_path": component_raw_dir / "Census_Components_Downloaded.csv",
        "california_counties_geojson_path": component_raw_dir / "california-counties.geojson",
        "us_states_geojson_path": component_raw_dir / "us-states.json",
    }
