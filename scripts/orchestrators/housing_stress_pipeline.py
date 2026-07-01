"""
housing_stress_pipeline.py — orchestrates acquisition, cleaning, geographic aggregation, merging, validation, and output of ACS Housing Stress data.

Data sources:
    - ACS 1-year table-based Summary File (B25140 + race iterations) via the downloader
    - data/data-raw/housing-stress/ — PUMA crosswalks and optional manual fallback files
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — saved canonical fallback and historical source
    - scripts/shared/geography/california_geography.py — county/region reference names

Outputs:
    - pandas.DataFrame — merged ACS Housing Stress dataset
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — updated when new data is detected
    - dict — dataset, change flag, fallback flags, resolved year, output path, and row count

Usage:
    python scripts/orchestrators/housing_stress_pipeline.py

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/housing_stress/
"""

from typing import NoReturn

from scripts.housing_stress.acquisition.acs_sf_downloader import (
    ACSTableUnavailableError,
    download_all_iterations,
    download_national_table,
)
from scripts.housing_stress.acquisition.source_fallback import (
    acquire_with_fallback,
    resolve_latest_vintage,
)
from scripts.housing_stress.aggregation.geographic_levels import build_all_levels
from scripts.housing_stress.config.paths import get_paths
from scripts.housing_stress.config.schemas import get_schema_config
from scripts.housing_stress.config.sources import get_source_settings
from scripts.housing_stress.merging.historical_merge import (
    combine_with_historical,
    detect_new_data,
    load_canonical_dataset,
)
from scripts.housing_stress.output.finalize_dataset import archive_and_save, prepare_output
from scripts.housing_stress.validation.housing_stress_validators import (
    validate_housing_stress_dataset,
    validate_stratification_completeness,
)
from scripts.shared.geography.california_geography import get_california_geography

_YEAR_COLUMN = "Year"
_LEVEL_COLUMN = "Geographic Level"


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


def _download_states(year, source_settings, headers, timeout):
    """
    Download the state-summary rows of every iteration for all 50 states.

    Each iteration's national .dat is downloaded once and filtered to the state summary level
    (GEO_ID prefix "0400000US") — not re-downloaded per state. A missing non-base iteration is
    skipped; a missing base table raises so acquisition falls back. build_state_rows applies
    the DC/PR exclusion via the configured state abbreviations.
    """
    frames = {}
    for index, (tblid, raw_label) in enumerate(source_settings["table_iterations"].items()):
        try:
            national = download_national_table(tblid, year, source_settings["dataset"], source_settings, headers, timeout)
        except ACSTableUnavailableError:
            if index == 0:
                raise
            continue
        frames[raw_label] = national[national.index.astype(str).str.startswith("0400000US")]
    return frames


def _saved_rows_for_levels(historical_df, levels):
    """Return the historical rows for a set of geographic levels."""
    return historical_df[historical_df[_LEVEL_COLUMN].isin(levels)]


"""
========================================================================================================================
Housing Stress Pipeline
========================================================================================================================
"""


def build_housing_stress_dataset(config=None):
    """
    Build the ACS Housing Stress dataset and save only when source data changed.

    Runs five phases, wrapping each so any exception re-raises as a
    HousingStressPipelinePhaseError tagged with the phase name.

    Returns:
        dict with keys: dataset, new_data, source_failed, used_manual, resolved_year,
        output_path (or None), row_count.

    Test file: scripts/unit_tests/orchestrators/test_housing_stress_pipeline.py
    """
    # Phase 1 — Setup & Load
    try:
        paths = get_paths()
        source_settings = get_source_settings()
        schema_config = get_schema_config()
        geography = get_california_geography()
        historical = load_canonical_dataset(paths["current_data_path"])
        headers = source_settings["request_headers"]
        timeout = source_settings["timeout"]
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 1 — Setup & Load", error)

    # Phase 2 — Acquisition
    try:
        resolved_year = resolve_latest_vintage(
            "CA",
            source_settings,
            headers,
            timeout,
            source_settings["max_year_lookback"],
            source_settings["excluded_years"],
        )
        state_frames, state_failed, state_manual = acquire_with_fallback(
            lambda: _download_states(resolved_year, source_settings, headers, timeout),
            paths["manual_state_path"],
            lambda: _saved_rows_for_levels(historical, ["State"]),
        )
        ca_frames, ca_failed, ca_manual = acquire_with_fallback(
            lambda: download_all_iterations(resolved_year, source_settings["dataset"], "CA", source_settings, headers, timeout)[0],
            paths["manual_ca_path"],
            lambda: _saved_rows_for_levels(historical, ["Region", "County"]),
        )
        source_failed = state_failed or ca_failed
        used_manual = state_manual or ca_manual
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 2 — Acquisition", error)

    # Phase 3 — Build levels
    try:
        built = build_all_levels(ca_frames, state_frames, resolved_year, paths, schema_config, geography)
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
        new_data = detect_new_data(merged, historical)
    except HousingStressPipelinePhaseError:
        raise
    except Exception as error:
        _raise_phase_error("Phase 4 — Merge", error)

    # Phase 5 — Finalize & Save
    try:
        prepared = prepare_output(merged, schema_config)
        is_valid, messages = validate_housing_stress_dataset(prepared, schema_config["final_validation_config"])
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
        "used_manual": used_manual,
        "resolved_year": resolved_year,
        "output_path": output_path,
        "row_count": len(prepared),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = build_housing_stress_dataset()
    print(f"  Vintage: {result['resolved_year']}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new data detected; file unchanged.")
