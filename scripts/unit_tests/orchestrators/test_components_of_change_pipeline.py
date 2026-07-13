import pandas as pd
import pytest

from scripts.orchestrators import components_of_change_pipeline as pipeline

COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Total Population",
    "Percent Change in Population",
    "Numeric Change in Population",
    "Births",
    "Deaths",
    "Natural Increase",
    "Net Migration",
    "Net Foreign Immigration",
    "Net Domestic Migration",
    "Crude Birth Rate",
    "Crude Death Rate",
    "Crude Migration Rate",
    "Crude Domestic Migration Rate",
    "Crude Foreign Migration Rate",
    "Source",
]


def _frame(source, population=100):
    values = {
        "Geographic Level": "County",
        "Location": "Alameda",
        "Year": 2021,
        "Total Population": population,
        "Percent Change in Population": 1.0,
        "Numeric Change in Population": 1.0,
        "Births": 1,
        "Deaths": 1,
        "Natural Increase": 0,
        "Net Migration": 0,
        "Net Foreign Immigration": 0,
        "Net Domestic Migration": 0,
        "Crude Birth Rate": 1,
        "Crude Death Rate": 1,
        "Crude Migration Rate": 0,
        "Crude Domestic Migration Rate": 0,
        "Crude Foreign Migration Rate": 0,
        "Source": source,
    }
    return pd.DataFrame([{column: values[column] for column in COLUMNS}])


def _configure_success(monkeypatch, tmp_path):
    call_log = []
    paths = {"current_data_path": tmp_path / "current.csv", "archive_directory": tmp_path / "archive", "manual_dof_path": tmp_path / "manual_dof.csv", "manual_census_path": tmp_path / "manual_census.csv"}
    historical = pd.concat([_frame("DoF"), _frame("Census")], ignore_index=True)
    frames = {
        "historical": historical,
        "dof_raw": pd.DataFrame({"raw": ["dof"]}),
        "census_raw": pd.DataFrame({"raw": ["census"]}),
        "dof_clean": _frame("DoF"),
        "census_clean": _frame("Census"),
        "dof_full": _frame("DoF"),
        "census_full": _frame("Census"),
        "merged": historical.drop(columns=["Geographic Level"]),
        "finalized": historical,
    }

    def patch_call(name, result):
        def function(*args, **kwargs):
            call_log.append(name)
            return result

        monkeypatch.setattr(pipeline, name, function)

    monkeypatch.setattr(pipeline, "get_paths", lambda: paths)
    monkeypatch.setattr(pipeline, "get_source_settings", lambda: {"requests_headers": {}, "request_timeout_seconds": 60, "e6_sheet_index": 1, "dof_boundary_year": 1990, "census_boundary_year": 2010})
    monkeypatch.setattr(pipeline, "get_columns_config", lambda: {"output_columns": COLUMNS, "duplicate_key_columns": ["Location", "Year", "Source"]})
    monkeypatch.setattr(pipeline, "get_components_geography", lambda: {"state_abbreviations": {"CA"}, "region_names": set(), "county_names": {"Alameda"}})
    patch_call("load_canonical_dataset", frames["historical"])
    patch_call("get_e6_file_url", "https://example.com/e6.xlsx")
    patch_call("get_e6_file_url_positional", "https://example.com/e6.xlsx")
    patch_call("download_e6_workbook", frames["dof_raw"])
    patch_call("discover_census_components", ("https://example.com/census.csv", None))
    patch_call("download_census_components", frames["census_raw"])
    patch_call("clean_e6", frames["dof_clean"])
    patch_call("clean_census_components", frames["census_clean"])
    patch_call("combine_source_with_historical", frames["dof_full"])
    patch_call("merge_dof_and_census", frames["merged"])
    patch_call("assign_geographic_level", frames["finalized"])
    patch_call("prepare_components_output", frames["finalized"])
    patch_call("archive_and_save", paths["current_data_path"])
    monkeypatch.setattr(pipeline, "detect_new_source_data", lambda *args, **kwargs: False)
    monkeypatch.setattr(pipeline, "validate_components_dataset", lambda *args, **kwargs: (True, [], []))
    return call_log, frames


def test_components_pipeline_calls_major_phases(monkeypatch, tmp_path):
    call_log, _ = _configure_success(monkeypatch, tmp_path)

    result = pipeline.build_components_dataset()

    assert "download_e6_workbook" in call_log
    assert "download_census_components" in call_log
    assert "clean_e6" in call_log
    assert "clean_census_components" in call_log
    assert result["row_count"] == 2


def test_components_pipeline_does_not_save_when_no_new_data(monkeypatch, tmp_path):
    call_log, _ = _configure_success(monkeypatch, tmp_path)

    pipeline.build_components_dataset()

    assert "archive_and_save" not in call_log


def test_components_pipeline_saves_when_new_data_exists(monkeypatch, tmp_path):
    call_log, _ = _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(pipeline, "detect_new_source_data", lambda *args, **kwargs: True)

    pipeline.build_components_dataset()

    assert "archive_and_save" in call_log


def test_components_pipeline_validation_failure_stops_before_save(monkeypatch, tmp_path):
    call_log, _ = _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(pipeline, "validate_components_dataset", lambda *args, **kwargs: (False, ["bad data"], []))

    with pytest.raises(RuntimeError, match="Phase 5.*bad data"):
        pipeline.build_components_dataset()

    assert "archive_and_save" not in call_log



def test_components_pipeline_cleaning_failure_uses_saved_source(monkeypatch, tmp_path):
    _, _ = _configure_success(monkeypatch, tmp_path)

    def fail_cleaning(*args, **kwargs):
        raise ValueError("bad workbook")

    monkeypatch.setattr(pipeline, "clean_e6", fail_cleaning)

    result = pipeline.build_components_dataset()

    assert result["dof_failed"] is True
