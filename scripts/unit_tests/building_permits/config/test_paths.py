from pathlib import Path

from scripts.building_permits.config.paths import get_paths


def test_get_paths_project_root():
    paths = get_paths()

    assert paths["project_root"] == Path(__file__).resolve().parents[4]


def test_get_paths_uses_building_permits_directories():
    paths = get_paths()

    assert paths["download_directory"].parts[-2:] == (
        "data-raw",
        "building-permits",
    )
    assert paths["archive_directory"].parts[-2:] == (
        "archive",
        "building-permits",
    )
    assert paths["logs_directory"].parts[-1:] == ("logs",)
    assert paths["current_data_path"].parts[-3:] == (
        "data-cleaned",
        "building-permits",
        "BuildingPermits_Current.csv",
    )
    assert paths["historical_data_path"] == paths["current_data_path"]


def test_get_paths_includes_california_counties_geography():
    paths = get_paths()

    assert paths["california_counties_geojson_path"].parts[-3:] == (
        "data-raw",
        "building-permits",
        "california-counties.geojson",
    )


def test_get_paths_values_are_path_objects():
    paths = get_paths()

    assert paths
    assert all(isinstance(path, Path) for path in paths.values())
