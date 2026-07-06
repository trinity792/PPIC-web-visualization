"""
pophousing_pipeline.py — orchestrates acquisition, cleaning, enrichment, validation, and output of housing data.

Data sources:
    - California Department of Finance estimates pages — current E-5 workbook discovery
    - {download_directory}/E-5-{YEAR}_Geo_InternetVersion.xlsx — downloaded or cached modern data
    - {historical_data_path}.csv — canonical historical E-8 housing records
    - lib/pophousing_config.py — paths, schemas, sources, and California geography settings

Outputs:
    - {current_data_path}.csv — validated canonical Population & Housing dataset
    - {archive_directory}/{FILENAME}.csv — archived prior output and expired E-5 files
    - {deletion_log_directory}/{WORKBOOK}_deletion-warning-{DAYS}-days.txt — retention warnings
    - dict — output path, row count, year range, and geographic-level counts

Usage:
    python -m scripts.orchestrators.pophousing_pipeline

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/pophousing/integration/
"""

from typing import NoReturn

import pandas as pd

from scripts.pophousing.acquisition.dof_e5_downloader import (
    E5DiscoveryError,
    download_e5_data,
    get_e5_file_url,
    get_most_recent_e5_file,
)
from scripts.pophousing.aggregation.regional_aggregation import add_regional_data
from scripts.pophousing.aggregation.state_aggregation import add_state_data_for_missing_years
from scripts.pophousing.archives.e5_retention import cleanup_old_e5_files
from scripts.pophousing.calculations.rate_normalization import (
    find_decimal_fraction_rates,
    normalize_decimal_fraction_rates,
)
from scripts.pophousing.cleaning.e5_pipeline import clean_e5_data
from scripts.pophousing.cleaning.geographic_classification import (
    assign_geographic_level_with_context,
    assign_missing_geographic_levels,
    standardize_san_francisco_classification,
)
from scripts.pophousing.cleaning.location_standardization import standardize_location_column
from scripts.pophousing.config.geography import get_geography_config
from scripts.pophousing.config.paths import get_paths
from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.config.sources import get_source_settings
from scripts.pophousing.merging.historical_modern_merge import (
    filter_historical_years,
    load_historical_housing_data,
    merge_historical_and_modern_data,
    resolve_source_overlap,
)
from scripts.pophousing.output.finalize_dataset import prepare_housing_output, write_housing_output
from scripts.pophousing.validation.aggregation_validators import validate_normalized_housing_rates
from scripts.pophousing.validation.final_dataset_validator import validate_final_housing_dataset
from scripts.pophousing.validation.historical_data_validator import validate_historical_housing_data
from scripts.shared.archives.file_retention import archive_or_delete_files
from scripts.shared.downloads.http_downloads import HTTPDownloadError
from scripts.shared.logging.dataframe_logging import log_data_quality_check
from scripts.shared.logging.pipeline_logging import log_processing_step
from scripts.shared.logging.run_records import execute_pipeline_run

"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class PipelinePhaseError(RuntimeError):
    """Report failure of a named pipeline phase. Test file: scripts/unit_tests/orchestrators/test_pophousing_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_pophousing_pipeline.py"""
    if isinstance(error, PipelinePhaseError):
        raise error
    raise PipelinePhaseError(f"{phase_name} failed: {error}") from error


"""
========================================================================================================================
Population & Housing Pipeline
========================================================================================================================
"""


