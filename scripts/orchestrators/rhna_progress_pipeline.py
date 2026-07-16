"""
rhna_progress_pipeline.py — orchestrates acquisition, cleaning, geography, enrichment, merging, validation, and output of RHNA Progress data.

Data sources:
    - data.ca.gov CKAN RHNA Progress Report resources via the acquisition ladder
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — saved canonical fallback and live output
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Historical.csv — immutable, read-only seed
    - data/data-raw/RHNA-progress-report/jurisdiction_county_crosswalk.csv — committed crosswalk
    - scripts/shared/geography/california_geography.py — county -> region reference

Outputs:
    - pandas.DataFrame — the accumulated RHNA Progress snapshot series
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — updated when a new snapshot lands
    - dict — dataframe, new_snapshot / source_failed / used_manual flags, acquired cycles, output path, row count

Usage:
    python -m scripts.orchestrators.rhna_progress_pipeline

Test Folders:
    - scripts/unit_tests/rhna_progress/
"""

import re
from datetime import datetime
from typing import NoReturn

import pandas as pd

from scripts.rhna_progress.acquisition.source_fallback import acquire_with_fallback
from scripts.rhna_progress.cleaning.column_normalization import (
    normalize_columns,
    parse_planning_period,
    standardize_jurisdiction_names,
)
from scripts.rhna_progress.cleaning.income_measures import coerce_income_measures, stamp_provenance
from scripts.rhna_progress.cleaning.reshape_income_levels import reshape_to_income_levels
from scripts.rhna_progress.config.paths import get_paths
from scripts.rhna_progress.config.schemas import get_schema_config
from scripts.rhna_progress.config.sources import get_source_config
from scripts.rhna_progress.enrichment.overall_progress import derive_overall_progress, mark_most_recent
from scripts.rhna_progress.enrichment.pace_metrics import derive_pace_metrics, derive_time_elapsed
from scripts.rhna_progress.geography.geographic_levels import assign_county_and_region, classify_geographic_level
from scripts.rhna_progress.geography.jurisdiction_crosswalk import load_jurisdiction_crosswalk
from scripts.rhna_progress.merging.historical_merge import (
    combine_snapshots,
    detect_new_snapshot,
    load_canonical_dataset,
    load_historical_seed,
)
from scripts.rhna_progress.output.finalize_dataset import finalize_dataset, write_dataset
from scripts.rhna_progress.validation.rhna_progress_validators import validate_cleaned, validate_final
from scripts.shared.geography.california_geography import get_california_geography
from scripts.shared.logging.run_records import execute_pipeline_run

"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class RHNAProgressPipelinePhaseError(RuntimeError):
    """Report failure of a named RHNA Progress pipeline phase. Test file: scripts/unit_tests/rhna_progress/test_orchestrator.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/rhna_progress/test_orchestrator.py"""
    raise RHNAProgressPipelinePhaseError(f"{phase_name} failed: {error}") from error


"""
========================================================================================================================
Helpers
========================================================================================================================
"""


def _latest_snapshot_by_cycle(existing):
    """Map each stored Cycle to its newest Snapshot Date (YYYY-MM-DD), for change detection."""
    if existing is None or existing.empty or "Cycle" not in existing.columns:
        return {}
    latest = {}
    snapshots = pd.to_datetime(existing["Snapshot Date"], errors="coerce")
    for cycle, group in snapshots.groupby(existing["Cycle"]):
        newest = group.max()
        if pd.notna(newest):
            latest[int(cycle)] = str(newest.date())
    return latest


def _infer_cycle_from_columns(columns):
    """Infer a cycle integer from a manual raw file's column set (the 'Nth Cycle Started' flag)."""
    for column in columns:
        match = re.match(r"^(\d+)(?:st|nd|rd|th)\s+Cycle Started$", str(column), re.IGNORECASE)
        if match:
            return int(match.group(1))
    return 5


def _as_records(acquired, paths):
    """Normalize the acquisition payload into a list of {cycle, path, last_modified, source_last_updated} records."""
    if isinstance(acquired, list):
        return acquired
    # Manual fallback: a single raw CSV path whose cycle is inferred from its columns.
    manual_path = acquired
    now = datetime.now().isoformat()
    columns = pd.read_csv(manual_path, nrows=0).columns
    return [
        {
            "cycle": _infer_cycle_from_columns(columns),
            "path": manual_path,
            "last_modified": now,
            "source_last_updated": now,
        }
    ]


