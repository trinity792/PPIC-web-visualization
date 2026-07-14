"""
housing_stress_pipeline.py — orchestrates acquisition, cleaning, geographic aggregation, merging, validation, and output of ACS Housing Stress data.

Data sources:
    - ACS 1-year table-based Summary File (B25140 + race iterations) via the downloader
    - data/data-raw/housing-stress/ — PUMA crosswalks and optional manual fallback files
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — saved canonical fallback and current baseline
    - data/data-cleaned/housing-stress/HousingStress_Historical.csv — immutable deep-history seed
    - scripts/shared/geography/california_geography.py — county/region reference names

Outputs:
    - pandas.DataFrame — merged ACS Housing Stress dataset
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — updated when new data is detected
    - dict — dataset, change flag, fallback flags, resolved year, output path, and row count

Usage:
    Run as a module from the repository root (so the absolute `scripts.` imports resolve):
        python -m scripts.orchestrators.housing_stress_pipeline

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/housing_stress/
"""

from typing import NoReturn

import pandas as pd

from scripts.housing_stress.acquisition.acs_sf_downloader import (
    download_all_national_tables,
)
from scripts.housing_stress.acquisition.source_fallback import (
    ITERATION_FRAMES,
    acquire_with_fallback,
    resolve_latest_vintage,
)
from scripts.housing_stress.aggregation.geographic_levels import build_all_levels
from scripts.housing_stress.config.paths import get_paths
from scripts.housing_stress.config.schemas import get_schema_config
from scripts.housing_stress.config.sources import get_source_settings
from scripts.housing_stress.merging.historical_merge import (
    combine_history_sources,
    combine_with_historical,
    detect_new_data,
    load_canonical_dataset,
    load_historical_baseline,
)
from scripts.housing_stress.output.finalize_dataset import archive_and_save, prepare_output
from scripts.housing_stress.validation.housing_stress_validators import (
    validate_cleaning_output,
    validate_housing_stress_dataset,
    validate_stratification_completeness,
)
from scripts.shared.geography.california_geography import get_california_geography
from scripts.shared.logging.dataframe_logging import log_data_quality_check, log_dataframe_info
from scripts.shared.logging.pipeline_logging import log_message, log_processing_step
from scripts.shared.logging.run_records import execute_pipeline_run

_YEAR_COLUMN = "Year"
_STATE_SUMMARY_PREFIX = "0400000US"


"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class HousingStressPipelinePhaseError(RuntimeError):
    """Report failure of a named Housing Stress pipeline phase. Test file: scripts/unit_tests/orchestrators/test_housing_stress_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_housing_stress_pipeline.py"""
    raise HousingStressPipelinePhaseError(f"{phase_name} failed: {error}") from error


"""
========================================================================================================================
Acquisition Helpers
========================================================================================================================
"""


def _acquire_live_frames(year, source_settings, headers, timeout, cache_dir, logger=None):
    """
    Download every iteration's national table once and slice both acquisition scopes from it.

    Each of the 9 national .dat files is fetched a single time (through the on-disk cache) and
    both the state-summary rows (GEO_ID prefix "0400000US") and the California rows (STUSAB
    "CA", which carry the PUMA rows the county/region rollups need) are sliced from the same
    frames — replacing the former two independent download passes (B1).

    Returns a dict {"state": state_frames, "ca": ca_frames}.
    """
    national_frames, _missing = download_all_national_tables(year, source_settings, headers, timeout, cache_dir=cache_dir, logger=logger)
    state_frames = {label: frame[frame.index.astype(str).str.startswith(_STATE_SUMMARY_PREFIX)] for label, frame in national_frames.items()}
    ca_frames = {label: frame[frame["STUSAB"] == "CA"] for label, frame in national_frames.items()}
    return {"state": state_frames, "ca": ca_frames}


def _manual_contract_frame(paths, schema_config):
    """
    Read the manual fallback file(s) as one contract-shaped frame, or None when none are usable.

    The manual files hold finished contract rows (per the A1 decision: manual = contract rows,
    bypass the build). A malformed-shape manual file raises a clear error rather than crashing
    the builder downstream with an opaque AttributeError.
    """
    output_columns = schema_config["output_columns"]
    frames = []
    for key in ("manual_state_path", "manual_ca_path"):
        path = paths[key]
        if path.exists():
            try:
                frames.append(pd.read_csv(path))
            except Exception:
                continue
    if not frames:
        return None

    combined = pd.concat(frames, ignore_index=True)
    missing = [column for column in output_columns if column not in combined.columns]
    if missing:
        raise ValueError(f"Manual housing-stress fallback is not contract-shaped; missing columns: {missing}")
    return combined[output_columns]


def _contract_rows_from_payload(data, schema_config):
    """Validate that a fallback payload is a contract-shaped frame and return it in contract order."""
    output_columns = schema_config["output_columns"]
    if not isinstance(data, pd.DataFrame):
        raise ValueError(f"Fallback payload is not a contract-shaped DataFrame (got {type(data).__name__}).")
    missing = [column for column in output_columns if column not in data.columns]
    if missing:
        raise ValueError(f"Fallback payload is missing contract columns: {missing}")
    return data[output_columns].copy()


"""
========================================================================================================================
Housing Stress Pipeline
========================================================================================================================
"""