def main(logger=None):
    """Run all six pipeline phases and return an output summary. Test file: scripts/unit_tests/orchestrators/test_pophousing_pipeline.py"""
    try:
        paths = get_paths()
        source_settings = get_source_settings()
        schema_config = get_schema_config()
        geography_config = get_geography_config()
        cleanup_old_e5_files(
            download_directory=paths["download_directory"],
            archive_directory=paths["archive_directory"],
            max_age_days=60,
            filename_pattern=r"E-5-\d{4}_Geo_InternetVersion\.xlsx",
            warning_days=(15, 10, 5, 1),
            deletion_log_directory=paths["deletion_log_directory"],
        )
        historical_validation_config = {
            "required_columns": [
                "Location",
                "Geographic Level",
                "Year",
                "Total Population",
                "Total Housing Units",
                "Single Family Units",
            ],
            "year_column": "Year",
            "expected_years": range(1991, 2021),
            "level_column": "Geographic Level",
            "expected_levels": ["State", "County", "City"],
            "location_column": "Location",
            "state_name": "California",
            "state_level": "State",
            "minimum_state_records": 25,
            "population_column": "Total Population",
            "minimum_population_year": 2015,
            "minimum_state_population": 30_000_000,
            "maximum_state_population": 50_000_000,
            "duplicate_key_columns": ["Location", "Geographic Level", "Year"],
        }
        historical_data_is_valid, validation_messages = (
            validate_historical_housing_data(
                paths["historical_data_path"],
                historical_validation_config,
            )
        )
        log_data_quality_check(logger, "Historical data validation", historical_data_is_valid)
        if not historical_data_is_valid:
            raise ValueError(
                "Historical data validation failed: "
                + "; ".join(validation_messages)
            )
    except Exception as error:
        _raise_phase_error("Phase 1", error)

    try:
        try:
            e5_url = get_e5_file_url(source_settings)
        except E5DiscoveryError:
            e5_url = None
        raw_e5_df = None
        if e5_url is not None:
            try:
                raw_e5_df = download_e5_data(
                    e5_url,
                    paths["download_directory"],
                    source_settings["e5_cache_max_age_days"],
                    headers=source_settings["requests_headers"],
                    timeout=source_settings["request_timeout_seconds"],
                )
            except HTTPDownloadError:
                raw_e5_df = None
        if raw_e5_df is None:
            raw_e5_df = get_most_recent_e5_file(
                paths["download_directory"],
                source_settings["e5_filename_pattern"],
                source_settings["e5_fallback_max_age_days"],
            )
        if raw_e5_df is None:
            raise RuntimeError("No current E-5 workbook could be acquired")
    except Exception as error:
        _raise_phase_error("Phase 2", error)

    try:
        modern_housing_df = clean_e5_data(
            raw_e5_df, schema_config, geography_config
        )
        log_processing_step(
            logger, "Phase 3 — Cleaning", raw_e5_df.shape, modern_housing_df.shape
        )
    except Exception as error:
        _raise_phase_error("Phase 3", error)

    try:
        historical_housing_df = load_historical_housing_data(
            paths["historical_data_path"]
        )
        historical_housing_df = filter_historical_years(
            historical_housing_df, max_year=2020
        )
        merged_housing_df = merge_historical_and_modern_data(
            historical_housing_df, modern_housing_df
        )
        merged_housing_df = resolve_source_overlap(
            merged_housing_df,
            key_columns=["Location", "Geographic Level", "Year"],
            source_priority=["E-5", "E-8"],
        )
    except Exception as error:
        _raise_phase_error("Phase 4", error)

    try:
        enriched_housing_df = add_regional_data(
            merged_housing_df, geography_config["regions_mapping"]
        )
        enriched_housing_df = add_state_data_for_missing_years(
            enriched_housing_df, state_name="California"
        )
        decimal_rate_mask = find_decimal_fraction_rates(
            enriched_housing_df,
            year_col="Year",
            rate_col="Vacancy Rate (%)",
            level_col="Geographic Level",
            min_year=2020,
        )
        enriched_housing_df = normalize_decimal_fraction_rates(
            enriched_housing_df,
            rate_col="Vacancy Rate (%)",
            mask=decimal_rate_mask,
        )
        rates_are_valid, rate_validation_messages = (
            validate_normalized_housing_rates(
                enriched_housing_df,
                year_col="Year",
                rate_col="Vacancy Rate (%)",
                level_col="Geographic Level",
            )
        )
        if not rates_are_valid:
            raise ValueError(
                "Housing rate validation failed: "
                + "; ".join(rate_validation_messages)
            )
    except Exception as error:
        _raise_phase_error("Phase 5", error)

    try:
        finalized_housing_df = assign_missing_geographic_levels(
            enriched_housing_df,
            classifier_fn=assign_geographic_level_with_context,
            location_col="Location",
            county_col="County",
            population_col="Total Population",
            level_col="Geographic Level",
        )
        finalized_housing_df = standardize_location_column(
            finalized_housing_df,
            location_col="Location",
            geo_col="Geographic Level",
            only_levels=("City", "Town"),
        )
        finalized_housing_df = standardize_san_francisco_classification(
            finalized_housing_df,
            location_col="Location",
            level_col="Geographic Level",
        )
        finalized_housing_df = prepare_housing_output(
            finalized_housing_df,
            source_name="DoF",
            output_columns=schema_config["output_columns"],
            sort_columns=["Geographic Level", "Location", "Year"],
        )
        final_data_is_valid, final_validation_messages = (
            validate_final_housing_dataset(
                finalized_housing_df,
                schema_config["final_validation"],
            )
        )
        log_data_quality_check(logger, "Final dataset validation", final_data_is_valid)
        if not final_data_is_valid:
            raise ValueError(
                "Final data validation failed: "
                + "; ".join(final_validation_messages)
            )
        if paths["current_data_path"].is_file():
            archive_or_delete_files(
                [paths["current_data_path"]], paths["archive_directory"]
            )
        write_housing_output(finalized_housing_df, paths["current_data_path"])

        numeric_years = pd.to_numeric(finalized_housing_df["Year"])
        return {
            "output_path": paths["current_data_path"],
            "row_count": len(finalized_housing_df),
            "year_range": (
                int(numeric_years.min()),
                int(numeric_years.max()),
            ),
            "geographic_level_counts": finalized_housing_df[
                "Geographic Level"
            ].value_counts().to_dict(),
        }
    except Exception as error:
        _raise_phase_error("Phase 6", error)


# ── Main Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    execute_pipeline_run(
        {"module_id": "pophousing", "module_label": "Population & Housing", "phase_total": 6},
        main,
        get_paths()["logs_directory"],
    )
