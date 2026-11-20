from pathlib import Path

from scripts.zillow_affordability.config.paths import get_paths


def test_get_paths_returns_every_named_path_as_a_path():
    paths = get_paths()

    expected = {
        "project_root",
        "current_data_path",
        "snapshot_directory",
        "download_directory",
        "manual_directory",
        "archive_directory",
        "logs_directory",
    }
    assert expected <= set(paths)
    assert all(isinstance(paths[key], Path) for key in expected)


def test_paths_follow_the_topic_slug_and_naming_convention():
    paths = get_paths()

    assert paths["current_data_path"].name == "ZillowAffordability_Current.csv"
    assert paths["current_data_path"].parent.name == "zillow-affordability"
    assert paths["snapshot_directory"].parent == paths["current_data_path"].parent
    assert paths["download_directory"].name == "zillow-affordability"
    assert paths["download_directory"].parent.name == "data-raw"
    assert paths["manual_directory"].parent == paths["download_directory"]
    assert paths["archive_directory"].name == "zillow-affordability"
