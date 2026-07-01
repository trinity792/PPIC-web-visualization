from pathlib import Path

from scripts.housing_stress.config.paths import get_paths


def test_get_paths_project_root():
    paths = get_paths()

    assert paths["project_root"] == Path(__file__).resolve().parents[4]


def test_get_paths_uses_housing_stress_directories():
    paths = get_paths()

    assert paths["download_directory"].parts[-2:] == ("data-raw", "housing-stress")
    assert paths["archive_directory"].parts[-2:] == ("archive", "housing-stress")
    assert paths["current_data_path"].parts[-3:] == (
        "data-cleaned",
        "housing-stress",
        "HousingStress_Current.csv",
    )


def test_get_paths_includes_both_puma_crosswalks():
    paths = get_paths()

    assert paths["county_crosswalk_path"].parts[-3:] == (
        "data-raw",
        "housing-stress",
        "puma_counties_xwalk_2020.csv",
    )
    assert paths["region_crosswalk_path"].parts[-3:] == (
        "data-raw",
        "housing-stress",
        "puma_regions_xwalk_2020.csv",
    )


def test_get_paths_includes_both_manual_fallback_paths():
    paths = get_paths()

    assert paths["manual_state_path"].parts[-2:] == (
        "housing-stress",
        "HousingStress_States_Downloaded.csv",
    )
    assert paths["manual_ca_path"].parts[-2:] == (
        "housing-stress",
        "HousingStress_CA_Downloaded.csv",
    )


def test_get_paths_values_are_path_objects():
    paths = get_paths()

    assert paths
    assert all(isinstance(path, Path) for path in paths.values())
