from datetime import datetime, timedelta

from scripts.pophousing.archives.e5_retention import cleanup_old_e5_files, write_deletion_warnings


def test_cleanup_old_e5_files_uses_e5_pattern(tmp_path, set_file_age):
    # Arrange
    matching_file = tmp_path / "E-5-2020_Geo_InternetVersion.xlsx"
    other_file = tmp_path / "E-8-2020_Geo_InternetVersion.xlsx"
    matching_file.touch()
    other_file.touch()
    set_file_age(matching_file, 61)
    set_file_age(other_file, 61)

    # Act
    cleanup_old_e5_files(tmp_path, tmp_path / "archive", 60)

    # Assert
    assert not matching_file.exists()
    assert other_file.exists()


def test_cleanup_old_e5_files_archives_not_deletes(tmp_path, set_file_age):
    # Arrange
    download_directory = tmp_path / "downloads"
    download_directory.mkdir()
    old_file = download_directory / "E-5-2020_Geo_InternetVersion.xlsx"
    old_file.write_bytes(b"workbook")
    set_file_age(old_file, 61)
    archive_directory = tmp_path / "archive"

    # Act
    cleanup_old_e5_files(download_directory, archive_directory, 60)

    # Assert
    assert (archive_directory / old_file.name).read_bytes() == b"workbook"


def test_cleanup_old_e5_files_respects_max_age(tmp_path, set_file_age):
    # Arrange
    recent_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    recent_file.touch()
    set_file_age(recent_file, 59)

    # Act
    cleanup_old_e5_files(tmp_path, tmp_path / "archive", 60)

    # Assert
    assert recent_file.exists()


def test_cleanup_old_e5_files_empty_directory(tmp_path):
    # Act
    result = cleanup_old_e5_files(tmp_path, tmp_path / "archive", 60)

    # Assert
    assert result == {"archived_files": [], "warning_files": []}


def test_cleanup_old_e5_files_returns_archived_paths(tmp_path, set_file_age):
    # Arrange
    old_file = tmp_path / "E-5-2020_Geo_InternetVersion.xlsx"
    old_file.touch()
    set_file_age(old_file, 61)
    archive_directory = tmp_path / "archive"

    # Act
    result = cleanup_old_e5_files(tmp_path, archive_directory, 60)

    # Assert
    assert result["archived_files"] == [archive_directory / old_file.name]


def test_write_deletion_warnings_creates_warning_file(tmp_path, set_file_age):
    # Arrange
    source_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    source_file.touch()
    set_file_age(source_file, 45)

    # Act
    results = write_deletion_warnings([source_file], [15], tmp_path / "logs", 60)

    # Assert
    assert len(results) == 1
    assert results[0].is_file()


def test_write_deletion_warnings_multiple_thresholds(tmp_path, set_file_age):
    # Arrange
    source_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    source_file.touch()
    set_file_age(source_file, 50)

    # Act
    results = write_deletion_warnings([source_file], [15, 10, 5, 1], tmp_path / "logs", 60)

    # Assert
    assert results[0].name.endswith("deletion-warning-10-days.txt")


def test_write_deletion_warnings_no_warnings_needed(tmp_path, set_file_age):
    # Arrange
    source_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    source_file.touch()
    set_file_age(source_file, 20)

    # Act
    results = write_deletion_warnings([source_file], [15, 10, 5, 1], tmp_path / "logs", 60)

    # Assert
    assert results == []


def test_write_deletion_warnings_creates_log_directory(tmp_path, set_file_age):
    # Arrange
    source_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    source_file.touch()
    set_file_age(source_file, 45)
    log_directory = tmp_path / "nested" / "logs"

    # Act
    write_deletion_warnings([source_file], [15], log_directory, 60)

    # Assert
    assert log_directory.is_dir()


def test_write_deletion_warnings_warning_content(tmp_path, set_file_age):
    # Arrange
    source_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    source_file.touch()
    set_file_age(source_file, 45)
    projected_date = (datetime.fromtimestamp(source_file.stat().st_mtime) + timedelta(days=60)).date().isoformat()

    # Act
    warning_path = write_deletion_warnings([source_file], [15], tmp_path / "logs", 60)[0]
    warning_content = warning_path.read_text(encoding="utf-8")

    # Assert
    assert source_file.name in warning_content
    assert projected_date in warning_content


def test_write_deletion_warnings_no_duplicate_warnings(tmp_path, set_file_age):
    # Arrange
    source_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    source_file.touch()
    set_file_age(source_file, 45)
    log_directory = tmp_path / "logs"

    # Act
    first_results = write_deletion_warnings([source_file], [15], log_directory, 60)
    second_results = write_deletion_warnings([source_file], [15], log_directory, 60)

    # Assert
    assert len(first_results) == 1
    assert second_results == []
