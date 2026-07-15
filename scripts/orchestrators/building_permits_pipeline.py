"""
building_permits_pipeline.py — orchestrates acquisition, cleaning, geographic tagging, merging, validation, and output of Building Permits data.

Data sources:
    - Census BPS monthly CBSA and state .xls files via the downloader
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — saved canonical fallback and live output
    - data/data-cleaned/building-permits/BuildingPermits_Historical.csv — immutable, read-only deep-history seed (pre-2024)
    - scripts/shared/geography/california_geography.py — canonical CBSA metro names and metro→region reference

Outputs:
    - pandas.DataFrame — merged Building Permits dataset
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — updated when new data is detected
    - dict — dataset, change flag, fallback flag, acquired months, output path, and row count

Usage:
    python -m scripts.orchestrators.building_permits_pipeline

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/building_permits/
"""

import warnings
from typing import NoReturn

import pandas as pd

from scripts.building_permits.acquisition.census_bps_downloader import (
    download_cbsa_month,
    download_state_month,
)
from scripts.building_permits.acquisition.source_fallback import (
    acquire_months,
    months_to_acquire,
    resolve_latest_month,
)
from scripts.building_permits.cleaning.metro_permits_cleaner import clean_metro_permits
from scripts.building_permits.cleaning.state_permits_cleaner import clean_state_permits
from scripts.building_permits.config.paths import get_paths
from scripts.building_permits.config.schemas import get_schema_config
from scripts.building_permits.config.sources import get_source_settings
from scripts.building_permits.geography.geographic_levels import (
    tag_geographic_levels,
    validate_metro_names,
)
from scripts.building_permits.merging.historical_merge import (
    combine_with_historical,
    compose_baseline,
    detect_new_data,
    latest_stored_month,
    load_canonical_dataset,
    load_historical_baseline,
)
from scripts.building_permits.output.finalize_dataset import archive_and_save, prepare_output
from scripts.building_permits.validation.building_permits_validators import (
    validate_building_permits_dataset,
    validate_cleaning_output,
)
from scripts.shared.geography.california_geography import get_california_geography
from scripts.shared.logging.dataframe_logging import log_data_quality_check
from scripts.shared.logging.pipeline_logging import log_processing_step
from scripts.shared.logging.run_records import execute_pipeline_run

"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class BuildingPermitsPipelinePhaseError(RuntimeError):
    """Report failure of a named Building Permits pipeline phase. Test file: scripts/unit_tests/orchestrators/test_building_permits_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_building_permits_pipeline.py"""
    raise BuildingPermitsPipelinePhaseError(f"{phase_name} failed: {error}") from error


"""
========================================================================================================================
Helpers
========================================================================================================================
"""


def _parse_month_key(month_key):
    """Split a 'YYYY-MM' key into an integer (year, month) tuple."""
    year, month = (int(part) for part in month_key.split("-"))
    return year, month


def _month_before(month_string):
    """Return the 'YYYY-MM' calendar month immediately before month_string."""
    year, month = _parse_month_key(month_string)
    index = year * 12 + (month - 1) - 1
    return f"{index // 12}-{index % 12 + 1:02d}"


def _clean_monthly_frames(frames, clean_fn, schema_config):
    """Clean each raw monthly frame, keyed by 'YYYY-MM', into a single concatenated frame."""
    cleaned = []
    if isinstance(frames, dict):
        for month_key, raw in frames.items():
            year, month = _parse_month_key(month_key)
            cleaned.append(clean_fn(raw, year, month, schema_config))
    if not cleaned:
        return pd.DataFrame(columns=["Location", "Date", *schema_config["measure_columns"]])
    return pd.concat(cleaned, ignore_index=True)


"""
========================================================================================================================
Building Permits Pipeline
========================================================================================================================
"""


