from pathlib import Path

import pandas as pd
import pytest

from scripts.orchestrators import pophousing_pipeline as pipeline
from scripts.pophousing.acquisition.dof_e5_downloader import E5DiscoveryError
from scripts.shared.archives.file_retention import archive_or_delete_files
from scripts.shared.downloads.http_downloads import HTTPDownloadError


def _configure_success(monkeypatch, tmp_path):
    call_log = []
    calls = {}
    frames = {
        name: pd.DataFrame(
            {
                "Location": ["Oakland"],
                "Geographic Level": ["City"],
                "Year": [2021],
                "Total Population": [440_000],
                "Vacancy Rate (%)": [5.0],
                "Source": ["E-5"],
            }
        )
        for name in (
            "raw",
            "modern",
            "historical",
            "filtered",
            "merged",
            "resolved",
            "regional",
            "enriched",
            "normalized",
            "leveled",
            "standardized",
            "sf",
            "finalized",
        )
    }
    paths = {
        "download_directory": tmp_path / "downloads",
        "archive_directory": tmp_path / "archive",
        "current_data_path": tmp_path / "current.csv",
        "historical_data_path": tmp_path / "historical.csv",
        "deletion_log_directory": tmp_path / "logs",
    }

    def patch_call(name, result):
        def function(*args, **kwargs):
            call_log.append(name)
            calls.setdefault(name, []).append((args, kwargs))
            return result

        monkeypatch.setattr(pipeline, name, function)

    monkeypatch.setattr(pipeline, "get_paths", lambda: paths)
    monkeypatch.setattr(
        pipeline,
        "get_source_settings",
        lambda: {
            "e5_cache_max_age_days": 60,
            "requests_headers": {},
            "request_timeout_seconds": 60,
            "e5_filename_pattern": r"E-5.*\.xlsx",
            "e5_fallback_max_age_days": 60,
        },
    )
    monkeypatch.setattr(
        pipeline,
        "get_schema_config",
        lambda: {
            "output_columns": frames["finalized"].columns.tolist(),
            "final_validation": {},
        },
    )
    monkeypatch.setattr(
        pipeline,
        "get_geography_config",
        lambda: {"regions_mapping": {}},
    )
    patch_call("cleanup_old_e5_files", [])
    patch_call("validate_historical_housing_data", (True, []))
    patch_call("get_e5_file_url", "https://example.com/E-5.xlsx")
    patch_call("download_e5_data", frames["raw"])
    patch_call("get_most_recent_e5_file", None)
    patch_call("clean_e5_data", frames["modern"])
    patch_call("load_historical_housing_data", frames["historical"])
    patch_call("filter_historical_years", frames["filtered"])
    patch_call("merge_historical_and_modern_data", frames["merged"])
    patch_call("resolve_source_overlap", frames["resolved"])
    patch_call("add_regional_data", frames["regional"])
    patch_call("add_state_data_for_missing_years", frames["enriched"])
    patch_call(
        "find_decimal_fraction_rates",
        pd.Series(False, index=frames["enriched"].index),
    )
    patch_call("normalize_decimal_fraction_rates", frames["normalized"])
    patch_call("validate_normalized_housing_rates", (True, []))
    patch_call("assign_missing_geographic_levels", frames["leveled"])
    patch_call("standardize_location_column", frames["standardized"])
    patch_call("standardize_san_francisco_classification", frames["sf"])
    patch_call("prepare_housing_output", frames["finalized"])
    patch_call("validate_final_housing_dataset", (True, []))
    patch_call("archive_or_delete_files", [])
    patch_call("write_housing_output", paths["current_data_path"])
    return call_log, calls, frames, paths


def test_pipeline_calls_phases_in_order(monkeypatch, tmp_path):
    call_log, _, _, _ = _configure_success(monkeypatch, tmp_path)

    pipeline.main()

    assert call_log == [
        "cleanup_old_e5_files",
        "validate_historical_housing_data",
        "get_e5_file_url",
        "download_e5_data",
        "clean_e5_data",
        "load_historical_housing_data",
        "filter_historical_years",
        "merge_historical_and_modern_data",
        "resolve_source_overlap",
        "add_regional_data",
        "add_state_data_for_missing_years",
        "find_decimal_fraction_rates",
        "normalize_decimal_fraction_rates",
        "validate_normalized_housing_rates",
        "assign_missing_geographic_levels",
        "standardize_location_column",
        "standardize_san_francisco_classification",
        "prepare_housing_output",
        "validate_final_housing_dataset",
        "write_housing_output",
    ]


def test_pipeline_passes_phase2_output_to_phase3(monkeypatch, tmp_path):
    _, calls, frames, _ = _configure_success(monkeypatch, tmp_path)

    pipeline.main()

    assert calls["clean_e5_data"][0][0][0] is frames["raw"]


def test_pipeline_passes_phase3_output_to_phase4(monkeypatch, tmp_path):
    _, calls, frames, _ = _configure_success(monkeypatch, tmp_path)

    pipeline.main()

    assert calls["merge_historical_and_modern_data"][0][0][1] is frames["modern"]


