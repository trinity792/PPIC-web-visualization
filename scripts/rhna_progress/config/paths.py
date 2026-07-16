"""
paths.py — exposes RHNA Progress Report pipeline paths as pathlib objects.

Data sources:
    - lib.config — project, data, cleaned, raw, archive, and log path settings

Outputs:
    - dict — named pathlib.Path values used throughout the pipeline

Usage:
    python scripts/rhna_progress/config/paths.py

Test Folders:
    - scripts/unit_tests/rhna_progress/config/
"""

from pathlib import Path

from lib.config import get_project_paths

"""
========================================================================================================================
Path Configuration
========================================================================================================================
"""

_MODULE_SLUG = "RHNA-progress-report"


def get_paths():
    """
    Return RHNA Progress pipeline paths as pathlib objects (canonical, immutable seed, raw download dir, manual-fallback CSV, jurisdiction crosswalk, archive, codebook, details, logs).

    Test file: scripts/unit_tests/rhna_progress/config/test_paths.py
    """
    project_paths = get_project_paths()
    project_root = Path(project_paths["project_root"])
    cleaned_directory = project_paths["cleaned_data_directory"] / _MODULE_SLUG
    raw_directory = project_paths["raw_data_directory"] / _MODULE_SLUG
    archive_directory = project_paths["archive_directory"] / _MODULE_SLUG
    return {
        "project_root": project_root,
        "current_data_path": cleaned_directory / "RHNAProgress_Current.csv",
        # Immutable seed of any snapshots captured before the module went live; read-only
        # to the pipeline and unioned in during merge so a bad Current write cannot poison
        # the accumulated series.
        "historical_data_path": cleaned_directory / "RHNAProgress_Historical.csv",
        "download_directory": raw_directory,
        "manual_download_path": raw_directory / "RHNAProgress_Downloaded.csv",
        # Committed jurisdiction -> county crosswalk seeded from the DoF E-5 hierarchy by
        # the one-time builder; read-only on the per-run path.
        "jurisdiction_crosswalk_path": raw_directory / "jurisdiction_county_crosswalk.csv",
        "archive_directory": archive_directory,
        "codebook_directory": project_root / "docs" / "Codebooks" / _MODULE_SLUG,
        "details_path": project_paths["data_directory"] / "details" / "RHNAInfo.json",
        "logs_directory": Path(project_paths["logs_directory"]),
    }
