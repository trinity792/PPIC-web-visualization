"""
paths.py — exposes Zillow Housing Affordability pipeline paths as pathlib objects.

Data sources:
    - lib.config — project, cleaned, raw, archive, and log path settings

Outputs:
    - dict — named pathlib.Path values used throughout the pipeline

Usage:
    from scripts.zillow_affordability.config.paths import get_paths

Test Folders:
    - scripts/unit_tests/zillow_affordability/config/
"""

from pathlib import Path

from lib.config import get_project_paths

"""
========================================================================================================================
Path Configuration
========================================================================================================================
"""

_MODULE_SLUG = "zillow-affordability"


def get_paths():
    """
    Return Zillow Affordability pipeline paths (current table, snapshot folder, raw download folder, manual-fallback folder, archive, logs).

    Test file: scripts/unit_tests/zillow_affordability/config/test_paths.py
    """
    project_paths = get_project_paths()
    cleaned_directory = Path(project_paths["cleaned_data_directory"]) / _MODULE_SLUG
    raw_directory = Path(project_paths["raw_data_directory"]) / _MODULE_SLUG
    return {
        "project_root": Path(project_paths["project_root"]),
        "current_data_path": cleaned_directory / "ZillowAffordability_Current.csv",
        # One permanent file per Zillow release; written once, never overwritten.
        "snapshot_directory": cleaned_directory / "snapshots",
        "download_directory": raw_directory,
        # Manual fallback: all 12 files dropped here under Zillow's own filenames.
        "manual_directory": raw_directory / "manual",
        "archive_directory": Path(project_paths["archive_directory"]) / _MODULE_SLUG,
        "logs_directory": Path(project_paths["logs_directory"]),
    }
