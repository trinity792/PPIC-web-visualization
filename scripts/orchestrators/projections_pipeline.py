"""
projections_pipeline.py — orchestrates acquisition, cleaning, merging, aggregation, validation, and output of Demographic Projections data.

Data sources:
    - California Department of Finance projections page — P-3 zip discovery and download
    - U.S. Census Bureau population estimates — cc-est CSV discovery and download
    - data/data-raw/demographic-projections/{FILENAME} — optional manual fallback downloads
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — saved canonical fallback and historical source
    - scripts/shared/geography/california_geography.py — county-to-region mapping

Outputs:
    - pandas.DataFrame — merged Demographic Projections dataset
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — updated canonical dataset when new data is detected
    - dict — dataset, source change flags, fallback flags, output path, and row count

Usage:
    python -m scripts.orchestrators.projections_pipeline

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/projections/
"""

import os
from pathlib import Path
from typing import NoReturn

from scripts.projections.acquisition.census_ccest_downloader import (
    download_census_ccest,
    get_census_ccest_url,
    validate_ccest_headers,
)
from scripts.projections.acquisition.dof_p3_downloader import (
    download_p3_data,
    extract_csv_from_zip,
    get_p3_file_url,
    get_p3_file_url_positional,
    validate_p3_csv,
)
from scripts.projections.acquisition.source_fallback import acquire_with_fallback
from scripts.projections.aggregation.precomputed_totals import build_precomputed_totals
from scripts.projections.aggregation.regional_aggregation import (
    add_regional_data,
    add_state_total,
)
from scripts.projections.cleaning.census_ccest_cleaner import clean_census_estimates
from scripts.projections.cleaning.dof_p3_cleaner import clean_p3_projections
from scripts.projections.config.paths import get_paths
from scripts.projections.config.schemas import get_schema_config
from scripts.projections.config.sources import get_source_settings
from scripts.projections.merging.historical_merge import (
    CONTRACT_COLUMNS,
    combine_history_sources,
    combine_source_with_historical,
    detect_new_source_data,
    load_canonical_dataset,
    load_historical_baseline,
    merge_dof_and_census,
    reduce_to_base_strata,
)
from scripts.projections.output.finalize_dataset import (
    archive_and_save,
    assign_geographic_level,
    prepare_projections_output,
)
from scripts.projections.validation.projections_validators import (
    validate_cleaning_output,
    validate_projections_dataset,
    validate_stratification_completeness,
)
from scripts.shared.geography.california_geography import get_california_geography
from scripts.shared.logging.dataframe_logging import log_data_quality_check, log_dataframe_info
from scripts.shared.logging.pipeline_logging import log_message, log_processing_step
from scripts.shared.logging.run_records import execute_pipeline_run

_DOF_SOURCE = "DoF P-3"
_CENSUS_SOURCE = "Census cc-est"
_AGGREGATION_DIMENSIONS = ["Year", "Age Group", "Sex", "Race/Ethnicity", "Source"]

"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class ProjectionsPipelinePhaseError(RuntimeError):
    """Report failure of a named Projections pipeline phase. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py"""
    raise ProjectionsPipelinePhaseError(f"{phase_name} failed: {error}") from error


# ── Helpers ───────────────────────────────────────────────────────────────────


def _fallback_tier(source_failed, used_manual):
    """Name the acquisition tier a source resolved to, for the run log."""
    if source_failed:
        return "last-saved (stale)"
    if used_manual:
        return "manual"
    return "live"


def _load_saved_source(paths, source, historical=None):
    """Return last-saved rows for one source. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py

    Reuses an already-loaded `historical` frame when given, so the pipeline reads
    the (large) canonical CSV once per run instead of re-parsing it per fallback.
    """
    if historical is None:
        historical = load_canonical_dataset(paths["current_data_path"])
    if "Source" in historical.columns:
        return historical[historical["Source"] == source]
    return historical


def _try_clean(source, clean_fn, schema_config, logger):
    """Clean one source and gate it through validate_cleaning_output; return the frame or None.

    Wiring the post-clean validator here (A4) means a cleaner that returns
    structurally-wrong output triggers the fallback cascade instead of surfacing a
    deep traceback later in the merge phase.
    """
    try:
        cleaned = clean_fn(source, schema_config, logger)
    except Exception as error:
        log_message(logger, "Cleaner raised; trying next fallback tier", source=str(source), error=str(error))
        return None
    is_valid, messages = validate_cleaning_output(cleaned, schema_config)
    if not is_valid:
        log_message(logger, "Cleaning output failed post-clean validation; trying next fallback tier", messages=messages)
        return None
    return cleaned


