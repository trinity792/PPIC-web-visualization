from pathlib import Path

from lib.pophousing_config import (
    ARCHIVE_DATA_PATH,
    CURRENT_DATA_PATH,
    DELETION_LOG_DIR,
    DOWNLOAD_DIR,
    HISTORICAL_DATA_PATH,
    ROOT_DIR,
)


def get_paths():
    return {
        "project_root": Path(ROOT_DIR),
        "download_directory": Path(DOWNLOAD_DIR),
        "archive_directory": Path(ARCHIVE_DATA_PATH),
        "current_data_path": Path(CURRENT_DATA_PATH),
        "historical_data_path": Path(HISTORICAL_DATA_PATH),
        "deletion_log_directory": Path(DELETION_LOG_DIR),
    }