def build_building_permits_dataset(config=None, logger=None):
    """
    Build the Building Permits dataset and save only when source data changed.

    Runs five phases, wrapping each so any exception re-raises as a
    BuildingPermitsPipelinePhaseError tagged with the phase name.

    Returns:
        dict with keys: dataset, new_data, source_failed, acquired_months,
        output_path (or None), row_count.

    Test file: scripts/unit_tests/orchestrators/test_building_permits_pipeline.py
    """
    # Phase 1 — Setup & Load
    try:
        paths = get_paths()
        source_settings = get_source_settings()
        schema_config = get_schema_config()
        geography = get_california_geography()
        date_column = schema_config["date_column"]
        # The live output owns 2024-onward; the immutable seed owns the irreplaceable
        # pre-2024 deep history (guide A1/A2). Compose them (preferring live rows) so the
        # deep history is always restored from the committed seed even if Current.csv is
        # ever lost or truncated.
        current_df = load_canonical_dataset(paths["current_data_path"])
        baseline_df = load_historical_baseline(paths["historical_data_path"])
        historical = compose_baseline(baseline_df, current_df)
        if historical.empty:
            warnings.warn(
                "No saved Building Permits output and no deep-history seed found; "
                "proceeding on live data only (a cold run yields only the rolling window).",
                stacklevel=2,
            )
        last_month = latest_stored_month(historical, date_column)
        headers = source_settings["request_headers"]
        timeout = source_settings["timeout"]
    except BuildingPermitsPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 1 — Setup & Load", error)

    # Phase 2 — Acquisition
    try:
        latest_year, latest_month, prefetched = resolve_latest_month(
            source_settings,
            headers,
            timeout,
            source_settings["max_month_lookback"],
            source_settings.get("probe_retry_attempts", 2),
            logger,
        )
        latest_available = (latest_year, latest_month)
        # On a cold start (no saved rows) seed the full history from earliest_month,
        # not just the latest month, so the contract covers the whole 2010-onward series.
        effective_last_month = last_month if last_month is not None else _month_before(source_settings["earliest_month"])
        months = months_to_acquire(effective_last_month, latest_available)
        cbsa_frames, state_frames, source_failed = acquire_months(
            months,
            lambda year, month: download_cbsa_month(year, month, source_settings, headers, timeout),
            lambda year, month: download_state_month(year, month, source_settings, headers, timeout),
            lambda: historical,
            prefetched=prefetched,
            logger=logger,
        )
        # Report the months actually fetched (unpublished months are skipped upstream).
        acquired_months = list(cbsa_frames) if isinstance(cbsa_frames, dict) else []
        log_processing_step(
            logger, "Phase 2 — Acquisition", None, None,
            acquired_months=len(acquired_months), source_failed=source_failed,
        )
    except BuildingPermitsPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 2 — Acquisition", error)

    # Phase 3 — Clean & Tag
    try:
        metro_df = _clean_monthly_frames(cbsa_frames, clean_metro_permits, schema_config)
        state_df = _clean_monthly_frames(state_frames, clean_state_permits, schema_config)
        # Wire the per-frame cleaning validator (guide A3): catch a malformed monthly
        # frame — bad YYYY-MM, null keys, non-integer measures, or an unknown location —
        # at the point the raw spreadsheet is freshly parsed, before it reaches the merge.
        for scope_name, frame in (("metro", metro_df), ("state", state_df)):
            is_clean, clean_messages = validate_cleaning_output(frame, schema_config)
            if not is_clean:
                _raise_phase_error(
                    "Phase 3 — Clean & Tag",
                    ValueError(f"{scope_name} cleaning validation failed: {clean_messages}"),
                )
        validate_metro_names(metro_df, geography)
        tagged = tag_geographic_levels(state_df, metro_df)
    except BuildingPermitsPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 3 — Clean & Tag", error)

    # Phase 4 — Merge
    try:
        merged = combine_with_historical(tagged, historical, date_column)
    except BuildingPermitsPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 4 — Merge", error)

    # Phase 5 — Finalize & Save
    try:
        prepared = prepare_output(merged, schema_config)
        # The change flag shares the write gate's serialized-CSV definition (guide A7):
        # compare the prepared output against the current file's content, so new_data can
        # never disagree with whether archive_and_save writes a byte-different file.
        new_data = detect_new_data(prepared, current_df)

        # Loud deep-history guard (guide A1): every month the immutable seed supplies must
        # survive into the output. If any pre-2024 month is missing, fail rather than
        # silently shipping a truncated series (which the contiguity check cannot catch,
        # since it only spans the present range).
        if not baseline_df.empty:
            baseline_months = set(baseline_df[date_column].astype(str))
            present_months = set(prepared[date_column].astype(str))
            lost_months = sorted(baseline_months - present_months)
            if lost_months:
                _raise_phase_error(
                    "Phase 5 — Finalize & Save",
                    ValueError(f"deep-history months missing from output: {lost_months[:5]}"),
                )

        is_valid, messages = validate_building_permits_dataset(prepared, schema_config["final_validation_config"])
        log_data_quality_check(logger, "Building Permits final validation", is_valid)
        if not is_valid:
            _raise_phase_error("Phase 5 — Finalize & Save", ValueError(f"final validation failed: {messages}"))

        output_path = None
        if new_data:
            output_path = archive_and_save(prepared, paths["current_data_path"], paths["archive_directory"])
    except BuildingPermitsPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 5 — Finalize & Save", error)

    return {
        "dataset": prepared,
        "new_data": new_data,
        "source_failed": source_failed,
        "acquired_months": acquired_months,
        "output_path": output_path,
        "row_count": len(prepared),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = execute_pipeline_run(
        {"module_id": "building-permits", "module_label": "Building Permits", "phase_total": 5},
        build_building_permits_dataset,
        get_paths()["logs_directory"],
    )
    print(f"  Acquired months: {result['acquired_months']}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new data detected; file unchanged.")