def _clean_with_fallback(raw, clean_fn, schema_config, source, paths, source_failed, used_manual, manual_path, historical=None, logger=None):
    """Clean source data or fall back to manual and last-saved rows. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py

    When source_failed, `raw` is already-cleaned last-saved rows and is reduced
    to base strata (aggregation regenerates all totals); otherwise `raw` is a
    path the cleaner reads. `historical` (when given) is reused for the
    last-saved fallback instead of re-reading the canonical CSV.
    """
    if source_failed:
        return reduce_to_base_strata(raw, schema_config), True, used_manual

    cleaned = _try_clean(raw, clean_fn, schema_config, logger)
    if cleaned is not None:
        return cleaned, False, used_manual

    manual_path = Path(manual_path)
    if manual_path.is_file():
        cleaned = _try_clean(manual_path, clean_fn, schema_config, logger)
        if cleaned is not None:
            return cleaned, False, True

    saved = _load_saved_source(paths, source, historical)
    return reduce_to_base_strata(saved, schema_config), True, False


def _is_offline(config):
    """Whether to skip live downloads and use local files only (config flag or PROJECTIONS_OFFLINE)."""
    if config is not None and config.get("offline") is not None:
        return bool(config["offline"])
    return os.environ.get("PROJECTIONS_OFFLINE", "").strip().lower() in {"1", "true", "yes"}


