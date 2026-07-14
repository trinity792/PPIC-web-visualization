from unittest.mock import Mock

import pandas as pd

from scripts.housing_stress.acquisition.acs_sf_downloader import ACSTableUnavailableError
from scripts.orchestrators import housing_stress_backfill as backfill

CONTRACT_COLUMNS = [
    "Year",
    "Geographic Level",
    "Location",
    "Race/Ethnicity",
    "Tenure",
    "Number Over 30%",
    "Number Over 50%",
    "Share Over 30%",
    "Share Over 50%",
]


def _row(year):
    return {
        "Year": year,
        "Geographic Level": "State",
        "Location": "CA",
        "Race/Ethnicity": "All",
        "Tenure": "Total",
        "Number Over 30%": 30,
        "Number Over 50%": 15,
        "Share Over 30%": 0.30,
        "Share Over 50%": 0.15,
    }


def _configure(monkeypatch, tmp_path):
    paths = {
        "historical_data_path": tmp_path / "HousingStress_Historical.csv",
        "archive_directory": tmp_path / "archive",
        "download_directory": tmp_path / "raw",
        "legacy_seed_path": tmp_path / "legacy.csv",
    }
    source_settings = {
        "request_headers": {"User-Agent": "test"},
        "timeout": 30,
        "earliest_year": 2018,
        "excluded_years": {2020},
        "max_year_lookback": 6,
        "probe_retry_attempts": 3,
    }
    schema_config = {
        "output_columns": CONTRACT_COLUMNS,
        "year_column": "Year",
        "race_column": "Race/Ethnicity",
        "race_reconciliation_map": {"All": "All", "American Indian/Alaskan Native": "AIAN"},
        "final_validation_config": {"required_columns": CONTRACT_COLUMNS},
    }

    monkeypatch.setattr(backfill, "get_paths", Mock(return_value=paths))
    monkeypatch.setattr(backfill, "get_source_settings", Mock(return_value=source_settings))
    monkeypatch.setattr(backfill, "get_schema_config", Mock(return_value=schema_config))
    monkeypatch.setattr(backfill, "get_california_geography", Mock(return_value={}))
    monkeypatch.setattr(backfill, "load_canonical_dataset", Mock(return_value=pd.DataFrame(columns=CONTRACT_COLUMNS)))
    monkeypatch.setattr(backfill, "build_all_levels", Mock(side_effect=lambda ca, state, year, *a, **k: pd.DataFrame([_row(year)])))
    monkeypatch.setattr(backfill, "validate_cleaning_output", Mock(return_value=(True, [])))
    monkeypatch.setattr(backfill, "validate_stratification_completeness", Mock(return_value=(True, [])))
    monkeypatch.setattr(
        backfill,
        "combine_with_historical",
        Mock(side_effect=lambda new, hist, *a, **k: pd.concat([hist, new], ignore_index=True)),
    )
    monkeypatch.setattr(backfill, "prepare_output", Mock(side_effect=lambda df, schema: df))
    monkeypatch.setattr(backfill, "validate_housing_stress_dataset", Mock(return_value=(True, [])))
    monkeypatch.setattr(backfill, "archive_and_save", Mock(return_value=paths["historical_data_path"]))
    return paths


def test_backfill_builds_each_year_skips_excluded_and_unpublished(monkeypatch, tmp_path):
    paths = _configure(monkeypatch, tmp_path)

    def acquire(year):
        if year == 2019:
            raise ACSTableUnavailableError(f"{year} not published")
        return {"ca": {}, "state": {}}

    result = backfill.backfill_housing_stress_history(
        start_year=2018, end_year=2021, acquire_frames_fn=acquire
    )

    # 2018 + 2021 built; 2019 unpublished and 2020 excluded are skipped.
    assert result["years_included"] == [2018, 2021]
    assert result["years_skipped"] == [2019, 2020]
    assert result["legacy_years"] == []  # no legacy file present
    assert set(result["dataset"]["Year"]) == {2018, 2021}
    # The seed is written to the immutable history path via archive_and_save.
    assert backfill.archive_and_save.call_args.args[1] == paths["historical_data_path"]


def test_backfill_bootstraps_pre_cutoff_years_from_legacy_csv(monkeypatch, tmp_path):
    paths = _configure(monkeypatch, tmp_path)
    # Legacy CSV in the old schema: column renames + raw race labels + a 2020 row
    # (must be dropped) and a 2023 row (>= cutoff, must be dropped).
    legacy = pd.DataFrame(
        [
            {"Year": 2015, "Geographic Level": "State", "Location": "CA", "Race/ethnicity": "American Indian/Alaskan Native", "Label": "Total", "Number Over 30%": 5, "Number Over 50%": 2, "Share Over 30%": 0.1, "Share Over 50%": 0.05},
            {"Year": 2020, "Geographic Level": "State", "Location": "CA", "Race/ethnicity": "All", "Label": "Total", "Number Over 30%": 9, "Number Over 50%": 4, "Share Over 30%": 0.2, "Share Over 50%": 0.1},
            {"Year": 2023, "Geographic Level": "State", "Location": "CA", "Race/ethnicity": "All", "Label": "Total", "Number Over 30%": 9, "Number Over 50%": 4, "Share Over 30%": 0.2, "Share Over 50%": 0.1},
        ]
    )
    legacy.to_csv(paths["legacy_seed_path"], index=False)

    result = backfill.backfill_housing_stress_history(
        start_year=2022, end_year=2022, acquire_frames_fn=lambda year: {"ca": {}, "state": {}}
    )

    # V3 built 2022; legacy contributes only 2015 (2020 excluded, 2023 >= cutoff dropped).
    assert result["years_included"] == [2022]
    assert result["legacy_years"] == [2015]
    assert set(result["dataset"]["Year"]) == {2015, 2022}
    # The raw legacy race label was reconciled to the canonical value.
    assert set(result["dataset"].loc[result["dataset"]["Year"] == 2015, "Race/Ethnicity"]) == {"AIAN"}
