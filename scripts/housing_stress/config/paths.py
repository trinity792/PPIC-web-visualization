"""
paths.py — exposes ACS Housing Stress pipeline paths as pathlib objects.

Data sources:
    - lib.config — project data directory settings

Outputs:
    - dict — current, raw download, archive, manual-fallback, and PUMA crosswalk
      paths used throughout the ACS Housing Stress pipeline

Usage:
    python scripts/housing_stress/config/paths.py

Test Folders:
    - scripts/unit_tests/housing_stress/config/
"""

from pathlib import Path

from lib.config import get_project_paths

"""
========================================================================================================================
Path Configuration
========================================================================================================================
"""


def get_paths():
    """Return configured pipeline paths as pathlib objects. Test file: scripts/unit_tests/housing_stress/config/test_paths.py"""
    project_paths = get_project_paths()
    cleaned_directory = project_paths["cleaned_data_directory"] / "housing-stress"
    raw_directory = project_paths["raw_data_directory"] / "housing-stress"
    archive_directory = project_paths["archive_directory"] / "housing-stress"
    current_data_path = cleaned_directory / "HousingStress_Current.csv"
    return {
        "project_root": Path(project_paths["project_root"]),
        "current_data_path": current_data_path,
        "historical_data_path": current_data_path,
        "download_directory": raw_directory,
        "archive_directory": archive_directory,
        # Separate manual-fallback files for the two acquisition scopes (50 states, CA PUMAs).
        "manual_state_path": raw_directory / "HousingStress_States_Downloaded.csv",
        "manual_ca_path": raw_directory / "HousingStress_CA_Downloaded.csv",
        "county_crosswalk_path": raw_directory / "puma_counties_xwalk_2020.csv",
        "region_crosswalk_path": raw_directory / "puma_regions_xwalk_2020.csv",
    }