def _newest_matching(directory, glob_pattern):
    """Return the most recently modified file in a directory matching a glob, or None."""
    directory = Path(directory)
    if not directory.is_dir():
        return None
    candidates = sorted(directory.glob(glob_pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def _dof_local_strategy(paths):
    """Offline DoF strategy: reuse an extracted P-3 CSV, else extract a local P-3 zip."""

    def strategy():
        directory = paths["download_directory"]
        cached_csv = _newest_matching(directory, "P*3*.csv")
        if cached_csv is not None:
            return cached_csv
        local_zip = _newest_matching(directory, "*.zip")
        if local_zip is not None:
            return extract_csv_from_zip(local_zip, directory)
        raise FileNotFoundError(f"No local P-3 CSV or zip found in {directory}")

    return strategy


def _census_local_strategy(paths):
    """Offline Census strategy: reuse a local cc-est CSV if one is present."""

    def strategy():
        cached_csv = _newest_matching(paths["download_directory"], "cc-est*.csv")
        if cached_csv is None:
            raise FileNotFoundError(f"No local cc-est CSV found in {paths['download_directory']}")
        return cached_csv

    return strategy


def _dof_live_strategies(source_settings, paths, offline):
    """Build the ordered DoF P-3 acquisition strategies (local-only when offline)."""
    if offline:
        return [_dof_local_strategy(paths)]

    def _download(url_fn):
        url = url_fn(source_settings["dof_base_url"], source_settings["request_headers"], source_settings["timeout"])
        csv_path = download_p3_data(
            url,
            paths["download_directory"],
            source_settings["request_headers"],
            source_settings["timeout"],
            source_settings["p3_cache_max_age_days"],
        )
        # Fail fast on a malformed download (A4): a bad header raises here so the
        # fallback cascade tries the next strategy instead of a deep cleaner trace.
        validate_p3_csv(csv_path, source_settings["p3_expected_csv_columns"])
        return csv_path

    return [lambda: _download(get_p3_file_url), lambda: _download(get_p3_file_url_positional)]


def _census_live_strategies(source_settings, paths, offline):
    """Build the ordered Census cc-est acquisition strategies (local-only when offline)."""
    if offline:
        return [_census_local_strategy(paths)]

    def _download():
        url = get_census_ccest_url(source_settings["census_base_url"], source_settings["request_headers"], source_settings["timeout"])
        csv_path = download_census_ccest(
            url,
            paths["download_directory"],
            source_settings["request_headers"],
            source_settings["ccest_download_timeout"],
            source_settings["ccest_cache_max_age_days"],
        )
        # Fail fast on a malformed download (A4) so the fallback cascade engages.
        validate_ccest_headers(csv_path, source_settings["ccest_expected_columns"])
        return csv_path

    return [_download]


def _completeness_validator(schema_config):
    """Return a callable that runs stratification completeness against an incoming frame."""

    def validator(candidate):
        return validate_stratification_completeness(candidate, schema_config)

    return validator


def _geography_config(schema_config):
    """Compose the geography classification config from shared California geography."""
    geography = get_california_geography()
    return {
        "california_counties": sorted(geography["county_names"]),
        "region_names": sorted(geography["region_names"]),
        "us_state_names": schema_config.get("census_state_names", []),
    }


"""
========================================================================================================================
Projections Pipeline
========================================================================================================================
"""


def build_projections_dataset(config=None, logger=None):
    """Build the Demographic Projections dataset and save only when source data changed. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py"""
    offline = _is_offline(config)

    # Phase 1 — Setup & Load
    try:
        paths = get_paths()
        source_settings = get_source_settings()
        schema_config = get_schema_config()
        # Union the immutable deep-history seed (if any) with the current output,
        # preferring current rows (A5). On a fresh checkout both may be absent and
        # the pipeline cold-starts on live data alone (B5).
        historical_current = load_canonical_dataset(paths["current_data_path"])
        historical_seed = load_historical_baseline(paths["historical_data_path"])
        historical = combine_history_sources(historical_seed, historical_current)
        log_dataframe_info(logger, historical, "Loaded Projections history (seed + current)")
    except Exception as error:
        _raise_phase_error("Phase 1 — Setup & Load", error)

    # Phase 2 — Acquisition
    try:
        dof_raw, dof_source_failed, dof_used_manual = acquire_with_fallback(
            _dof_live_strategies(source_settings, paths, offline),
            paths["manual_dof_path"],
            lambda: _load_saved_source(paths, _DOF_SOURCE, historical),
            _DOF_SOURCE,
        )
        census_raw, census_source_failed, census_used_manual = acquire_with_fallback(
            _census_live_strategies(source_settings, paths, offline),
            paths["manual_census_path"],
            lambda: _load_saved_source(paths, _CENSUS_SOURCE, historical),
            _CENSUS_SOURCE,
        )
    except Exception as error:
        _raise_phase_error("Phase 2 — Acquisition", error)

    # Phase 3 — Cleaning
    try:
        dof_clean, dof_failed, dof_used_manual = _clean_with_fallback(
            dof_raw, clean_p3_projections, schema_config, _DOF_SOURCE, paths,
            dof_source_failed, dof_used_manual, paths["manual_dof_path"], historical, logger,
        )
        census_clean, census_failed, census_used_manual = _clean_with_fallback(
            census_raw, clean_census_estimates, schema_config, _CENSUS_SOURCE, paths,
            census_source_failed, census_used_manual, paths["manual_census_path"], historical, logger,
        )
        log_message(
            logger, "Cleaned sources",
            dof_rows=len(dof_clean), dof_tier=_fallback_tier(dof_failed, dof_used_manual),
            census_rows=len(census_clean), census_tier=_fallback_tier(census_failed, census_used_manual),
        )
    except Exception as error:
        _raise_phase_error("Phase 3 — Cleaning", error)

    # Phase 4 — Merge & Aggregate
    try:
        validator = _completeness_validator(schema_config)
        dof_combined = combine_source_with_historical(dof_clean, historical, _DOF_SOURCE, "Year", validator, schema_config)
        census_combined = combine_source_with_historical(census_clean, historical, _CENSUS_SOURCE, "Year", validator, schema_config)

        merged = merge_dof_and_census(dof_combined, census_combined)

        geography = get_california_geography()
        merged = add_state_total(merged, sorted(geography["county_names"]), _AGGREGATION_DIMENSIONS)
        merged = add_regional_data(merged, geography["regions_mapping"], _AGGREGATION_DIMENSIONS)
        enriched = build_precomputed_totals(merged, schema_config)

        dof_new = detect_new_source_data(dof_clean, historical, _DOF_SOURCE, source_settings["dof_boundary_year"], schema_config)
        census_new = detect_new_source_data(census_clean, historical, _CENSUS_SOURCE, source_settings["census_boundary_year"], schema_config)
        log_processing_step(
            logger, "Phase 4 merge & aggregate",
            (len(dof_clean) + len(census_clean), len(CONTRACT_COLUMNS)),
            (len(enriched), len(enriched.columns)),
            dof_new=dof_new, census_new=census_new,
        )
    except Exception as error:
        _raise_phase_error("Phase 4 — Merge & Aggregate", error)

    # Phase 5 — Finalize & Save
    try:
        leveled = assign_geographic_level(enriched, _geography_config(schema_config))
        prepared = prepare_projections_output(leveled, schema_config)
        # Only require the geographic levels for the sources that were actually
        # acquired, so a single-source (e.g. offline DoF-only) run still validates.
        expected_levels = []
        if not dof_failed:
            expected_levels += ["State", "County", "Region"]
        if not census_failed:
            expected_levels += ["US State"]
        final_validation_config = {
            **schema_config.get("final_validation_config", {}),
            "expected_levels": expected_levels,
        }
        is_valid, messages = validate_projections_dataset(prepared, final_validation_config)
        log_data_quality_check(logger, "Projections final validation", is_valid)
        if not is_valid:
            raise ValueError(f"Final validation failed: {messages}")

        output_path = None
        if dof_new or census_new:
            output_path = archive_and_save(prepared, paths["current_data_path"], paths["archive_directory"])
    except Exception as error:
        _raise_phase_error("Phase 5 — Finalize & Save", error)

    return {
        "dataset": prepared,
        "dof_new_data": dof_new,
        "census_new_data": census_new,
        "dof_failed": dof_failed,
        "census_failed": census_failed,
        "output_path": output_path,
        "row_count": len(prepared),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = execute_pipeline_run(
        {"module_id": "projections", "module_label": "Demographic Projections", "phase_total": 5},
        build_projections_dataset,
        get_paths()["logs_directory"],
    )
    print(f"  Rows: {result['row_count']}")
    if result["dof_failed"]:
        print("  WARNING: DoF P-3 live acquisition failed; used last-saved data (stale).")
    if result["census_failed"]:
        print("  WARNING: Census cc-est live acquisition failed; used last-saved data (stale).")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new data detected; file unchanged.")
