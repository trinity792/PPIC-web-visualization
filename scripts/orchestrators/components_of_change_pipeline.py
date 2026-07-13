"""
components_of_change_pipeline.py — orchestrates acquisition, cleaning, merging, validation, and output of Components data.

Data sources:
    - California Department of Finance estimates page — current E-6 workbook discovery and download
    - U.S. Census FTP2 population estimates — county component estimates CSV discovery and download
    - data/data-raw/components-of-change/{FILENAME}.csv — optional manual fallback downloads
    - data/data-cleaned/components-of-change/ComponentsOfChange_Current.csv — saved canonical fallback and historical source

Outputs:
    - pandas.DataFrame — merged Components of Change dataset
    - data/data-cleaned/components-of-change/ComponentsOfChange_Current.csv — updated canonical dataset when new data is detected
    - dict — dataset, source change flags, fallback flags, output path, and row count

Usage:
    python -m scripts.orchestrators.components_of_change_pipeline

Test Folders:
    - scripts/unit_tests/orchestrators/
"""

from datetime import date
from typing import NoReturn

import pandas as pd

from scripts.components_of_change.acquisition.census_components_downloader import discover_census_components, download_census_components
from scripts.components_of_change.acquisition.dof_e6_downloader import download_e6_workbook, get_e6_file_url, get_e6_file_url_positional
from scripts.components_of_change.acquisition.source_fallback import acquire_with_fallback
from scripts.components_of_change.cleaning.census_cleaner import clean_census_components
from scripts.components_of_change.cleaning.e6_cleaner import clean_e6
from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography
from scripts.components_of_change.config.paths import get_paths
from scripts.components_of_change.config.sources import get_source_settings
from scripts.components_of_change.merging.historical_merge import combine_history_sources, combine_source_with_historical, detect_new_source_data, load_canonical_dataset, load_historical_baseline, merge_dof_and_census
from scripts.components_of_change.output.finalize_dataset import archive_and_save, assign_geographic_level, prepare_components_output
from scripts.components_of_change.validation.dataset_validator import validate_components_dataset
from scripts.shared.logging.dataframe_logging import log_data_quality_check, log_dataframe_info
from scripts.shared.logging.pipeline_logging import log_message, log_processing_step
from scripts.shared.logging.run_records import execute_pipeline_run

"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class ComponentsPipelinePhaseError(RuntimeError):
    """Report failure of a named Components pipeline phase. Test file: scripts/unit_tests/orchestrators/test_components_of_change_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_components_of_change_pipeline.py"""
    if isinstance(error, ComponentsPipelinePhaseError):
        raise error
    raise ComponentsPipelinePhaseError(f"{phase_name} failed: {error}") from error


# ── Helpers ───────────────────────────────────────────────────────────────────


def _acquire_live_census(source_settings):
    """Return a callable that discovers and downloads the live Census file with one fetch (B5)."""

    def _acquire():
        url, response = discover_census_components(source_settings)
        return download_census_components(url, source_settings, response=response)

    return _acquire


def _load_saved_source(paths, source):
    historical = load_canonical_dataset(paths["current_data_path"])
    if "Source" not in historical.columns:
        # Cold start with no saved output: no last-saved rows to fall back to.
        return historical.copy()
    if "Geographic Level" in historical.columns:
        historical = historical.drop(columns=["Geographic Level"])
    return historical.loc[historical["Source"].eq(source)].copy()


def _clean_with_fallback(raw_df, clean_fn, columns_config, geography_config, source, paths, source_failed, used_manual, manual_path, manual_read_kwargs=None):
    """Clean source data or fall back to manual and last-saved rows. Test file: scripts/unit_tests/orchestrators/test_components_of_change_pipeline.py"""
    if source_failed:
        return raw_df, True, used_manual
    try:
        return clean_fn(raw_df, columns_config, geography_config), False, used_manual
    except Exception:
        if not used_manual and manual_path is not None:
            try:
                manual_df = pd.read_csv(manual_path, **(manual_read_kwargs or {}))
                return clean_fn(manual_df, columns_config, geography_config), False, True
            except Exception:
                pass
        return _load_saved_source(paths, source), True, used_manual


"""
========================================================================================================================
Components Pipeline
========================================================================================================================
"""


