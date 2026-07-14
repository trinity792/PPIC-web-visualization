"""
housing_stress_backfill.py — seeds the immutable deep-history file by building every ACS vintage from 2012 onward.

The live pipeline fetches only the newest vintage per run, so a from-scratch build is
single-year. This one-time driver walks every published ACS 1-year vintage from earliest_year
(2012, skipping 2020) to the latest available, runs each through the same acquisition + build
+ merge path the live pipeline uses (with the year pinned rather than resolved), and writes
the accumulated series to the immutable deep-history seed (HousingStress_Historical.csv). The
live pipeline then unions that seed with its per-run vintage, so deep years survive a rebuild
of the current file.

Rebuild-on-demand safety: writing the seed archives the existing seed first (via
archive_and_save), so a failed rebuild leaves the prior good seed recoverable in the archive
rather than destroyed.

Data sources:
    - ACS 1-year table-based Summary File (B25140 + race iterations) via the downloader

Outputs:
    - data/data-cleaned/housing-stress/HousingStress_Historical.csv — the deep-history seed
    - dict — the built dataset, the years included/skipped, output path, and row count

Usage:
    Run as a module from the repository root (so the absolute `scripts.` imports resolve):
        python -m scripts.orchestrators.housing_stress_backfill

Test Folders:
    - scripts/unit_tests/orchestrators/
"""

from pathlib import Path

import pandas as pd

from scripts.housing_stress.acquisition.acs_sf_downloader import ACSTableUnavailableError
from scripts.housing_stress.aggregation.geographic_levels import build_all_levels
from scripts.housing_stress.cleaning.race_ethnicity_mapping import reconcile_race_label
from scripts.housing_stress.config.paths import get_paths
from scripts.housing_stress.config.schemas import get_schema_config
from scripts.housing_stress.config.sources import get_source_settings
from scripts.housing_stress.merging.historical_merge import (
    combine_with_historical,
    load_canonical_dataset,
)
from scripts.housing_stress.output.finalize_dataset import archive_and_save, prepare_output
from scripts.housing_stress.validation.housing_stress_validators import (
    validate_cleaning_output,
    validate_housing_stress_dataset,
    validate_stratification_completeness,
)
from scripts.orchestrators.housing_stress_pipeline import _acquire_live_frames
from scripts.shared.geography.california_geography import get_california_geography
from scripts.shared.logging.dataframe_logging import log_dataframe_info
from scripts.shared.logging.pipeline_logging import log_message
from scripts.shared.logging.run_records import execute_pipeline_run

_YEAR_COLUMN = "Year"


"""
========================================================================================================================
Legacy Deep-History Bootstrap
========================================================================================================================
"""

# The legacy CSV's column names before they are renamed to the V3 contract.
_LEGACY_RENAME = {"Race/ethnicity": "Race/Ethnicity", "Label": "Tenure"}


def _load_legacy_seed(legacy_path, schema_config, cutoff_year, excluded_years, logger=None):
    """
    Load the pre-cutoff years from the legacy CSV, reconciled to the V3 contract.

    The Census table-based Summary File only carries 2022 onward, so the earlier years live in
    the set-aside legacy CSV (old sequence-based format). Its schema is the V3 contract except
    for two column names and the raw race labels, and its values are identical to V3 on the
    overlap years — so it is bootstrapped by renaming the columns, reconciling the race labels
    with the same map the live cleaner uses, and taking the years below cutoff_year (excluding
    the permanently-gapped year). Returns an empty contract frame when the file is absent.
    """
    output_columns = schema_config["output_columns"]
    if not legacy_path or not Path(legacy_path).exists():
        log_message(logger, "Legacy seed file absent; skipping pre-cutoff bootstrap", path=str(legacy_path))
        return pd.DataFrame(columns=output_columns)

    year_column = schema_config["year_column"]
    race_column = schema_config["race_column"]
    frame = pd.read_csv(legacy_path).rename(columns=_LEGACY_RENAME)
    frame = reconcile_race_label(frame, race_column, schema_config["race_reconciliation_map"])
    frame = frame[(frame[year_column] < cutoff_year) & (~frame[year_column].isin(excluded_years))]

    missing = [column for column in output_columns if column not in frame.columns]
    if missing:
        raise ValueError(f"Legacy seed {legacy_path} is missing contract columns after reconciliation: {missing}")

    frame = frame[output_columns].copy()
    log_message(logger, "Loaded legacy deep-history seed", rows=len(frame), years=sorted(frame[year_column].unique().tolist()))
    return frame


"""
========================================================================================================================
Backfill Driver
========================================================================================================================
"""