def _clean_record(record, crosswalk, schema_config):
    """Clean one acquired cycle file into the long income-level grain with provenance stamped."""
    raw = pd.read_csv(record["path"])
    normalized = normalize_columns(raw, record["cycle"], schema_config)
    normalized = standardize_jurisdiction_names(normalized, {"jurisdiction_crosswalk": crosswalk})
    parsed, _quarantined = parse_planning_period(normalized)
    coerced = coerce_income_measures(parsed, schema_config)
    long_df = reshape_to_income_levels(coerced, schema_config)
    return stamp_provenance(long_df, record["last_modified"], record.get("source_last_updated"))


"""
========================================================================================================================
RHNA Progress Pipeline
========================================================================================================================
"""


def build_rhna_progress_dataset(config=None, logger=None):
    """
    Run the five phases, each wrapped as a RHNAProgressPipelinePhaseError. Return a summary dict {dataframe, new_snapshot, source_failed, used_manual, acquired_cycles, output_path, row_count}.

    Test file: scripts/unit_tests/rhna_progress/test_orchestrator.py
    """
    # Phase 1 - Setup & Load
    try:
        paths = get_paths()
        source_config = get_source_config()
        schema_config = get_schema_config()
        geography = get_california_geography()
        crosswalk = load_jurisdiction_crosswalk(paths)
        existing = load_canonical_dataset(paths)
        seed = load_historical_seed(paths)
        grain_keys = schema_config["grain_keys"]
        latest_snapshot_by_cycle = _latest_snapshot_by_cycle(existing)
    except RHNAProgressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 1 - Setup & Load", error)

    # Phase 2 - Acquisition
    try:
        acquired, source_failed, used_manual = acquire_with_fallback(
            source_config, paths, latest_snapshot_by_cycle
        )
    except RHNAProgressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 2 - Acquisition", error)

    # A saved-canonical DataFrame (last-resort fallback) is already contract-shaped: return
    # it as-is with no new snapshot rather than re-running the transforms.
    if isinstance(acquired, pd.DataFrame):
        cycles = sorted({int(c) for c in acquired["Cycle"].dropna().unique()}) if "Cycle" in acquired.columns else []
        return {
            "dataframe": acquired,
            "new_snapshot": False,
            "source_failed": source_failed,
            "used_manual": used_manual,
            "acquired_cycles": cycles,
            "output_path": None,
            "row_count": len(acquired),
        }

    # Phase 3 - Cleaning
    try:
        records = _as_records(acquired, paths)
        acquired_cycles = [record["cycle"] for record in records]
        cleaned_frames = [_clean_record(record, crosswalk, schema_config) for record in records]
        cleaned = (
            pd.concat(cleaned_frames, ignore_index=True)
            if cleaned_frames
            else pd.DataFrame(columns=schema_config["output_columns"])
        )
        is_clean, clean_messages = validate_cleaned(cleaned, schema_config)
        if not is_clean:
            _raise_phase_error("Phase 3 - Cleaning", ValueError(f"cleaning validation failed: {clean_messages}"))
    except RHNAProgressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 3 - Cleaning", error)

    # Phase 4 - Enrichment & Merge
    try:
        enriched = classify_geographic_level(cleaned)
        enriched = assign_county_and_region(enriched, crosswalk, geography)
        enriched = derive_time_elapsed(enriched)
        enriched = derive_pace_metrics(enriched, schema_config)
        enriched = derive_overall_progress(enriched, schema_config)
        enriched = mark_most_recent(enriched)
        combined = combine_snapshots(existing, seed, enriched)
        new_snapshot = detect_new_snapshot(existing, combined, grain_keys)
    except RHNAProgressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 4 - Enrichment & Merge", error)

    # Phase 5 - Validation & Finalize
    try:
        prepared = finalize_dataset(combined, schema_config)
        is_valid, messages = validate_final(prepared, schema_config)
        if not is_valid:
            _raise_phase_error("Phase 5 - Validation & Finalize", ValueError(f"final validation failed: {messages}"))
        output_path = write_dataset(prepared, paths, new_snapshot=True) if new_snapshot else None
    except RHNAProgressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 5 - Validation & Finalize", error)

    return {
        "dataframe": prepared,
        "new_snapshot": new_snapshot,
        "source_failed": source_failed,
        "used_manual": used_manual,
        "acquired_cycles": acquired_cycles,
        "output_path": output_path,
        "row_count": len(prepared),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = execute_pipeline_run(
        {"module_id": "rhna-progress", "module_label": "RHNA Progress Report", "phase_total": 5},
        build_rhna_progress_dataset,
        get_paths()["logs_directory"],
    )
    print(f"  Acquired cycles: {result['acquired_cycles']}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new snapshot detected; file unchanged.")
