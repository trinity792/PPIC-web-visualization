from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.housing_stress.acquisition.source_fallback import (
    CONTRACT_ROWS,
    ITERATION_FRAMES,
    AcquisitionResult,
)
from scripts.orchestrators import housing_stress_pipeline as pipeline

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


def _frame(number_30=30):
    return pd.DataFrame(
        [
            {
                "Year": 2023,
                "Geographic Level": "State",
                "Location": "CA",
                "Race/Ethnicity": "All",
                "Tenure": "Total",
                "Number Over 30%": number_30,
                "Number Over 50%": 15,
                "Share Over 30%": 0.30,
                "Share Over 50%": 0.15,
            }
        ],
        columns=CONTRACT_COLUMNS,
    )


def _configure_success(monkeypatch, tmp_path, *, new_data=True):
    paths = {
        "current_data_path": tmp_path / "HousingStress_Current.csv",
        "historical_data_path": tmp_path / "HousingStress_Historical.csv",
        "archive_directory": tmp_path / "archive",
        "download_directory": tmp_path / "raw",
        "manual_state_path": tmp_path / "manual-state.csv",
        "manual_ca_path": tmp_path / "manual-ca.csv",
        "county_crosswalk_path": tmp_path / "county-crosswalk.csv",
        "region_crosswalk_path": tmp_path / "region-crosswalk.csv",
    }
    source_settings = {
        "dataset": "1",
        "request_headers": {"User-Agent": "test"},
        "timeout": 30,
        "max_year_lookback": 6,
        "excluded_years": {2020},
        "earliest_year": 2012,
        "probe_retry_attempts": 3,
        "table_iterations": {"b25140": "All"},
        "base_table_id": "b25140",
    }
    schema_config = {
        "output_columns": CONTRACT_COLUMNS,
        "state_abbreviations": ["CA"],
        "final_validation_config": {
            "required_columns": CONTRACT_COLUMNS,
        },
    }
    geography = {
        "state_name": "California",
        "county_names": {"Alameda"},
        "region_names": {"Bay Area"},
        "regions_mapping": {"Bay Area": ["Alameda"]},
    }
    historical = _frame(number_30=20)
    live_data = {
        "state": {"All": pd.DataFrame({"scope": ["states"]})},
        "ca": {"All": pd.DataFrame({"scope": ["ca"]})},
    }
    built = _frame(number_30=30)
    merged = _frame(number_30=30)
    prepared = _frame(number_30=30)

    mocks = {
        "resolve_latest_vintage": Mock(return_value=2023),
        "acquire_with_fallback": Mock(
            return_value=AcquisitionResult(ITERATION_FRAMES, live_data, False, False)
        ),
        "build_all_levels": Mock(return_value=built),
        "validate_cleaning_output": Mock(return_value=(True, [])),
        "validate_stratification_completeness": Mock(return_value=(True, [])),
        "combine_with_historical": Mock(return_value=merged),
        "detect_new_data": Mock(return_value=new_data),
        "prepare_output": Mock(return_value=prepared),
        "validate_housing_stress_dataset": Mock(return_value=(True, [])),
        "archive_and_save": Mock(return_value=paths["current_data_path"]),
    }

    monkeypatch.setattr(pipeline, "get_paths", Mock(return_value=paths))
    monkeypatch.setattr(pipeline, "get_source_settings", Mock(return_value=source_settings))
    monkeypatch.setattr(pipeline, "get_schema_config", Mock(return_value=schema_config))
    monkeypatch.setattr(pipeline, "get_california_geography", Mock(return_value=geography))
    monkeypatch.setattr(pipeline, "load_canonical_dataset", Mock(return_value=historical))
    monkeypatch.setattr(pipeline, "load_historical_baseline", Mock(return_value=pd.DataFrame(columns=CONTRACT_COLUMNS)))
    monkeypatch.setattr(pipeline, "combine_history_sources", Mock(return_value=historical))
    for name, mock in mocks.items():
        monkeypatch.setattr(pipeline, name, mock)

    return {
        "paths": paths,
        "historical": historical,
        "live_data": live_data,
        "prepared": prepared,
        "mocks": mocks,
    }


def test_raise_phase_error_wraps_exception_with_phase_name():
    error = ValueError("bad input")

    with pytest.raises(
        pipeline.HousingStressPipelinePhaseError,
        match="Phase 3.*bad input",
    ) as exc_info:
        pipeline._raise_phase_error("Phase 3 — Build levels", error)

    assert exc_info.value.__cause__ is error


