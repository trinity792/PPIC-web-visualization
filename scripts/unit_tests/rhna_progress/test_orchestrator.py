from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.orchestrators import rhna_progress_pipeline as pipeline
from scripts.unit_tests.rhna_progress.helpers import long_frame, schema_config, wide_income_frame


def _configure_success(
    monkeypatch,
    tmp_path,
    *,
    new_snapshot=True,
    source_failed=False,
    used_manual=False,
):
    paths = {
        "current_data_path": tmp_path / "RHNAProgress_Current.csv",
        "historical_data_path": tmp_path / "RHNAProgress_Historical.csv",
        "archive_directory": tmp_path / "archive",
        "download_directory": tmp_path / "raw",
        "manual_download_path": tmp_path / "raw" / "RHNAProgress_Downloaded.csv",
        "jurisdiction_crosswalk_path": tmp_path / "raw" / "jurisdiction_county_crosswalk.csv",
        "codebook_directory": tmp_path / "codebooks",
        "details_path": tmp_path / "details" / "RHNAInfo.json",
        "logs_directory": tmp_path / "logs",
    }
    raw_path = tmp_path / "rhna_progress_6.csv"
    raw_path.write_text("Jurisdiction\nALAMEDA\n")
    acquired = [
        {
            "cycle": 6,
            "path": raw_path,
            "last_modified": "2026-07-15T00:00:00",
            "source_last_updated": "2026-07-15T12:00:00",
        }
    ]
    normalized = wide_income_frame(Cycle=6)
    parsed = wide_income_frame(Cycle=6)
    long = long_frame()
    merged = long_frame()
    prepared = long_frame()
    existing = pd.DataFrame()
    seed = pd.DataFrame()
    crosswalk = pd.DataFrame({"Jurisdiction": ["Alameda"], "County": ["Alameda"]})

    mocks = {
        "get_paths": Mock(return_value=paths),
        "get_source_config": Mock(return_value={"package_id": "test"}),
        "get_schema_config": Mock(return_value=schema_config()),
        "get_california_geography": Mock(return_value={"region_names": {"Bay Area"}}),
        "load_canonical_dataset": Mock(return_value=existing),
        "load_historical_seed": Mock(return_value=seed),
        "load_jurisdiction_crosswalk": Mock(return_value=crosswalk),
        "acquire_with_fallback": Mock(return_value=(acquired, source_failed, used_manual)),
        "normalize_columns": Mock(return_value=normalized),
        "standardize_jurisdiction_names": Mock(return_value=normalized),
        "parse_planning_period": Mock(return_value=(parsed, pd.DataFrame())),
        "coerce_income_measures": Mock(return_value=parsed),
        "reshape_to_income_levels": Mock(return_value=long),
        "stamp_provenance": Mock(return_value=long),
        "classify_geographic_level": Mock(return_value=long),
        "assign_county_and_region": Mock(return_value=long),
        "derive_time_elapsed": Mock(return_value=long),
        "derive_pace_metrics": Mock(return_value=long),
        "derive_overall_progress": Mock(return_value=long),
        "mark_most_recent": Mock(return_value=long),
        "combine_snapshots": Mock(return_value=merged),
        "detect_new_snapshot": Mock(return_value=new_snapshot),
        "validate_cleaned": Mock(return_value=(True, [])),
        "validate_final": Mock(return_value=(True, [])),
        "finalize_dataset": Mock(return_value=prepared),
        "write_dataset": Mock(return_value=paths["current_data_path"] if new_snapshot else None),
    }

    monkeypatch.setattr(
        pipeline.pd,
        "read_csv",
        Mock(return_value=pd.DataFrame({"Jurisdiction": ["ALAMEDA"]})),
        raising=False,
    )
    for name, mock in mocks.items():
        monkeypatch.setattr(pipeline, name, mock, raising=False)

    return {
        "paths": paths,
        "acquired": acquired,
        "prepared": prepared,
        "mocks": mocks,
    }


def test_raise_phase_error_wraps_exception_with_phase_name():
    error = ValueError("bad input")

    with pytest.raises(
        pipeline.RHNAProgressPipelinePhaseError,
        match="Phase 3.*bad input",
    ) as exc_info:
        pipeline._raise_phase_error("Phase 3 - Cleaning", error)

    assert exc_info.value.__cause__ is error


def test_build_rhna_progress_dataset_runs_major_phases(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)

    result = pipeline.build_rhna_progress_dataset()

    pd.testing.assert_frame_equal(result["dataframe"], configured["prepared"])
    assert result["new_snapshot"] is True
    assert result["source_failed"] is False
    assert result["used_manual"] is False
    assert result["row_count"] == len(configured["prepared"])
    assert result["output_path"] == configured["paths"]["current_data_path"]
    configured["mocks"]["acquire_with_fallback"].assert_called_once()
    configured["mocks"]["normalize_columns"].assert_called_once()
    configured["mocks"]["derive_overall_progress"].assert_called_once()
    configured["mocks"]["combine_snapshots"].assert_called_once()
    configured["mocks"]["write_dataset"].assert_called_once()


def test_pipeline_reports_acquired_cycles(monkeypatch, tmp_path):
    _configure_success(monkeypatch, tmp_path)

    result = pipeline.build_rhna_progress_dataset()

    assert result["acquired_cycles"] == [6]


def test_pipeline_reports_fallback_flags(monkeypatch, tmp_path):
    _configure_success(
        monkeypatch,
        tmp_path,
        source_failed=True,
        used_manual=True,
    )

    result = pipeline.build_rhna_progress_dataset()

    assert result["source_failed"] is True
    assert result["used_manual"] is True


def test_pipeline_wraps_acquisition_failure_with_phase(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["acquire_with_fallback"].side_effect = RuntimeError("CKAN down")

    with pytest.raises(
        pipeline.RHNAProgressPipelinePhaseError,
        match="Phase 2.*CKAN down",
    ):
        pipeline.build_rhna_progress_dataset()


def test_pipeline_validation_failure_stops_before_write(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path)
    configured["mocks"]["validate_final"].return_value = (
        False,
        ["duplicate RHNA grain"],
    )

    with pytest.raises(
        pipeline.RHNAProgressPipelinePhaseError,
        match="Phase 5.*duplicate RHNA grain",
    ):
        pipeline.build_rhna_progress_dataset()

    configured["mocks"]["write_dataset"].assert_not_called()


def test_pipeline_does_not_write_when_no_new_snapshot(monkeypatch, tmp_path):
    configured = _configure_success(monkeypatch, tmp_path, new_snapshot=False)

    result = pipeline.build_rhna_progress_dataset()

    assert result["new_snapshot"] is False
    assert result["output_path"] is None
    configured["mocks"]["write_dataset"].assert_not_called()

