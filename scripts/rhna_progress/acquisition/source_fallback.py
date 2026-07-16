"""
source_fallback.py — runs the live -> manual -> saved-snapshot acquisition ladder for RHNA Progress.

Data sources:
    - scripts/rhna_progress/acquisition/ckan_downloader — the live CKAN path
    - data/data-raw/RHNA-progress-report/RHNAProgress_Downloaded.csv — manual fallback CSV
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — last-saved canonical snapshot

Outputs:
    - list[dict] | pathlib.Path | pandas.DataFrame — the acquired payload (live records, a manual
      raw CSV path, or the saved canonical frame)
    - tuple(source_failed, used_manual) — which rung of the ladder produced the payload

Usage:
    Called by the RHNA Progress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/acquisition/
"""

import pandas as pd

from scripts.rhna_progress.acquisition.ckan_downloader import (
    download_changed_cycles,
    enumerate_cycle_resources,
    fetch_package_metadata,
    refresh_codebooks_and_details,
)

"""
========================================================================================================================
Acquisition Fallback Ladder
========================================================================================================================
"""


def acquire_with_fallback(source_config, paths, latest_snapshot_by_cycle):
    """
    Try the live CKAN path; on failure fall back to a manually placed raw CSV (RHNAProgress_Downloaded.csv), then to the snapshots already saved in the canonical CSV. Records which path was taken via source_failed / used_manual flags.

    Test file: scripts/unit_tests/rhna_progress/acquisition/test_source_fallback.py
    """
    try:
        package_meta = fetch_package_metadata(source_config)
        cycle_resources = enumerate_cycle_resources(package_meta["resources"], source_config)
        records = download_changed_cycles(cycle_resources, latest_snapshot_by_cycle, paths)
        refresh_codebooks_and_details(package_meta["resources"], package_meta, paths)
        for record in records:
            record.setdefault("source_last_updated", package_meta.get("metadata_modified"))
        return records, False, False
    except Exception:  # noqa: BLE001 - any live failure degrades to the offline ladder below
        manual_path = paths.get("manual_download_path")
        if manual_path is not None and manual_path.exists():
            return manual_path, False, True

        current_path = paths.get("current_data_path")
        if current_path is not None and current_path.exists():
            return pd.read_csv(current_path), True, False

        raise RuntimeError(
            "RHNA Progress acquisition failed: live CKAN, the manual raw CSV, and the saved "
            "canonical snapshot are all unavailable."
        )
