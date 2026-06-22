from pathlib import Path


def get_paths():
    project_root = Path(__file__).resolve().parents[3]
    data_directory = project_root / "data"
    cleaned_housing_directory = data_directory / "data-cleaned" / "housing-population"
    return {
        "project_root": project_root,
        "download_directory": data_directory / "data-raw" / "housing-population",
        "archive_directory": data_directory / "archive" / "housing-population",
        "current_data_path": cleaned_housing_directory / "PopHousing_Current.csv",
        "historical_data_path": cleaned_housing_directory / "PopHousing_Current.csv",
        "deletion_log_directory": project_root / "logs" / "deletions",
    }