def backfill_housing_stress_history(config=None, logger=None, start_year=None, end_year=None, acquire_frames_fn=None, include_legacy=True):
    """
    Build every available ACS vintage from start_year..end_year into the deep-history seed.

    Reuses the live acquisition + build path with the year pinned. A vintage whose base table
    is not published (ACSTableUnavailableError) is skipped and recorded; any other failure
    propagates. The existing seed is archived before the new one is written, so a rebuild never
    destroys the prior good seed.

    Returns:
        dict with keys: dataset, years_included, years_skipped, output_path (or None), row_count.

    Test file: scripts/unit_tests/orchestrators/test_housing_stress_backfill.py
    """
    paths = get_paths()
    source_settings = get_source_settings()
    schema_config = get_schema_config()
    geography = get_california_geography()
    headers = source_settings["request_headers"]
    timeout = source_settings["timeout"]
    cache_dir = paths["download_directory"]
    excluded_years = source_settings["excluded_years"]

    start = start_year if start_year is not None else source_settings["earliest_year"]
    end = end_year if end_year is not None else _latest_probeable_year(source_settings)
    acquire = acquire_frames_fn or (lambda year: _acquire_live_frames(year, source_settings, headers, timeout, cache_dir, logger=logger))

    # Seed from the existing deep-history file so a re-run is incremental, not a
    # full re-download when only later years are missing.
    accumulated = load_canonical_dataset(paths["historical_data_path"])
    years_included = []
    years_skipped = []

    for year in range(start, end + 1):
        if year in excluded_years:
            years_skipped.append(year)
            continue
        try:
            frames = acquire(year)
        except ACSTableUnavailableError:
            years_skipped.append(year)
            log_message(logger, "Backfill skipped unpublished vintage", year=year)
            continue

        built = build_all_levels(frames["ca"], frames["state"], year, paths, schema_config, geography)
        is_clean, clean_messages = validate_cleaning_output(built, schema_config)
        if not is_clean:
            raise ValueError(f"Backfill cleaning validation failed for {year}: {clean_messages}")

        accumulated = combine_with_historical(
            built,
            accumulated,
            _YEAR_COLUMN,
            lambda candidate: validate_stratification_completeness(candidate, schema_config),
        )
        years_included.append(year)
        log_message(logger, "Backfill built vintage", year=year, rows=len(built))

    legacy_years = []
    if include_legacy:
        # The table-based Summary File starts at the earliest V3 year built; the
        # years below it come from the legacy CSV. Trusted, pre-computed data whose
        # small-population strata legitimately drop a tenure sub-cell, so it is gated
        # by the final validator, not the per-vintage completeness gate (which exists
        # to catch build bugs in fresh vintages and would hard-fail these gaps).
        cutoff_year = min(years_included) if years_included else end + 1
        legacy = _load_legacy_seed(paths["legacy_seed_path"], schema_config, cutoff_year, excluded_years, logger=logger)
        if not legacy.empty:
            def _legacy_completeness(candidate):
                _ok, messages = validate_stratification_completeness(candidate, schema_config)
                incomplete = [message for message in messages if message.startswith("ERROR")]
                if incomplete:
                    log_message(logger, "Legacy years carry suppressed tenure strata (kept as-is)", incomplete_strata=len(incomplete))
                return True, messages

            accumulated = combine_with_historical(legacy, accumulated, _YEAR_COLUMN, _legacy_completeness)
            legacy_years = sorted(legacy[_YEAR_COLUMN].unique().tolist())

    prepared = prepare_output(accumulated, schema_config)
    is_valid, messages = validate_housing_stress_dataset(prepared, schema_config["final_validation_config"])
    if not is_valid:
        raise ValueError(f"Backfill final validation failed: {messages}")

    log_dataframe_info(logger, prepared, "Backfilled Housing Stress deep-history seed")
    output_path = archive_and_save(prepared, paths["historical_data_path"], paths["archive_directory"])

    return {
        "dataset": prepared,
        "years_included": years_included,
        "years_skipped": years_skipped,
        "legacy_years": legacy_years,
        "output_path": output_path,
        "row_count": len(prepared),
    }


def _latest_probeable_year(source_settings):
    """Resolve the newest available vintage to bound the backfill's upper end."""
    from scripts.housing_stress.acquisition.source_fallback import resolve_latest_vintage

    paths = get_paths()
    return resolve_latest_vintage(
        "CA",
        source_settings,
        source_settings["request_headers"],
        source_settings["timeout"],
        source_settings["max_year_lookback"],
        source_settings["excluded_years"],
        earliest_year=source_settings["earliest_year"],
        cache_dir=paths["download_directory"],
        probe_retry_attempts=source_settings["probe_retry_attempts"],
    )


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = execute_pipeline_run(
        {"module_id": "housing-stress-backfill", "module_label": "ACS Housing Stress Backfill", "phase_total": 1},
        backfill_housing_stress_history,
        get_paths()["logs_directory"],
    )
    unavailable = sorted(set(result["years_skipped"]) - set(result["legacy_years"]))
    print(f"  Years built live (table-based SF): {result['years_included']}")
    print(f"  Years from legacy CSV: {result['legacy_years']}")
    print(f"  Years unavailable (gap / not published): {unavailable}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  Seed unchanged (identical to existing); file not rewritten.")
