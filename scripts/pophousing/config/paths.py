"""
paths.py — exposes Population & Housing pipeline paths as pathlib objects.

Data sources:
    - lib/pophousing_config.py — project, data, archive, download, and log path settings

Outputs:
    - dict — named pathlib.Path values used throughout the pipeline

Usage:
    python scripts/pophousing/config/paths.py

Test Folders:
    - scripts/unit_tests/pophousing/config/
"""

from pathlib import Path

from lib.pophousing_config import (
    ARCHIVE_DATA_PATH,
    CURRENT_DATA_PATH,
    DELETION_LOG_DIR,
    DOWNLOAD_DIR,
    HISTORICAL_DATA_PATH,
    ROOT_DIR,
)

"""
========================================================================================================================
Path Configuration
========================================================================================================================
"""


def get_paths():
    """Return configured pipeline paths as pathlib objects. Test file: scripts/unit_tests/pophousing/config/test_paths.py"""
    return {
        "project_root": Path(ROOT_DIR),
        "download_directory": Path(DOWNLOAD_DIR),
        "archive_directory": Path(ARCHIVE_DATA_PATH),
        "current_data_path": Path(CURRENT_DATA_PATH),
        "historical_data_path": Path(HISTORICAL_DATA_PATH),
        "deletion_log_directory": Path(DELETION_LOG_DIR),
        "logs_directory": Path(DELETION_LOG_DIR).parent,
    }
