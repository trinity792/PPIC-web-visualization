from pathlib import Path

from scripts.rhna_progress.config.paths import get_paths


def test_get_paths_project_root():
    paths = get_paths()

    assert paths["project_root"] == Path(__file__).resolve().parents[4]


def test_get_paths_uses_rhna_progress_directories():
    paths = get_paths()

    assert paths["download_directory"].parts[-2:] == (
        "data-raw",
        "RHNA-progress-report",
    )
    assert paths["archive_directory"].parts[-2:] == (
        "archive",
        "RHNA-progress-report",
    )
    assert paths["current_data_path"].parts[-3:] == (
        "data-cleaned",
        "RHNA-progress-report",
        "RHNAProgress_Current.csv",
    )
    assert paths["historical_data_path"].parts[-3:] == (
        "data-cleaned",
        "RHNA-progress-report",
        "RHNAProgress_Historical.csv",
    )


def test_get_paths_includes_manual_fallback_and_crosswalk():
    paths = get_paths()

    assert paths["manual_download_path"].parts[-3:] == (
        "data-raw",
        "RHNA-progress-report",
        "RHNAProgress_Downloaded.csv",
    )
    assert paths["jurisdiction_crosswalk_path"].parts[-3:] == (
        "data-raw",
        "RHNA-progress-report",
        "jurisdiction_county_crosswalk.csv",
    )


def test_get_paths_includes_codebook_details_and_logs():
    paths = get_paths()

    assert paths["codebook_directory"].parts[-2:] == (
        "Codebooks",
        "RHNA-progress-report",
    )
    assert paths["details_path"].parts[-2:] == ("details", "RHNAInfo.json")
    assert paths["logs_directory"].name == "logs"


def test_get_paths_values_are_path_objects():
    paths = get_paths()

    assert paths
    assert all(isinstance(path, Path) for path in paths.values())

