"""
e5_retention.py — archives expired DoF E-5 workbooks and writes advance deletion warnings.

Data sources:
    - {download_directory}/E-5-{YEAR}_Geo_InternetVersion.xlsx — cached E-5 workbooks

Outputs:
    - {archive_directory}/E-5-{YEAR}_Geo_InternetVersion.xlsx — archived expired workbooks
    - {deletion_log_directory}/{WORKBOOK}_deletion-warning-{DAYS}-days.txt — warning logs

Usage:
    python scripts/pophousing/archives/e5_retention.py

Test Folders:
    - scripts/unit_tests/pophousing/archives/
"""

import math
import re
import time
from datetime import datetime
from pathlib import Path

from scripts.shared.archives.file_retention import archive_or_delete_files, find_files_older_than

"""
========================================================================================================================
E-5 Retention
========================================================================================================================
"""


def cleanup_old_e5_files(
    download_directory,
    archive_directory,
    max_age_days,
    filename_pattern=r"E-5-\d{4}_Geo_InternetVersion\.xlsx",
    warning_days=(15, 10, 5, 1),
    deletion_log_directory=None,
):
    """Archive expired E-5 workbooks and create due warnings. Test file: scripts/unit_tests/pophousing/archives/test_e5_retention.py"""
    download_directory = Path(download_directory)
    if not download_directory.exists():
        return {"archived_files": [], "warning_files": []}
    if not download_directory.is_dir():
        raise NotADirectoryError(download_directory)

    matching_files = sorted(
        file_path
        for file_path in download_directory.iterdir()
        if file_path.is_file() and re.fullmatch(filename_pattern, file_path.name)
    )
    warning_files = []
    if deletion_log_directory is not None:
        warning_files = write_deletion_warnings(
            matching_files,
            warning_days,
            deletion_log_directory,
            max_age_days,
        )

    expired_files = find_files_older_than(download_directory, max_age_days, filename_pattern)
    archived_files = archive_or_delete_files(expired_files, archive_directory)
    return {"archived_files": archived_files, "warning_files": warning_files}


def write_deletion_warnings(file_paths, warning_days, deletion_log_directory, max_age_days=60):
    """Write one warning log per file at configured age thresholds. Test file: scripts/unit_tests/pophousing/archives/test_e5_retention.py"""
    if max_age_days <= 0:
        raise ValueError("max_age_days must be greater than zero")

    warning_days = set(warning_days)
    if any(not isinstance(day, int) or isinstance(day, bool) or day <= 0 for day in warning_days):
        raise ValueError("warning_days must contain positive integers")

    deletion_log_directory = Path(deletion_log_directory)
    deletion_log_directory.mkdir(parents=True, exist_ok=True)
    current_timestamp = time.time()
    created_warning_files = []

    for file_path in map(Path, file_paths):
        if not file_path.is_file():
            continue

        age_days = (current_timestamp - file_path.stat().st_mtime) / 86_400
        days_remaining = math.ceil(max_age_days - age_days)
        if days_remaining not in warning_days:
            continue

        safe_stem = re.sub(r"[^A-Za-z0-9_.-]", "_", file_path.stem)
        warning_path = deletion_log_directory / f"{safe_stem}_deletion-warning-{days_remaining}-days.txt"
        if warning_path.exists():
            continue

        warning_path.write_text(
            f"{file_path.name} will be archived from {file_path.parent} in approximately "
            f"{days_remaining} day(s), on "
            f"{datetime.fromtimestamp(file_path.stat().st_mtime + max_age_days * 86_400).date().isoformat()}.\n",
            encoding="utf-8",
        )
        created_warning_files.append(warning_path)

    return created_warning_files
