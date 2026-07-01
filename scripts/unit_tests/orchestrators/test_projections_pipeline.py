from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.orchestrators import projections_pipeline as pipeline

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
    "Source",
]


def _frame(source="DoF P-3", population=100):
    is_census = source == "Census cc-est"
    return pd.DataFrame(
        [
            {
                "Geographic Level": "US State" if is_census else "County",
                "Location": "California" if is_census else "Alameda",
                "Year": 2025,
                "Age Group": "0-4",
                "Sex": "Female",
                "Race/Ethnicity": "White",
                "Population": population,
                "Source": source,
            }
        ],
        columns=CONTRACT_COLUMNS,
    )


def _configure_success(monkeypatch, tmp_path, changes=(True, True)):
    paths = {
        "current_data_path": tmp_path / "current.csv",
        "archive_directory": tmp_path / "archive",
        "manual_dof_path": tmp_path / "manual-dof.csv",
        "manual_census_path": tmp_path / "manual-census.csv",
    }
    historical = pd.concat(
        [_frame("DoF P-3"), _frame("Census cc-est")],
        ignore_index=True,
    )
    dof_clean = _frame("DoF P-3").drop(columns=["Source"])
    census_clean = _frame("Census cc-est").drop(columns=["Source"])
    finalized = historical.copy()
    call_log = []

    monkeypatch.setattr(pipeline, "get_paths", lambda: paths)
    monkeypatch.setattr(
        pipeline,
        "get_source_settings",
        lambda: {
            "dof_base_url": "https://dof.example/",
            "census_base_url": "https://census.example/",
            "request_headers": {},
            "timeout": 30,
            "p3_cache_max_age_days": 60,
            "ccest_cache_max_age_days": 60,
            "p3_expected_csv_columns": [],
            "ccest_expected_columns": [],
            "dof_boundary_year": 2020,
            "census_boundary_year": 2020,
        },
    )
    monkeypatch.setattr(
        pipeline,
        "get_schema_config",
        lambda: {"output_columns": CONTRACT_COLUMNS},
    )
    monkeypatch.setattr(
        pipeline,
        "load_canonical_dataset",
        Mock(return_value=historical),
    )
    monkeypatch.setattr(
        pipeline,
        "acquire_with_fallback",
        Mock(
            side_effect=[
                (pd.DataFrame({"raw": ["dof"]}), False, False),
                (pd.DataFrame({"raw": ["census"]}), False, False),
            ]
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "_clean_with_fallback",
        Mock(
            side_effect=[
                (dof_clean, False, False),
                (census_clean, False, False),
            ]
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "combine_source_with_historical",
        Mock(side_effect=[_frame("DoF P-3"), _frame("Census cc-est")]),
    )
    monkeypatch.setattr(
        pipeline,
        "merge_dof_and_census",
        Mock(return_value=historical),
    )
    monkeypatch.setattr(
        pipeline,
        "add_regional_data",
        Mock(return_value=historical),
    )
    monkeypatch.setattr(
        pipeline,
        "add_state_total",
        Mock(return_value=historical),
    )
    monkeypatch.setattr(
        pipeline,
        "build_precomputed_totals",
        Mock(return_value=historical),
    )
    monkeypatch.setattr(
        pipeline,
        "detect_new_source_data",
        Mock(side_effect=list(changes)),
    )
    monkeypatch.setattr(
        pipeline,
        "assign_geographic_level",
        Mock(return_value=finalized),
    )
    monkeypatch.setattr(
        pipeline,
        "prepare_projections_output",
        Mock(return_value=finalized),
    )
    monkeypatch.setattr(
        pipeline,
        "validate_projections_dataset",
        Mock(return_value=(True, [])),
    )

    def save(*args, **kwargs):
        call_log.append("archive_and_save")
        return paths["current_data_path"]

    monkeypatch.setattr(pipeline, "archive_and_save", save)
    return paths, finalized, call_log


def test_raise_phase_error_wraps_exception_with_phase_name():
    # Arrange
    error = ValueError("bad input")

    # Act / Assert
    with pytest.raises(
        pipeline.ProjectionsPipelinePhaseError,
        match="Phase 3.*bad input",
    ) as exc_info:
        pipeline._raise_phase_error("Phase 3", error)
    assert exc_info.value.__cause__ is error


def test_load_saved_source_filters_source_and_preserves_geographic_level(
    monkeypatch,
    tmp_path,
):
    # Arrange
    historical = pd.concat(
        [_frame("DoF P-3"), _frame("Census cc-est")],
        ignore_index=True,
    )
    monkeypatch.setattr(
        pipeline,
        "load_canonical_dataset",
        Mock(return_value=historical),
    )

    # Act
    result = pipeline._load_saved_source(
        {"current_data_path": tmp_path / "current.csv"},
        "DoF P-3",
    )

    # Assert
    assert set(result["Source"]) == {"DoF P-3"}
    assert set(result["Geographic Level"]) == {"County"}


def test_clean_with_fallback_returns_cleaned_live_data(tmp_path):
    # Arrange
    cleaned = _frame().drop(columns=["Source"])
    cleaner = Mock(return_value=cleaned)

    # Act
    result, cleaning_failed, used_manual = pipeline._clean_with_fallback(
        pd.DataFrame({"raw": [1]}),
        cleaner,
        {},
        "DoF P-3",
        {"current_data_path": tmp_path / "current.csv"},
        False,
        False,
        tmp_path / "manual.csv",
    )

    # Assert
    pd.testing.assert_frame_equal(result, cleaned)
    assert (cleaning_failed, used_manual) == (False, False)
    cleaner.assert_called_once()


def test_clean_with_fallback_preserves_acquisition_failure(tmp_path):
    # Arrange
    saved = _frame("DoF P-3")
    cleaner = Mock(side_effect=AssertionError("cleaner must not run"))

    # Act
    result, cleaning_failed, used_manual = pipeline._clean_with_fallback(
        saved,
        cleaner,
        {},
        "DoF P-3",
        {"current_data_path": tmp_path / "current.csv"},
        True,
        False,
        tmp_path / "manual.csv",
    )

    # Assert
    pd.testing.assert_frame_equal(result, saved)
    assert (cleaning_failed, used_manual) == (True, False)
    cleaner.assert_not_called()


def test_clean_with_fallback_uses_manual_file_after_live_cleaning_failure(
    tmp_path,
):
    # Arrange
    manual_path = tmp_path / "manual.csv"
    pd.DataFrame({"raw": ["manual"]}).to_csv(manual_path, index=False)
    cleaned = _frame().drop(columns=["Source"])
    cleaner = Mock(
        side_effect=[ValueError("bad live data"), cleaned]
    )

    # Act
    result, cleaning_failed, used_manual = pipeline._clean_with_fallback(
        pd.DataFrame({"raw": ["live"]}),
        cleaner,
        {},
        "DoF P-3",
        {"current_data_path": tmp_path / "current.csv"},
        False,
        False,
        manual_path,
    )

    # Assert
    pd.testing.assert_frame_equal(result, cleaned)
    assert (cleaning_failed, used_manual) == (False, True)
    assert cleaner.call_count == 2


def test_clean_with_fallback_uses_saved_rows_when_cleaning_fails(
    monkeypatch,
    tmp_path,
):
    # Arrange
    saved = _frame("DoF P-3")
    monkeypatch.setattr(
        pipeline,
        "_load_saved_source",
        Mock(return_value=saved),
    )
    cleaner = Mock(side_effect=ValueError("invalid source data"))

    # Act
    result, cleaning_failed, used_manual = pipeline._clean_with_fallback(
        pd.DataFrame({"raw": ["live"]}),
        cleaner,
        {},
        "DoF P-3",
        {"current_data_path": tmp_path / "current.csv"},
        False,
        False,
        tmp_path / "missing-manual.csv",
    )

    # Assert
    pd.testing.assert_frame_equal(result, saved)
    assert (cleaning_failed, used_manual) == (True, False)


def test_build_projections_dataset_runs_major_phases(monkeypatch, tmp_path):
    # Arrange
    _, finalized, call_log = _configure_success(monkeypatch, tmp_path)

    # Act
    result = pipeline.build_projections_dataset()

    # Assert
    pd.testing.assert_frame_equal(result["dataset"], finalized)
    assert result["row_count"] == len(finalized)
    assert call_log == ["archive_and_save"]


def test_build_projections_dataset_requires_state_total_phase(
    monkeypatch,
    tmp_path,
):
    # Arrange
    _configure_success(monkeypatch, tmp_path)

    # Act
    pipeline.build_projections_dataset()

    # Assert
    pipeline.add_state_total.assert_called_once()
    pipeline.add_regional_data.assert_called_once()


def test_build_projections_dataset_does_not_write_without_new_data(
    monkeypatch,
    tmp_path,
):
    # Arrange
    _configure_success(monkeypatch, tmp_path, changes=(False, False))
    archive = Mock()
    monkeypatch.setattr(pipeline, "archive_and_save", archive)

    # Act
    result = pipeline.build_projections_dataset()

    # Assert
    assert result["output_path"] is None
    archive.assert_not_called()


def test_build_projections_dataset_sets_dof_failed_flag(
    monkeypatch,
    tmp_path,
):
    # Arrange
    _configure_success(monkeypatch, tmp_path, changes=(False, True))
    dof_saved = _frame("DoF P-3")
    census_clean = _frame("Census cc-est").drop(columns=["Source"])
    pipeline._clean_with_fallback.side_effect = [
        (dof_saved, True, False),
        (census_clean, False, False),
    ]

    # Act
    result = pipeline.build_projections_dataset()

    # Assert
    assert result["dof_failed"] is True
    assert result["census_failed"] is False


def test_build_projections_dataset_sets_census_failed_flag(
    monkeypatch,
    tmp_path,
):
    # Arrange
    _configure_success(monkeypatch, tmp_path, changes=(True, False))
    dof_clean = _frame("DoF P-3").drop(columns=["Source"])
    census_saved = _frame("Census cc-est")
    pipeline._clean_with_fallback.side_effect = [
        (dof_clean, False, False),
        (census_saved, True, False),
    ]

    # Act
    result = pipeline.build_projections_dataset()

    # Assert
    assert result["dof_failed"] is False
    assert result["census_failed"] is True
