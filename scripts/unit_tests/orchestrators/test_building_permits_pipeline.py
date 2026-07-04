from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.orchestrators import building_permits_pipeline as pipeline

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]


def _contract_frame():
    return pd.DataFrame(
        [
            {
                "Geographic Level": "Metro",
                "Location": "Bakersfield",
                "Date": "2026-05",
                "Total": 20,
                "1 Unit": 10,
                "2 Units": 2,
                "3 and 4 Units": 3,
                "5 Units or More": 5,
            },
            {
                "Geographic Level": "State",
                "Location": "California",
                "Date": "2026-05",
                "Total": 100,
                "1 Unit": 60,
                "2 Units": 5,
                "3 and 4 Units": 10,
                "5 Units or More": 25,
            },
        ],
        columns=CONTRACT_COLUMNS,
    )


def _clean_frame(location, date):
    return pd.DataFrame(
        [
            {
                "Location": location,
                "Date": date,
                "Total": 10,
                "1 Unit": 6,
                "2 Units": 1,
                "3 and 4 Units": 1,
                "5 Units or More": 2,
            }
        ]
    )


def _configure_success(
    monkeypatch,
    tmp_path,
    *,
    new_data=True,
    source_failed=False,
):
    paths = {
        "current_data_path": tmp_path / "BuildingPermits_Current.csv",
        "historical_data_path": tmp_path / "BuildingPermits_Current.csv",
        "archive_directory": tmp_path / "archive",
        "download_directory": tmp_path / "raw",
    }
    source_settings = {
        "request_headers": {"User-Agent": "test"},
        "timeout": 30,
        "max_month_lookback": 6,
    }
    schema_config = {
        "output_columns": list(CONTRACT_COLUMNS),
        "date_column": "Date",
        "final_validation_config": {
            "required_columns": list(CONTRACT_COLUMNS),
        },
    }
    geography = {
        "cbsa_metros": {"Bakersfield"},
        "metro_to_county_mapping": {"Bakersfield": ["Kern"]},
        "metro_to_region_mapping": {
            "Bakersfield": "South San Joaquin Valley"
        },
    }
    historical = pd.DataFrame(
        [
            {
                **_contract_frame().iloc[1].to_dict(),
                "Date": "2026-03",
            }
        ],
        columns=CONTRACT_COLUMNS,
    )
    cbsa_raw = {
        "2026-04": pd.DataFrame({"raw": ["cbsa-april"]}),
        "2026-05": pd.DataFrame({"raw": ["cbsa-may"]}),
    }
    state_raw = {
        "2026-04": pd.DataFrame({"raw": ["state-april"]}),
        "2026-05": pd.DataFrame({"raw": ["state-may"]}),
    }
    tagged = _contract_frame()
    merged = _contract_frame()
    prepared = _contract_frame()

    metro_clean_results = [
        _clean_frame("Bakersfield", "2026-04"),
        _clean_frame("Bakersfield", "2026-05"),
    ]
    state_clean_results = [
        _clean_frame("California", "2026-04"),
        _clean_frame("California", "2026-05"),
    ]
    mocks = {
        "latest_stored_month": Mock(return_value="2026-03"),
        "resolve_latest_month": Mock(return_value=(2026, 5)),
        "months_to_acquire": Mock(
            return_value=[(2026, 4), (2026, 5)]
        ),
        "acquire_months": Mock(
            return_value=(cbsa_raw, state_raw, source_failed)
        ),
        "clean_metro_permits": Mock(side_effect=metro_clean_results),
        "clean_state_permits": Mock(side_effect=state_clean_results),
        "validate_metro_names": Mock(side_effect=lambda frame, _: frame),
        "tag_geographic_levels": Mock(return_value=tagged),
        "combine_with_historical": Mock(return_value=merged),
        "detect_new_data": Mock(return_value=new_data),
        "prepare_output": Mock(return_value=prepared),
        "validate_building_permits_dataset": Mock(
            return_value=(True, [])
        ),
        "archive_and_save": Mock(return_value=paths["current_data_path"]),
    }

    monkeypatch.setattr(pipeline, "get_paths", Mock(return_value=paths))
    monkeypatch.setattr(
        pipeline,
        "get_source_settings",
        Mock(return_value=source_settings),
    )
    monkeypatch.setattr(
        pipeline,
        "get_schema_config",
        Mock(return_value=schema_config),
    )
    monkeypatch.setattr(
        pipeline,
        "get_california_geography",
        Mock(return_value=geography),
    )
    monkeypatch.setattr(
        pipeline,
        "load_canonical_dataset",
        Mock(return_value=historical),
    )
    for name, mock in mocks.items():
        monkeypatch.setattr(pipeline, name, mock)

    return {
        "paths": paths,
        "historical": historical,
        "prepared": prepared,
        "mocks": mocks,
    }