def test_pipeline_passes_phase4_output_to_phase5(monkeypatch, tmp_path):
    _, calls, frames, _ = _configure_success(monkeypatch, tmp_path)

    pipeline.main()

    assert calls["add_regional_data"][0][0][0] is frames["resolved"]


def test_pipeline_passes_phase5_output_to_phase6(monkeypatch, tmp_path):
    _, calls, frames, _ = _configure_success(monkeypatch, tmp_path)

    pipeline.main()

    assert calls["assign_missing_geographic_levels"][0][0][0] is frames[
        "normalized"
    ]


def test_pipeline_phase1_validation_failure_stops(monkeypatch, tmp_path):
    _, calls, _, _ = _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(
        pipeline,
        "validate_historical_housing_data",
        lambda *args, **kwargs: (False, ["bad history"]),
    )

    with pytest.raises(RuntimeError, match="Phase 1.*bad history"):
        pipeline.main()

    assert "get_e5_file_url" not in calls


def test_pipeline_phase2_download_failure_tries_fallback(monkeypatch, tmp_path):
    _, calls, frames, _ = _configure_success(monkeypatch, tmp_path)

    def fail_download(*args, **kwargs):
        raise HTTPDownloadError("network unavailable")

    monkeypatch.setattr(pipeline, "download_e5_data", fail_download)
    monkeypatch.setattr(
        pipeline,
        "get_most_recent_e5_file",
        lambda *args, **kwargs: frames["raw"],
    )

    pipeline.main()

    assert calls["clean_e5_data"][0][0][0] is frames["raw"]


def test_pipeline_phase2_total_failure_stops(monkeypatch, tmp_path):
    _, _, _, _ = _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(
        pipeline,
        "get_e5_file_url",
        lambda *args: (_ for _ in ()).throw(E5DiscoveryError("not found")),
    )

    with pytest.raises(RuntimeError, match="Phase 2.*No current E-5"):
        pipeline.main()


def test_pipeline_phase3_cleaning_failure_stops(monkeypatch, tmp_path):
    _, calls, _, _ = _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(
        pipeline,
        "clean_e5_data",
        lambda *args: (_ for _ in ()).throw(ValueError("bad workbook")),
    )

    with pytest.raises(RuntimeError, match="Phase 3.*bad workbook"):
        pipeline.main()

    assert "load_historical_housing_data" not in calls


def test_pipeline_phase5_validation_failure_stops(monkeypatch, tmp_path):
    _, calls, _, _ = _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(
        pipeline,
        "validate_normalized_housing_rates",
        lambda *args, **kwargs: (False, ["bad rates"]),
    )

    with pytest.raises(RuntimeError, match="Phase 5.*bad rates"):
        pipeline.main()

    assert "assign_missing_geographic_levels" not in calls


def test_pipeline_phase6_validation_failure_does_not_write(monkeypatch, tmp_path):
    _, calls, _, _ = _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(
        pipeline,
        "validate_final_housing_dataset",
        lambda *args, **kwargs: (False, ["invalid final data"]),
    )

    with pytest.raises(RuntimeError, match="Phase 6.*invalid final data"):
        pipeline.main()

    assert "write_housing_output" not in calls


def test_pipeline_phase6_archive_before_write(monkeypatch, tmp_path):
    call_log, _, _, paths = _configure_success(monkeypatch, tmp_path)
    paths["current_data_path"].write_text("old")

    pipeline.main()

    assert call_log.index("archive_or_delete_files") < call_log.index(
        "write_housing_output"
    )


def test_pipeline_success_returns_summary(monkeypatch, tmp_path):
    _, _, _, paths = _configure_success(monkeypatch, tmp_path)

    result = pipeline.main()

    assert result == {
        "output_path": paths["current_data_path"],
        "row_count": 1,
        "year_range": (2021, 2021),
        "geographic_level_counts": {"City": 1},
    }


def test_pipeline_does_not_prompt_for_input(monkeypatch, tmp_path):
    _configure_success(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "builtins.input",
        lambda *args: (_ for _ in ()).throw(RuntimeError("input called")),
    )

    pipeline.main()


def test_pipeline_no_orphaned_archive_on_write_failure(monkeypatch, tmp_path):
    _, _, _, paths = _configure_success(monkeypatch, tmp_path)
    paths["current_data_path"].write_text("old data")
    monkeypatch.setattr(pipeline, "archive_or_delete_files", archive_or_delete_files)
    monkeypatch.setattr(
        pipeline,
        "write_housing_output",
        lambda *args: (_ for _ in ()).throw(OSError("write failed")),
    )

    with pytest.raises(RuntimeError, match="Phase 6.*write failed"):
        pipeline.main()

    archived_files = list(Path(paths["archive_directory"]).iterdir())
    assert len(archived_files) == 1 and archived_files[0].read_text() == "old data"
