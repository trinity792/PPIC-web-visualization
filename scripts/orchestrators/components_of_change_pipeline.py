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
    python scripts/orchestrators/components_of_change_pipeline.py

Test Folders:
    - scripts/unit_tests/orchestrators/
"""

from typing import NoReturn

import pandas as pd

from scripts.components_of_change.acquisition.census_components_downloader import download_census_components, get_census_components_url
from scripts.components_of_change.acquisition.dof_e6_downloader import download_e6_workbook, get_e6_file_url, get_e6_file_url_positional
from scripts.components_of_change.acquisition.source_fallback import acquire_with_fallback
from scripts.components_of_change.cleaning.census_cleaner import clean_census_components
from scripts.components_of_change.cleaning.e6_cleaner import clean_e6
from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography
from scripts.components_of_change.config.paths import get_paths
from scripts.components_of_change.config.sources import get_source_settings
from scripts.components_of_change.merging.historical_merge import combine_source_with_historical, detect_new_source_data, load_canonical_dataset, merge_dof_and_census
from scripts.components_of_change.output.finalize_dataset import archive_and_save, assign_geographic_level, prepare_components_output
from scripts.components_of_change.validation.dataset_validator import validate_components_dataset

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


def _load_saved_source(paths, source):
    historical = load_canonical_dataset(paths["current_data_path"])
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


def build_components_dataset(config=None):
    """Build the Components dataset once and save only when source data changed. Test file: scripts/unit_tests/orchestrators/test_components_of_change_pipeline.py"""
    try:
        paths = (config or {}).get("paths") or get_paths()
        source_settings = (config or {}).get("source_settings") or get_source_settings()
        columns_config = (config or {}).get("columns_config") or get_columns_config()
        geography_config = (config or {}).get("geography_config") or get_components_geography()
        historical_df = load_canonical_dataset(paths["current_data_path"])
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
            [lambda: download_census_components(get_census_components_url(source_settings))],
            paths.get("manual_census_path"),
            lambda: _load_saved_source(paths, "Census"),
            manual_read_kwargs={"engine": "python", "encoding": "latin1"},
        )
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
    except Exception as error:
        _raise_phase_error("Phase 3", error)

    try:
        dof_full = combine_source_with_historical(dof_df, historical_df, "DoF", "Year")
        census_full = combine_source_with_historical(census_df, historical_df, "Census", "Year")
        merged_df = merge_dof_and_census(dof_full, census_full)
        new_dof_data_found = False if dof_failed else detect_new_source_data(dof_full, historical_df, "DoF", source_settings["dof_boundary_year"])
        new_census_data_found = False if census_failed else detect_new_source_data(census_full, historical_df, "Census", source_settings["census_boundary_year"])
    except Exception as error:
        _raise_phase_error("Phase 4", error)

    try:
        finalized_df = assign_geographic_level(merged_df, geography_config)
        finalized_df = prepare_components_output(finalized_df, columns_config["output_columns"])
        data_is_valid, validation_messages = validate_components_dataset(finalized_df, columns_config)
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


def main():
    """Run the Components pipeline and return a summary dictionary. Test file: scripts/unit_tests/orchestrators/test_components_of_change_pipeline.py"""
    result = build_components_dataset()
    dataframe = result["dataframe"]
    numeric_years = pd.to_numeric(dataframe["Year"], errors="coerce")
    return {
        "output_path": result["output_path"],
        "row_count": result["row_count"],
        "year_range": (int(numeric_years.min()), int(numeric_years.max())),
        "new_dof_data_found": result["new_dof_data_found"],
        "new_census_data_found": result["new_census_data_found"],
        "geographic_level_counts": dataframe["Geographic Level"].value_counts().to_dict(),
    }


# ── Main Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
