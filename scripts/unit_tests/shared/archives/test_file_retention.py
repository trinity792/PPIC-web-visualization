from pathlib import Path

import pytest

from scripts.shared.archives.file_retention import archive_or_delete_files, find_files_older_than

PATTERN = r"data-\d+\.csv"


def test_find_files_older_than_empty_directory(tmp_path):
    # Arrange
    directory = tmp_path / "files"
    directory.mkdir()

    # Act
    results = find_files_older_than(directory, 30, PATTERN)

    # Assert
    assert results == []


def test_find_files_older_than_no_matches(tmp_path, set_file_age):
    # Arrange
    new_file = tmp_path / "data-1.csv"
    new_file.touch()
    set_file_age(new_file, 5)

    # Act
    results = find_files_older_than(tmp_path, 30, PATTERN)

    # Assert
    assert results == []


def test_find_files_older_than_all_match(tmp_path, set_file_age):
    # Arrange
    files = [tmp_path / "data-1.csv", tmp_path / "data-2.csv"]
    for file_path in files:
        file_path.touch()
        set_file_age(file_path, 31)

    # Act
    results = find_files_older_than(tmp_path, 30, PATTERN)

    # Assert
    assert results == files


def test_find_files_older_than_mixed_ages(tmp_path, set_file_age):
    # Arrange
    old_file = tmp_path / "data-1.csv"
    new_file = tmp_path / "data-2.csv"
    old_file.touch()
    new_file.touch()
    set_file_age(old_file, 31)
    set_file_age(new_file, 29)

    # Act
    results = find_files_older_than(tmp_path, 30, PATTERN)

    # Assert
    assert results == [old_file]


def test_find_files_older_than_pattern_filtering(tmp_path, set_file_age):
    # Arrange
    matching_file = tmp_path / "data-1.csv"
    other_file = tmp_path / "notes.txt"
    matching_file.touch()
    other_file.touch()
    set_file_age(matching_file, 31)
    set_file_age(other_file, 31)

    # Act
    results = find_files_older_than(tmp_path, 30, PATTERN)

    # Assert
    assert results == [matching_file]


def test_find_files_older_than_boundary_age(tmp_path, set_file_age):
    # Arrange: files at the threshold are expired (inclusive boundary).
    boundary_file = tmp_path / "data-1.csv"
    boundary_file.touch()
    set_file_age(boundary_file, 30)

    # Act
    results = find_files_older_than(tmp_path, 30, PATTERN)

    # Assert
    assert results == [boundary_file]


def test_find_files_older_than_nonexistent_directory(tmp_path):
    # Arrange
    missing_directory = tmp_path / "missing"

    # Act / Assert
    with pytest.raises(FileNotFoundError, match="Directory not found"):
        find_files_older_than(missing_directory, 30, PATTERN)


def test_find_files_older_than_ignores_subdirectories(tmp_path, set_file_age):
    # Arrange
    subdirectory = tmp_path / "data-1.csv"
    nested_file = subdirectory / "data-2.csv"
    subdirectory.mkdir()
    nested_file.touch()
    set_file_age(nested_file, 31)

    # Act
    results = find_files_older_than(tmp_path, 30, PATTERN)

    # Assert
    assert results == []


def test_archive_or_delete_files_moves_single_file(tmp_path):
    # Arrange
    source_file = tmp_path / "source" / "data.csv"
    source_file.parent.mkdir()
    source_file.write_text("content", encoding="utf-8")
    archive_directory = tmp_path / "archive"

    # Act
    results = archive_or_delete_files([source_file], archive_directory)

    # Assert
    assert results == [archive_directory / "data.csv"]
    assert not source_file.exists()


def test_archive_or_delete_files_moves_multiple_files(tmp_path):
    # Arrange
    source_directory = tmp_path / "source"
    source_directory.mkdir()
    source_files = [source_directory / "a.csv", source_directory / "b.csv"]
    for source_file in source_files:
        source_file.touch()

    # Act
    results = archive_or_delete_files(source_files, tmp_path / "archive")

    # Assert
    assert [path.name for path in results] == ["a.csv", "b.csv"]
    assert all(not source_file.exists() for source_file in source_files)


def test_archive_or_delete_files_creates_archive_directory(tmp_path):
    # Arrange
    source_file = tmp_path / "data.csv"
    source_file.touch()
    archive_directory = tmp_path / "new" / "archive"

    # Act
    archive_or_delete_files([source_file], archive_directory)

    # Assert
    assert archive_directory.is_dir()


def test_archive_or_delete_files_empty_list(tmp_path):
    # Arrange
    archive_directory = tmp_path / "archive"

    # Act
    results = archive_or_delete_files([], archive_directory)

    # Assert
    assert results == []


def test_archive_or_delete_files_nonexistent_file(tmp_path):
    # Arrange
    missing_file = tmp_path / "missing.csv"

    # Act
    results = archive_or_delete_files([missing_file], tmp_path / "archive")

    # Assert
    assert results == []


def test_archive_or_delete_files_name_collision(tmp_path):
    # Arrange: collisions are renamed, never overwritten.
    source_file = tmp_path / "source" / "data.csv"
    source_file.parent.mkdir()
    source_file.write_text("new", encoding="utf-8")
    archive_directory = tmp_path / "archive"
    archive_directory.mkdir()
    (archive_directory / "data.csv").write_text("existing", encoding="utf-8")

    # Act
    results = archive_or_delete_files([source_file], archive_directory)

    # Assert
    assert results == [archive_directory / "data_1.csv"]
    assert (archive_directory / "data.csv").read_text(encoding="utf-8") == "existing"


def test_archive_or_delete_files_preserves_content(tmp_path):
    # Arrange
    source_file = tmp_path / "data.bin"
    expected_content = b"\x00\x01\x02"
    source_file.write_bytes(expected_content)

    # Act
    archived_path = archive_or_delete_files([source_file], tmp_path / "archive")[0]

    # Assert
    assert archived_path.read_bytes() == expected_content


def test_archive_or_delete_files_delete_mode(tmp_path):
    # Arrange
    source_file = tmp_path / "data.csv"
    source_file.touch()

    # Act
    results = archive_or_delete_files([source_file], archive_directory=None)

    # Assert
    assert results == [Path(source_file)]
    assert not source_file.exists()
