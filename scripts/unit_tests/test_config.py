"""Tests for project-wide, module-neutral configuration."""

from pathlib import Path

import lib.config as config


def test_get_project_paths_repository_layout():
    paths = config.get_project_paths()

    assert paths == {
        "project_root": Path(__file__).resolve().parents[2],
        "data_directory": Path(__file__).resolve().parents[2] / "data",
        "raw_data_directory": Path(__file__).resolve().parents[2]
        / "data"
        / "data-raw",
        "cleaned_data_directory": Path(__file__).resolve().parents[2]
        / "data"
        / "data-cleaned",
        "archive_directory": Path(__file__).resolve().parents[2]
        / "data"
        / "archive",
        "logs_directory": Path(__file__).resolve().parents[2] / "logs",
    }


def test_get_default_http_settings_returns_independent_headers():
    first_settings = config.get_default_http_settings()
    first_settings["headers"]["Unexpected"] = "value"

    second_settings = config.get_default_http_settings()

    assert "Unexpected" not in second_settings["headers"]


def test_general_config_has_no_pophousing_domain_constants():
    domain_constants = {
        "E5_COLUMN_NAMES",
        "REGIONS_MAPPING",
        "COUNTY_LEVEL",
        "ALL_TOWNS",
        "DOF_BASE_URL",
    }

    assert domain_constants.isdisjoint(vars(config))
