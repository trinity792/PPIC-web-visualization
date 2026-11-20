"""
zillow_affordability_pipeline.py — orchestrates acquisition, cleaning, change detection, validation, and output of Zillow Housing Affordability data.

Data sources:
    - Zillow Research fixed CSV links (12 affordability series) via the acquisition ladder
    - data/data-raw/zillow-affordability/manual/ — manual fallback copies of the 12 files
    - data/data-cleaned/zillow-affordability/ZillowAffordability_Current.csv — saved table (change-detection base and last-resort fallback)

Outputs:
    - data/data-cleaned/zillow-affordability/ZillowAffordability_Current.csv — latest release, written only when values change
    - data/data-cleaned/zillow-affordability/snapshots/ZillowAffordability_Release_<YYYY-MM-DD>.csv — one permanent file per changed release
    - dict — dataframe, new_data / source_failed / source_used_manual flags, release date, paths, row count, revisions, warnings

Usage:
    python -m scripts.orchestrators.zillow_affordability_pipeline

Test Folders:
    - scripts/unit_tests/zillow_affordability/
    - scripts/unit_tests/orchestrators/test_zillow_affordability_pipeline.py
"""

from typing import NoReturn

import pandas as pd

from scripts.shared.logging.pipeline_logging import log_message
from scripts.shared.logging.revision_diff import format_revision_summary
from scripts.shared.logging.run_records import execute_pipeline_run
from scripts.zillow_affordability.acquisition.source_fallback import acquire_with_fallback
from scripts.zillow_affordability.cleaning.known_source_errors import blank_known_source_errors
from scripts.zillow_affordability.cleaning.reshape_series import build_cleaned_dataset
from scripts.zillow_affordability.config.paths import get_paths
from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config
from scripts.zillow_affordability.merging.historical_merge import (
    detect_new_data,
    load_current_dataset,
    summarize_revisions,
)
from scripts.zillow_affordability.output.finalize_dataset import (
    finalize_dataset,
    write_current_dataset,
    write_release_snapshot,
)
from scripts.zillow_affordability.validation.zillow_affordability_validators import (
    collect_warnings,
    validate_cleaned,
    validate_final,
)

"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class ZillowAffordabilityPipelinePhaseError(RuntimeError):
    """Report failure of a named Zillow Affordability pipeline phase. Test file: scripts/unit_tests/orchestrators/test_zillow_affordability_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_zillow_affordability_pipeline.py"""
    raise ZillowAffordabilityPipelinePhaseError(f"{phase_name} failed: {error}") from error


"""
========================================================================================================================
Helpers
========================================================================================================================
"""


def _release_date_of(frame):
    """Return the single Release Date carried by a saved table, or None."""
    if frame is None or "Release Date" not in frame.columns or frame.empty:
        return None
    return str(frame["Release Date"].iloc[0])


def _known_error_reminders(report, known_errors):
    """Build one reminder per listed source error, so each refresh prompts a recheck. Test file: scripts/unit_tests/orchestrators/test_zillow_affordability_pipeline.py"""
    by_id = {error["id"]: error for error in known_errors}
    reminders = []
    for entry in report:
        error = by_id[entry["id"]]
        ratio = entry["raw_total_to_mortgage_ratio"]
        ratio_text = f"raw total payment was {ratio[0]:.1f}-{ratio[1]:.1f}x the mortgage payment this release" if ratio else "no matching rows this release"
        reminders.append(
            f"known source error {entry['id']}: blanked {entry['cells_blanked']} cells for "
            f"{', '.join(error['locations'])} ({error['months'][0]} to {error['months'][-1]}); "
            f"{ratio_text} (normal months run 1.15-1.80x). "
            "recheck whether Zillow has corrected these and update known_source_errors in config/schemas.py"
        )
    return reminders


"""
========================================================================================================================
Zillow Affordability Pipeline
========================================================================================================================
"""


