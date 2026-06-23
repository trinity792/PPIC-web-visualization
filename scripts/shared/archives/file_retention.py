"""
file_retention.py — finds expired files and either archives or permanently deletes them.

Data sources:
    - {directory}/{FILENAME} — files evaluated by name pattern and modification age

Outputs:
    - {archive_directory}/{FILENAME} — uniquely named archived files when an archive is configured
    - file deletion — source files are permanently removed when no archive directory is configured
    - list[pathlib.Path] — archived destinations or deleted source paths

Usage:
    python scripts/shared/archives/file_retention.py

Test Folders:
    - scripts/unit_tests/shared/archives/
"""

import re
import shutil
import time
from pathlib import Path

"""
========================================================================================================================
File Retention
========================================================================================================================
"""


def find_files_older_than(directory, max_age_days, filename_pattern):
    """Find matching files at or beyond an age threshold. Test file: scripts/unit_tests/shared/archives/test_file_retention.py"""
    if max_age_days < 0:
        raise ValueError("max_age_days must be non-negative")

    directory = Path(directory)
    if not directory.exists():
        raise FileNotFoundError(f"Directory not found: {directory}")
    if not directory.is_dir():
        raise NotADirectoryError(directory)

    pattern = re.compile(filename_pattern)
    cutoff_timestamp = time.time() - (max_age_days * 86_400)
    return sorted(
        file_path
        for file_path in directory.iterdir()
        if file_path.is_file()
        and pattern.fullmatch(file_path.name)
        and file_path.stat().st_mtime <= cutoff_timestamp
    )


def archive_or_delete_files(file_paths, archive_directory):
    """Archive files uniquely or delete them when no archive is configured. Test file: scripts/unit_tests/shared/archives/test_file_retention.py"""
    archived_or_deleted_paths = []
    archive_directory = Path(archive_directory) if archive_directory is not None else None

    if archive_directory is not None:
        archive_directory.mkdir(parents=True, exist_ok=True)

    for file_path in map(Path, file_paths):
        if not file_path.exists():
            continue
        if not file_path.is_file():
            raise IsADirectoryError(file_path)

        if archive_directory is None:
            file_path.unlink()
            archived_or_deleted_paths.append(file_path)
            continue

        destination = archive_directory / file_path.name
        suffix_number = 1
        while destination.exists():
            destination = archive_directory / f"{file_path.stem}_{suffix_number}{file_path.suffix}"
            suffix_number += 1

        shutil.move(str(file_path), destination)
        archived_or_deleted_paths.append(destination)

    return archived_or_deleted_paths
