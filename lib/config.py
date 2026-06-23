"""Project-wide configuration shared by current and future data modules."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIRECTORY = PROJECT_ROOT / "data"
RAW_DATA_DIRECTORY = DATA_DIRECTORY / "data-raw"
CLEANED_DATA_DIRECTORY = DATA_DIRECTORY / "data-cleaned"
ARCHIVE_DIRECTORY = DATA_DIRECTORY / "archive"
LOGS_DIRECTORY = PROJECT_ROOT / "logs"

DEFAULT_REQUEST_TIMEOUT_SECONDS = 60
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)


def get_project_paths():
    """Return common repository paths without module-specific subdirectories."""
    return {
        "project_root": PROJECT_ROOT,
        "data_directory": DATA_DIRECTORY,
        "raw_data_directory": RAW_DATA_DIRECTORY,
        "cleaned_data_directory": CLEANED_DATA_DIRECTORY,
        "archive_directory": ARCHIVE_DIRECTORY,
        "logs_directory": LOGS_DIRECTORY,
    }


def get_default_http_settings():
    """Return reusable HTTP defaults as fresh mutable values."""
    return {
        "headers": {"User-Agent": DEFAULT_USER_AGENT},
        "timeout_seconds": DEFAULT_REQUEST_TIMEOUT_SECONDS,
    }