def build_components_dataset(config=None, logger=None):
    """Build the Components dataset once and save only when source data changed. Test file: scripts/unit_tests/orchestrators/test_components_of_change_pipeline.py"""
    try:
        paths = (config or {}).get("paths") or get_paths()
        source_settings = (config or {}).get("source_settings") or get_source_settings()
        columns_config = (config or {}).get("columns_config") or get_columns_config()
        geography_config = (config or {}).get("geography_config") or get_components_geography()
        # Change-detection baseline and last-saved fallback come from the current
        # output; the immutable seed only supplements deep history (guide A1).
        current_df = load_canonical_dataset(paths["current_data_path"])
        baseline_df = load_historical_baseline(paths.get("historical_data_path"))
        historical_df = combine_history_sources(baseline_df, current_df)
        log_dataframe_info(logger, historical_df, "Loaded saved Components history")
    except Exception as error:
        _raise_phase_error("Phase 1", error)

    try:
        dof_raw, dof_failed, dof_used_manual = acquire_with_fallback(
            [
                lambda: download_e6_workbook(get_e6_file_url(source_settings), source_settings["requests_headers"], source_settings["request_timeout_seconds"], source_settings["e6_sheet_index"]),
                lambda: download_e6_workbook(get_e6_file_url_positional(source_settings), source_settings["requests_headers"], source_settings["request_timeout_seconds"], source_settings["e6_sheet_index"]),
            ],
            paths.get("manual_dof_path"),
            lambda: _load_saved_source(paths, "DoF"),
        )
        census_raw, census_failed, census_used_manual = acquire_with_fallback(
            [_acquire_live_census(source_settings)],
            paths.get("manual_census_path"),
            lambda: _load_saved_source(paths, "Census"),
            manual_read_kwargs={"engine": "python", "encoding": "latin1"},
        )
        log_message(logger, "Phase 2 acquisition complete", dof_used_manual=dof_used_manual, dof_failed=dof_failed, census_used_manual=census_used_manual, census_failed=census_failed)
    except Exception as error:
        _raise_phase_error("Phase 2", error)

    try:
        dof_df, dof_failed, dof_used_manual = _clean_with_fallback(
            dof_raw,
            clean_e6,
            columns_config,
            geography_config,
            "DoF",
            paths,
            dof_failed,
            dof_used_manual,
            paths.get("manual_dof_path"),
        )
        census_df, census_failed, census_used_manual = _clean_with_fallback(
            census_raw,
            clean_census_components,
            columns_config,
            geography_config,
            "Census",
            paths,
            census_failed,
            census_used_manual,
            paths.get("manual_census_path"),
            {"engine": "python", "encoding": "latin1"},
        )
        log_message(logger, "Phase 3 cleaning complete", dof_rows=len(dof_df), census_rows=len(census_df))
    except Exception as error:
        _raise_phase_error("Phase 3", error)

    try:
        dof_full = combine_source_with_historical(dof_df, historical_df, "DoF", "Year")
        census_full = combine_source_with_historical(census_df, historical_df, "Census", "Year")
        merged_df = merge_dof_and_census(dof_full, census_full)
        # Novelty is measured against the current output (current_df), not the seed
        # union, so a run whose live pull matches the last output does not re-save.
        new_dof_data_found = False if dof_failed else detect_new_source_data(dof_full, current_df, "DoF", source_settings["dof_boundary_year"])
        new_census_data_found = False if census_failed else detect_new_source_data(census_full, current_df, "Census", source_settings["census_boundary_year"])
        log_processing_step(logger, "Phase 4 merge", (len(dof_full) + len(census_full), len(merged_df.columns)), (len(merged_df), len(merged_df.columns)), new_dof=new_dof_data_found, new_census=new_census_data_found)
    except Exception as error:
        _raise_phase_error("Phase 4", error)

    try:
        finalized_df = assign_geographic_level(merged_df, geography_config)
        finalized_df = prepare_components_output(finalized_df, columns_config["output_columns"])
        data_is_valid, validation_messages, validation_warnings = validate_components_dataset(
            finalized_df,
            columns_config,
            geography_config,
            maximum_year=date.today().year,
        )
        log_data_quality_check(logger, "Components dataset validation", data_is_valid)
        for warning_message in validation_warnings:
            # Soft anomalies are recorded but do not block the save (guide B1).
            log_data_quality_check(logger, f"Components soft check: {warning_message}", False)
        if not data_is_valid:
            raise ValueError("Components data validation failed: " + "; ".join(validation_messages))
        output_path = None
        if new_dof_data_found or new_census_data_found:
            output_path = archive_and_save(finalized_df, paths["current_data_path"], paths["archive_directory"])
    except Exception as error:
        _raise_phase_error("Phase 5", error)

    return {
        "dataframe": finalized_df,
        "new_dof_data_found": new_dof_data_found,
        "new_census_data_found": new_census_data_found,
        "dof_failed": dof_failed,
        "census_failed": census_failed,
        "dof_used_manual": dof_used_manual,
        "census_used_manual": census_used_manual,
        "output_path": output_path,
        "row_count": len(finalized_df),
    }


def main(logger=None):
    """Run the Components pipeline and return a summary dictionary. Test file: scripts/unit_tests/orchestrators/test_components_of_change_pipeline.py"""
    result = build_components_dataset(logger=logger)
    dataframe = result["dataframe"]
    numeric_years = pd.to_numeric(dataframe["Year"], errors="coerce")
    return {
        "output_path": result["output_path"],
        "row_count": result["row_count"],
        "year_range": (int(numeric_years.min()), int(numeric_years.max())),
        "new_dof_data_found": result["new_dof_data_found"],
        "new_census_data_found": result["new_census_data_found"],
        # Surfaced so the run record can flag a recovered (fallback) run.
        "dof_failed": result["dof_failed"],
        "census_failed": result["census_failed"],
        "dof_used_manual": result["dof_used_manual"],
        "census_used_manual": result["census_used_manual"],
        "geographic_level_counts": dataframe["Geographic Level"].value_counts().to_dict(),
    }


# ── Main Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    execute_pipeline_run(
        {"module_id": "components-of-change", "module_label": "Components of Change", "phase_total": 5},
        main,
        get_paths()["logs_directory"],
    )
