from pathlib import Path

from scripts.pophousing.config.paths import get_paths


def test_get_paths_project_root():
    # Act
    paths = get_paths()

    # Assert
    assert paths["project_root"] == Path(__file__).resolve().parents[4]


def test_get_paths_housing_directories():
    # Act
    paths = get_paths()

    # Assert
    assert paths["download_directory"].parts[-2:] == ("data-raw", "housing-population")
    assert paths["current_data_path"].parts[-3:] == (
        "data-cleaned",
        "housing-population",
        "PopHousing_Current.csv",
    )


def test_get_paths_values_are_path_objects():
    # Act
    paths = get_paths()

    # Assert
    assert all(isinstance(path, Path) for path in paths.values())
