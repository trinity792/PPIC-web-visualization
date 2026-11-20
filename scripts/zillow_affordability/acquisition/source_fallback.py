"""
source_fallback.py — runs the live -> manual folder -> saved table acquisition ladder for Zillow Affordability.

Data sources:
    - Zillow fixed links via zillow_downloader.download_all_series
    - data/data-raw/zillow-affordability/manual/ — hand-placed copies of all 12 files
    - data/data-cleaned/zillow-affordability/ZillowAffordability_Current.csv — last saved table

Outputs:
    - tuple — (payload, source_failed, source_used_manual); payload is a raw-files dict or the saved DataFrame

Usage:
    from scripts.zillow_affordability.acquisition.source_fallback import acquire_with_fallback

Test Folders:
    - scripts/unit_tests/zillow_affordability/acquisition/
"""

from datetime import date
from pathlib import Path

from scripts.shared.logging.pipeline_logging import log_message
from scripts.zillow_affordability.acquisition.zillow_downloader import download_all_series
from scripts.zillow_affordability.merging.historical_merge import load_current_dataset

"""
========================================================================================================================
Manual Folder
========================================================================================================================
"""


def find_manual_files(source_config, manual_directory):
    """
    Return the manual-folder payload when all 12 files are present under their Zillow filenames.

    A hand-copied file carries no Last-Modified header, so the release date is the newest
    modification date among the files. The run log notes that it is approximate.

    Returns:
        {"files": {series key: Path}, "release_date": "YYYY-MM-DD"}

    Raises:
        FileNotFoundError: naming every missing filename

    Test file:
        scripts/unit_tests/zillow_affordability/acquisition/test_source_fallback.py
    """
    manual_directory = Path(manual_directory)
    files = {series["key"]: manual_directory / series["filename"] for series in source_config["series"]}
    missing = [path.name for path in files.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"manual folder {manual_directory} is missing: {', '.join(missing)}")
    newest = max(path.stat().st_mtime for path in files.values())
    return {"files": files, "release_date": date.fromtimestamp(newest).isoformat()}


"""
========================================================================================================================
Fallback Ladder
========================================================================================================================
"""


def acquire_with_fallback(source_config, paths, logger=None):
    """
    Try live, then the manual folder, then the saved table; report which rung was used.

    Flags: live (False, False), manual (False, True), saved table (True, False). Each rung is
    all-or-nothing, so a release is never stitched together from live and manual files.

    Returns:
        (payload, source_failed, source_used_manual)

    Raises:
        RuntimeError: every rung failed; the message names each rung's error.

    Test file:
        scripts/unit_tests/zillow_affordability/acquisition/test_source_fallback.py
    """
    failures = []
    try:
        return download_all_series(source_config, paths["download_directory"]), False, False
    except Exception as error:
        failures.append(f"live: {error}")
        log_message(logger, f"Zillow live download failed, trying the manual folder: {error}")

    try:
        payload = find_manual_files(source_config, paths["manual_directory"])
        log_message(
            logger,
            "Using manually placed Zillow files; release date taken from file modification times (approximate)",
            release_date=payload["release_date"],
        )
        return payload, False, True
    except Exception as error:
        failures.append(f"manual: {error}")

    try:
        saved = load_current_dataset(paths)
    except Exception as error:
        saved = None
        failures.append(f"saved table: {error}")
    else:
        if saved is None:
            failures.append(f"saved table: none at {paths['current_data_path']}")
    if saved is not None:
        log_message(logger, "Zillow sources unavailable; keeping the last saved table unchanged")
        return saved, True, False

    raise RuntimeError("All Zillow acquisition rungs failed - " + "; ".join(failures))