def build_housing_stress_dataset(config=None, logger=None):
    """
    Build the ACS Housing Stress dataset and save only when source data changed.

    Runs five phases, wrapping each so any exception re-raises as a
    HousingStressPipelinePhaseError tagged with the phase name. When live acquisition fails,
    the run degrades to a manual contract file or the last-saved rows (bypassing the build)
    rather than crashing, and surfaces the fallback through source_failed / source_used_manual.

    Returns:
        dict with keys: dataset, new_data, source_failed, source_used_manual, resolved_year,
        output_path (or None), row_count.

    Test file: scripts/unit_tests/orchestrators/test_housing_stress_pipeline.py
    """
    # Phase 1 — Setup & Load
    try:
        paths = get_paths()
        source_settings = get_source_settings()
        schema_config = get_schema_config()
        geography = get_california_geography()
        current = load_canonical_dataset(paths["current_data_path"])
        baseline = load_historical_baseline(paths.get("historical_data_path"))
        # Union the immutable deep-history seed with the current output, preferring
        # current rows, so retained history survives a rebuild of the current file (A7).
        historical = combine_history_sources(baseline, current)
        headers = source_settings["request_headers"]
        timeout = source_settings["timeout"]
        cache_dir = paths["download_directory"]
        log_dataframe_info(logger, historical, "Loaded Housing Stress history (seed + current)")
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 1 — Setup & Load", error)

    # Phase 2 — Acquisition
    try:
        log_message(logger, "Phase 2: resolving latest ACS vintage (may probe unpublished years)")
        resolved_year = resolve_latest_vintage(
            "CA",
            source_settings,
            headers,
            timeout,
            source_settings["max_year_lookback"],
            source_settings["excluded_years"],
            earliest_year=source_settings["earliest_year"],
            cache_dir=cache_dir,
            probe_retry_attempts=source_settings["probe_retry_attempts"],
            logger=logger,
        )
        log_message(logger, "Phase 2: acquiring vintage (downloading tables, or falling back)", resolved_year=resolved_year)
        acquisition = acquire_with_fallback(
            lambda: _acquire_live_frames(resolved_year, source_settings, headers, timeout, cache_dir, logger=logger),
            lambda: _manual_contract_frame(paths, schema_config),
            lambda: historical,
        )
        source_failed = acquisition.source_failed
        source_used_manual = acquisition.used_manual
        log_message(
            logger,
            "Phase 2 acquisition complete",
            resolved_year=resolved_year,
            tier=acquisition.kind,
            source_failed=source_failed,
            source_used_manual=source_used_manual,
        )
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 2 — Acquisition", error)

    # Phase 3 — Build levels (live) or accept contract rows (fallback)
    try:
        if acquisition.kind == ITERATION_FRAMES:
            built = build_all_levels(
                acquisition.data["ca"],
                acquisition.data["state"],
                resolved_year,
                paths,
                schema_config,
                geography,
            )
            is_clean, clean_messages = validate_cleaning_output(built, schema_config)
            log_data_quality_check(logger, "Housing Stress cleaning validation", is_clean)
            if not is_clean:
                _raise_phase_error("Phase 3 — Build levels", ValueError(f"cleaning validation failed: {clean_messages}"))
        else:
            built = _contract_rows_from_payload(acquisition.data, schema_config)
        log_dataframe_info(logger, built, f"Built vintage ({acquisition.kind})")
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 3 — Build levels", error)

    # Phase 4 — Merge
    try:
        merged = combine_with_historical(
            built,
            historical,
            _YEAR_COLUMN,
            lambda candidate: validate_stratification_completeness(candidate, schema_config),
        )
        # Measure novelty against the on-disk current output (not the seed+current
        # union that seeds the merge base), so the first run after a fresh seed
        # materializes the full deep-history series into HousingStress_Current.csv,
        # and a run whose merged result already matches the current file no-ops.
        new_data = detect_new_data(merged, current)
        log_processing_step(
            logger,
            "Phase 4 merge",
            (len(built), len(built.columns)),
            (len(merged), len(merged.columns)),
            new_data=new_data,
        )
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 4 — Merge", error)

    # Phase 5 — Finalize & Save
    try:
        prepared = prepare_output(merged, schema_config)
        is_valid, messages = validate_housing_stress_dataset(prepared, schema_config["final_validation_config"])
        log_data_quality_check(logger, "Housing Stress final validation", is_valid)
        if not is_valid:
            _raise_phase_error("Phase 5 — Finalize & Save", ValueError(f"final validation failed: {messages}"))

        output_path = None
        if new_data:
            output_path = archive_and_save(prepared, paths["current_data_path"], paths["archive_directory"])
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 5 — Finalize & Save", error)

    return {
        "dataset": prepared,
        "new_data": new_data,
        "source_failed": source_failed,
        "source_used_manual": source_used_manual,
        "resolved_year": resolved_year,
        "output_path": output_path,
        "row_count": len(prepared),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = execute_pipeline_run(
        {"module_id": "housing-stress", "module_label": "ACS Housing Stress", "phase_total": 5},
        build_housing_stress_dataset,
        get_paths()["logs_directory"],
    )
    print(f"  Vintage: {result['resolved_year']}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new data detected; file unchanged.")