def test_raise_phase_error_wraps_exception_with_phase_name():
    error = ValueError("bad input")

    with pytest.raises(
        pipeline.BuildingPermitsPipelinePhaseError,
        match="Phase 3.*bad input",
    ) as exc_info:
        pipeline._raise_phase_error("Phase 3 — Clean & Tag", error)

    assert exc_info.value.__cause__ is error


def test_build_building_permits_dataset_runs_major_phases(
    monkeypatch,
    tmp_path,
):
    configured = _configure_success(monkeypatch, tmp_path)

    result = pipeline.build_building_permits_dataset()

    pd.testing.assert_frame_equal(result["dataset"], configured["prepared"])
    assert result["new_data"] is True
    assert result["source_failed"] is False
    assert result["row_count"] == len(configured["prepared"])
    assert result["output_path"] == configured["paths"]["current_data_path"]
    assert configured["mocks"]["clean_metro_permits"].call_count == 2
    assert configured["mocks"]["clean_state_permits"].call_count == 2
    configured["mocks"]["tag_geographic_levels"].assert_called_once()
    configured["mocks"]["combine_with_historical"].assert_called_once()
    configured["mocks"]["archive_and_save"].assert_called_once()


def test_pipeline_reports_acquired_months_as_contract_strings(
    monkeypatch,
    tmp_path,
):
    _configure_success(monkeypatch, tmp_path)

    result = pipeline.build_building_permits_dataset()

    assert result["acquired_months"] == ["2026-04", "2026-05"]


def test_pipeline_result_contains_state_and_metro_levels(
    monkeypatch,
    tmp_path,
):
    _configure_success(monkeypatch, tmp_path)

    result = pipeline.build_building_permits_dataset()

    assert set(result["dataset"]["Geographic Level"]) == {"State", "Metro"}


def test_pipeline_wraps_acquisition_failure_with_phase(
    monkeypatch,
    tmp_path,
):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["resolve_latest_month"].side_effect = RuntimeError(
        "Census unavailable"
    )

    with pytest.raises(
        pipeline.BuildingPermitsPipelinePhaseError,
        match="Phase 2.*Census unavailable",
    ):
        pipeline.build_building_permits_dataset()


def test_pipeline_wraps_cleaning_failure_with_phase(
    monkeypatch,
    tmp_path,
):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["clean_metro_permits"].side_effect = ValueError(
        "bad CBSA workbook"
    )

    with pytest.raises(
        pipeline.BuildingPermitsPipelinePhaseError,
        match="Phase 3.*bad CBSA workbook",
    ):
        pipeline.build_building_permits_dataset()


def test_pipeline_wraps_merge_failure_with_phase(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["combine_with_historical"].side_effect = ValueError(
        "month overlap failed"
    )

    with pytest.raises(
        pipeline.BuildingPermitsPipelinePhaseError,
        match="Phase 4.*month overlap failed",
    ):
        pipeline.build_building_permits_dataset()


def test_pipeline_validation_failure_stops_before_save(
    monkeypatch,
    tmp_path,
):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"][
        "validate_building_permits_dataset"
    ].return_value = (False, ["duplicate contract key"])

    with pytest.raises(
        pipeline.BuildingPermitsPipelinePhaseError,
        match="Phase 5.*duplicate contract key",
    ):
        pipeline.build_building_permits_dataset()

    configured["mocks"]["archive_and_save"].assert_not_called()


def test_pipeline_reports_source_failed_fallback(monkeypatch, tmp_path):
    _configure_success(
        monkeypatch,
        tmp_path,
        source_failed=True,
    )

    result = pipeline.build_building_permits_dataset()

    assert result["source_failed"] is True


def test_pipeline_does_not_write_when_no_new_data(monkeypatch, tmp_path):
    configured = _configure_success(
        monkeypatch,
        tmp_path,
        new_data=False,
    )

    result = pipeline.build_building_permits_dataset()

    assert result["new_data"] is False
    assert result["output_path"] is None
    configured["mocks"]["archive_and_save"].assert_not_called()
