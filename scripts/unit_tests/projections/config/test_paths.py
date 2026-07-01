from pathlib import Path

from scripts.projections.config.paths import get_paths


def test_get_paths_project_root():
    # Act
    paths = get_paths()

    # Assert
    assert paths["project_root"] == Path(__file__).resolve().parents[4]


def test_get_paths_uses_demographic_projections_directories():
    # Act
    paths = get_paths()

    # Assert
    assert paths["download_directory"].parts[-2:] == (
        "data-raw",
        "demographic-projections",
    )
    assert paths["archive_directory"].parts[-2:] == (
        "archive",
        "demographic-projections",
    )
    assert paths["current_data_path"].parts[-3:] == (
        "data-cleaned",
        "demographic-projections",
        "DemographicProjections_Current.csv",
    )


def test_get_paths_values_are_path_objects():
    # Act
    paths = get_paths()

    # Assert
    assert paths
    assert all(isinstance(path, Path) for path in paths.values())