def test_build_housing_stress_dataset_runs_major_phases(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)

    result = pipeline.build_housing_stress_dataset()

    pd.testing.assert_frame_equal(result["dataset"], configured["prepared"])
    assert result["new_data"] is True
    assert result["row_count"] == len(configured["prepared"])
    assert result["output_path"] == configured["paths"]["current_data_path"]
    configured["mocks"]["acquire_with_fallback"].assert_called_once()
    configured["mocks"]["build_all_levels"].assert_called_once()
    configured["mocks"]["validate_cleaning_output"].assert_called_once()
    configured["mocks"]["combine_with_historical"].assert_called_once()
    configured["mocks"]["archive_and_save"].assert_called_once()


def test_pipeline_wraps_acquisition_failure_with_phase(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["resolve_latest_vintage"].side_effect = RuntimeError("Census unavailable")

    with pytest.raises(
        pipeline.HousingStressPipelinePhaseError,
        match="Phase 2.*Census unavailable",
    ):
        pipeline.build_housing_stress_dataset()


def test_pipeline_wraps_level_build_failure_with_phase(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["build_all_levels"].side_effect = ValueError("bad crosswalk")

    with pytest.raises(
        pipeline.HousingStressPipelinePhaseError,
        match="Phase 3.*bad crosswalk",
    ):
        pipeline.build_housing_stress_dataset()


def test_pipeline_cleaning_validation_failure_stops_at_phase_three(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["validate_cleaning_output"].return_value = (False, ["non-canonical tenure"])

    with pytest.raises(
        pipeline.HousingStressPipelinePhaseError,
        match="Phase 3.*non-canonical tenure",
    ):
        pipeline.build_housing_stress_dataset()

    configured["mocks"]["combine_with_historical"].assert_not_called()


def test_pipeline_final_validation_failure_stops_before_save(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["validate_housing_stress_dataset"].return_value = (False, ["duplicate contract key"])

    with pytest.raises(
        pipeline.HousingStressPipelinePhaseError,
        match="Phase 5.*duplicate contract key",
    ):
        pipeline.build_housing_stress_dataset()

    configured["mocks"]["archive_and_save"].assert_not_called()


def test_pipeline_degrades_to_contract_rows_without_building(monkeypatch, tmp_path):
    # A1: when live acquisition fails and the run falls back to last-saved contract
    # rows, Phase 3 bypasses the build entirely rather than crashing on a bad shape.
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["acquire_with_fallback"].return_value = AcquisitionResult(
        CONTRACT_ROWS, configured["historical"], True, False
    )

    result = pipeline.build_housing_stress_dataset()

    assert result["source_failed"] is True
    configured["mocks"]["build_all_levels"].assert_not_called()
    configured["mocks"]["validate_cleaning_output"].assert_not_called()


def test_pipeline_reports_used_manual_flag(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["acquire_with_fallback"].return_value = AcquisitionResult(
        CONTRACT_ROWS, configured["historical"], False, True
    )

    result = pipeline.build_housing_stress_dataset()

    # Surfaced under a key that matches run_records' FALLBACK_FLAG_PATTERN.
    assert result["source_used_manual"] is True


def test_pipeline_does_not_write_when_no_new_data(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path, new_data=False)

    result = pipeline.build_housing_stress_dataset()

    assert result["new_data"] is False
    assert result["output_path"] is None
    configured["mocks"]["archive_and_save"].assert_not_called()


def test_change_detection_compares_against_current_output_not_union(monkeypatch, tmp_path):
    # Regression: novelty must be measured against the on-disk current output, not
    # the seed+current union (which already contains the deep history) — otherwise
    # the first run after seeding no-ops and never materializes the full series.
    configured = _configure_success(monkeypatch, tmp_path)
    current_frame = _frame(number_30=20)
    union_frame = pd.concat([_frame(number_30=20), _frame(number_30=99)], ignore_index=True)
    monkeypatch.setattr(pipeline, "load_canonical_dataset", Mock(return_value=current_frame))
    monkeypatch.setattr(pipeline, "combine_history_sources", Mock(return_value=union_frame))

    pipeline.build_housing_stress_dataset()

    # detect_new_data's second argument is the current output, not the union.
    second_arg = configured["mocks"]["detect_new_data"].call_args.args[1]
    assert second_arg is current_frame
    assert second_arg is not union_frame


def test_pipeline_reports_and_builds_resolved_vintage(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["resolve_latest_vintage"].return_value = 2022

    result = pipeline.build_housing_stress_dataset()

    assert result["resolved_year"] == 2022
    assert configured["mocks"]["build_all_levels"].call_args.args[2] == 2022