def build_zillow_affordability_dataset(config=None, logger=None):
    """
    Run the five phases, each wrapped as a ZillowAffordabilityPipelinePhaseError.

    Args:
        config: optional {"paths": dict} override (tests); defaults to get_paths()
        logger: pipeline logger from execute_pipeline_run, or None

    Returns:
        {dataframe, new_data, source_failed, source_used_manual, release_date, output_path,
        snapshot_path, row_count, revisions, warnings, known_source_errors}

    Test file:
        scripts/unit_tests/orchestrators/test_zillow_affordability_pipeline.py
    """
    # Phase 1 - Setup & Load
    try:
        paths = (config or {}).get("paths") or get_paths()
        source_config = get_source_config()
        schema_config = get_schema_config()
        existing = load_current_dataset(paths)
    except Exception as error:
        _raise_phase_error("Phase 1 - Setup & Load", error)

    # Phase 2 - Acquisition
    try:
        acquired, source_failed, source_used_manual = acquire_with_fallback(source_config, paths, logger)
    except Exception as error:
        _raise_phase_error("Phase 2 - Acquisition", error)

    # The saved table (last-resort fallback) is already contract-shaped: return it as-is
    # rather than sending finished data back through cleaning.
    if isinstance(acquired, pd.DataFrame):
        return {
            "dataframe": acquired,
            "new_data": False,
            "source_failed": source_failed,
            "source_used_manual": source_used_manual,
            "release_date": _release_date_of(acquired),
            "output_path": None,
            "snapshot_path": None,
            "row_count": len(acquired),
            "revisions": {},
            "warnings": [],
            "known_source_errors": [],
        }

    # Phase 3 - Cleaning
    try:
        cleaned = build_cleaned_dataset(acquired["files"], acquired["release_date"], source_config, schema_config)
        cleaned, known_error_report = blank_known_source_errors(cleaned, schema_config["known_source_errors"])
        reminders = _known_error_reminders(known_error_report, schema_config["known_source_errors"])
        is_clean, clean_messages = validate_cleaned(cleaned, schema_config)
        if not is_clean:
            raise ValueError(f"cleaning validation failed: {clean_messages}")
    except Exception as error:
        _raise_phase_error("Phase 3 - Cleaning", error)

    # Phase 4 - Merge
    try:
        new_data = detect_new_data(existing, cleaned, schema_config)
        revisions = {}
        if new_data and existing is not None:
            revisions = summarize_revisions(existing, cleaned, schema_config)
            revision_message = format_revision_summary(revisions)
            if revision_message:
                log_message(logger, revision_message)
        if not new_data:
            log_message(
                logger,
                "Zillow release has no changed values; keeping the saved table",
                release_date=acquired["release_date"],
            )
    except Exception as error:
        _raise_phase_error("Phase 4 - Merge", error)

    # Phase 5 - Validation & Finalize
    output_path = None
    snapshot_path = None
    warnings = list(reminders)
    try:
        if new_data:
            prepared = finalize_dataset(cleaned, schema_config)
            is_valid, messages = validate_final(prepared, schema_config, existing=existing)
            if not is_valid:
                raise ValueError(f"final validation failed: {messages}")
            warnings += collect_warnings(prepared, schema_config)
            # Snapshot first: if the current-table write then fails, the next run re-detects
            # this release, finds the identical snapshot, and completes the write.
            snapshot_path = write_release_snapshot(prepared, paths)
            output_path = write_current_dataset(prepared, paths)
        else:
            prepared = existing
        for warning in warnings:
            log_message(logger, f"Warning: {warning}")
    except Exception as error:
        _raise_phase_error("Phase 5 - Validation & Finalize", error)

    return {
        "dataframe": prepared,
        "new_data": new_data,
        "source_failed": source_failed,
        "source_used_manual": source_used_manual,
        "release_date": _release_date_of(prepared),
        "output_path": output_path,
        "snapshot_path": snapshot_path,
        "row_count": len(prepared),
        "revisions": revisions,
        "warnings": warnings,
        "known_source_errors": known_error_report,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = execute_pipeline_run(
        {"module_id": "zillow-affordability", "module_label": "Zillow Housing Affordability", "phase_total": 5},
        build_zillow_affordability_dataset,
        get_paths()["logs_directory"],
    )
    print(f"  Release: {result['release_date']}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
        print(f"  Snapshot: {result['snapshot_path']}")
    else:
        print("  No changed values; file unchanged.")
    for warning in result["warnings"]:
        print(f"  ⚠ {warning}")
