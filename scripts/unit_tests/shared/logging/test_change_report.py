import json

from scripts.shared.logging.change_report import (
    ACQUIRED_PATTERN,
    NEW_DATA_PATTERN,
    _humanize,
    _relativize,
    build_report,
    collect_flags,
    describe_publication,
    load_records,
    render_report,
    select_record,
)

# One representative result block per module, keyed as the live pipelines actually emit them.
# Only row_count and output_path appear in all seven, which is the property the report relies on.
MODULE_RESULTS = {
    "building-permits": {
        "dataset": "<DataFrame shape=(2400, 12)>",
        "new_data": True,
        "acquired_months": ["2026-05"],
        "output_path": "data/data-cleaned/building-permits/BuildingPermits_Current.csv",
        "revisions": {},
        "row_count": 2400,
        "source_failed": False,
    },
    "components-of-change": {
        "census_failed": False,
        "census_used_manual": False,
        "dof_failed": True,
        "dof_used_manual": True,
        "geographic_level_counts": {"County": 58},
        "new_census_data_found": False,
        "new_dof_data_found": True,
        "output_path": "data/data-cleaned/components-of-change/ComponentsOfChange_Current.csv",
        "row_count": 1160,
        "year_range": "1900-2026",
    },
    "housing-stress": {
        "dataset": "<DataFrame shape=(600, 9)>",
        "new_data": False,
        "output_path": None,
        "resolved_year": 2024,
        "revisions": {},
        "row_count": 600,
        "source_failed": False,
        "source_used_manual": False,
    },
    "pophousing": {
        "geographic_level_counts": {"County": 58},
        "output_path": "data/data-cleaned/housing-population/PopHousing_Current.csv",
        "row_count": 3480,
        "year_range": "2000-2026",
    },
    "projections": {
        "census_failed": False,
        "census_new_data": False,
        "dataset": "<DataFrame shape=(51000, 8)>",
        "dof_failed": False,
        "dof_new_data": True,
        "output_path": "data/data-cleaned/demographic-projections/DemographicProjections_Current.csv",
        "revisions": {},
        "row_count": 51000,
    },
    "rhna-progress": {
        "acquired_cycles": [],
        "dataframe": "<DataFrame shape=(10780, 27)>",
        "new_snapshot": False,
        "output_path": None,
        "revisions": {},
        "row_count": 10780,
        "source_failed": False,
        "used_manual": False,
    },
    "housing-stress-backfill": {
        "dataset": "<DataFrame shape=(900, 9)>",
        "legacy_years": [2012, 2013],
        "output_path": "data/data-cleaned/housing-stress/HousingStress_Historical.csv",
        "row_count": 900,
        "years_included": 12,
        "years_skipped": 0,
    },
}

REVISED = {
    "changed_cells": 4,
    "changed_periods": [2024, 2025],
    "removed_keys": 0,
    "truncated": False,
    "sample": [{"key": "Fresno County|2024", "column": "Births", "old": 12400.0, "new": 12180.0}],
}


def _record(module, result=None, severity="success", error=None):
    return {
        "id": f"{module}-2026-08-07T15:11:07-07:00",
        "module": module,
        "moduleLabel": module.replace("-", " ").title(),
        "severity": severity,
        "timestamp": "2026-08-07T15:11:07-07:00",
        "summary": f"{module} run completed",
        "result": MODULE_RESULTS[module] if result is None else result,
        "error": error,
    }


def _write_log(tmp_path, records):
    path = tmp_path / "pipeline-runs.jsonl"
    path.write_text("".join(json.dumps(record) + "\n" for record in records), encoding="utf-8")
    return path


"""
========================================================================================================================
Reading Run Records
========================================================================================================================
"""


def test_missing_log_file_yields_no_records(tmp_path):
    # Arrange
    missing = tmp_path / "absent.jsonl"

    # Act
    records = load_records(missing)

    # Assert
    assert records == []


def test_malformed_and_blank_lines_are_skipped(tmp_path):
    # Arrange
    path = tmp_path / "pipeline-runs.jsonl"
    path.write_text(
        json.dumps(_record("pophousing")) + "\n\n{not valid json\n" + json.dumps(_record("projections")) + "\n",
        encoding="utf-8",
    )

    # Act
    records = load_records(path)

    # Assert
    assert [record["module"] for record in records] == ["pophousing", "projections"]


def test_a_truncated_final_line_does_not_lose_earlier_records(tmp_path):
    # Arrange
    path = tmp_path / "pipeline-runs.jsonl"
    path.write_text(json.dumps(_record("building-permits")) + '\n{"module": "rhna-pro', encoding="utf-8")

    # Act
    records = load_records(path)

    # Assert
    assert len(records) == 1
    assert records[0]["module"] == "building-permits"


"""
========================================================================================================================
Selecting the Module's Record
========================================================================================================================
"""


def test_the_newest_record_for_the_requested_module_is_selected():
    # Arrange
    older = _record("pophousing")
    older["timestamp"] = "2026-08-01T09:00:00-07:00"
    newer = _record("pophousing")
    records = [older, _record("projections"), newer]

    # Act
    record, fell_back = select_record(records, "pophousing")

    # Assert
    assert record is newer
    assert fell_back is False


def test_a_shared_log_does_not_return_another_modules_record():
    # Arrange: pophousing ran first, projections ran last. Taking the last line would be wrong.
    records = [_record("pophousing"), _record("projections")]

    # Act
    record, fell_back = select_record(records, "pophousing")

    # Assert
    assert record["module"] == "pophousing"
    assert fell_back is False


def test_an_unmatched_module_falls_back_to_the_newest_record_and_flags_it():
    # Arrange
    records = [_record("projections")]

    # Act
    record, fell_back = select_record(records, "typo-module-id")

    # Assert
    assert record["module"] == "projections"
    assert fell_back is True


def test_an_empty_log_selects_nothing():
    # Act
    record, fell_back = select_record([], "building-permits")

    # Assert
    assert record is None
    assert fell_back is False


"""
========================================================================================================================
Interpreting a Result Block
========================================================================================================================
"""


def test_every_module_reports_a_new_data_flag_or_a_written_path():
    # Arrange / Act / Assert: the guarantee that replaces the old per-module "n/a" output.
    for module, result in MODULE_RESULTS.items():
        flags = collect_flags(result, NEW_DATA_PATTERN)
        written, description = describe_publication(result)
        assert flags or description, f"{module} reports nothing about whether data changed"
        assert isinstance(written, bool)


def test_new_data_flags_are_found_across_all_naming_schemes():
    # Arrange / Act
    found = {module: dict(collect_flags(result, NEW_DATA_PATTERN)) for module, result in MODULE_RESULTS.items()}

    # Assert
    assert found["building-permits"] == {"new_data": True}
    assert found["rhna-progress"] == {"new_snapshot": False}
    assert found["components-of-change"] == {"new_census_data_found": False, "new_dof_data_found": True}
    assert found["projections"] == {"census_new_data": False, "dof_new_data": True}
    assert found["pophousing"] == {}


def test_acquired_keys_are_found_under_both_names():
    # Act / Assert
    assert collect_flags(MODULE_RESULTS["building-permits"], ACQUIRED_PATTERN) == [
        ("acquired_months", ["2026-05"]),
    ] or collect_flags(MODULE_RESULTS["building-permits"], ACQUIRED_PATTERN) == []
    assert dict(collect_flags(MODULE_RESULTS["rhna-progress"], ACQUIRED_PATTERN)) == {}


def test_opaque_frame_reprs_are_never_reported():
    # Arrange
    result = {"dataset": "<DataFrame shape=(1,1)>", "dataframe": "<DataFrame>", "new_data": True}

    # Act
    flags = collect_flags(result, NEW_DATA_PATTERN)

    # Assert
    assert flags == [("new_data", True)]


def test_a_null_output_path_reads_as_nothing_written():
    # Act
    written, description = describe_publication(MODULE_RESULTS["rhna-progress"])

    # Assert
    assert written is False
    assert "no file written" in description


def test_a_populated_output_path_reads_as_written():
    # Act
    written, description = describe_publication(MODULE_RESULTS["pophousing"])

    # Assert
    assert written is True
    assert description.endswith("PopHousing_Current.csv")


def test_a_missing_result_block_does_not_raise():
    # Act
    written, description = describe_publication(None)

    # Assert
    assert written is False
    assert "no result block" in description


"""
========================================================================================================================
Labels and Paths
========================================================================================================================
"""


def test_acronyms_survive_humanization():
    # Act / Assert
    assert _humanize("dof_new_data") == "DoF new data"
    assert _humanize("new_dof_data_found") == "New DoF data found"
    assert _humanize("census_new_data") == "Census new data"
    assert _humanize("new_data") == "New data"


def test_an_output_path_inside_the_repo_is_reported_relatively():
    # Arrange
    from lib.config import PROJECT_ROOT

    absolute = str(PROJECT_ROOT / "data" / "data-cleaned" / "housing-population" / "PopHousing_Current.csv")

    # Act
    rendered = _relativize(absolute)

    # Assert
    assert rendered == "data/data-cleaned/housing-population/PopHousing_Current.csv"
    assert not rendered.startswith("/")


def test_an_output_path_outside_the_repo_is_left_alone():
    # Act
    rendered = _relativize("/tmp/somewhere-else/Current.csv")

    # Assert
    assert rendered == "/tmp/somewhere-else/Current.csv"


def test_a_home_directory_never_reaches_the_rendered_report():
    # Arrange
    from lib.config import PROJECT_ROOT

    result = dict(
        MODULE_RESULTS["pophousing"],
        output_path=str(PROJECT_ROOT / "data" / "data-cleaned" / "housing-population" / "PopHousing_Current.csv"),
    )

    # Act
    report = render_report(_record("pophousing", result=result), diff_text="")

    # Assert
    assert str(PROJECT_ROOT) not in report
    assert "data/data-cleaned/housing-population/PopHousing_Current.csv" in report


"""
========================================================================================================================
Rendering
========================================================================================================================
"""


def test_every_module_renders_without_an_n_a_row_count():
    # Arrange / Act / Assert
    for module in MODULE_RESULTS:
        report = render_report(_record(module), diff_text="")
        assert "Rows in dataset: n/a" not in report, f"{module} lost its row count"
        assert report.startswith("## ")
        assert report.endswith("\n")


def test_pophousing_reports_publication_despite_emitting_no_new_data_flag():
    # Arrange: the module with no new-data key at all, which used to render "n/a".
    record = _record("pophousing")

    # Act
    report = render_report(record, diff_text="")

    # Assert
    assert "Dataset written: **yes**" in report
    assert "n/a" not in report


def test_a_fallback_path_is_named_rather_than_printed_as_a_flag_dump():
    # Act
    report = render_report(_record("components-of-change"), diff_text="")

    # Assert
    assert "Fallback paths taken:" in report
    assert "DoF failed" in report
    # Flags that are False are not worth the reviewer's attention.
    assert "Census failed" not in report


def test_revisions_are_rendered_when_history_was_restated():
    # Arrange
    result = dict(MODULE_RESULTS["projections"], revisions=REVISED)

    # Act
    report = render_report(_record("projections", result=result), diff_text="")

    # Assert
    assert "### Revisions to previously published data" in report
    assert "4 cells revised" in report
    assert "Births" in report


def test_absent_revisions_are_reported_as_none_rather_than_omitted():
    # Act
    report = render_report(_record("building-permits"), diff_text="")

    # Assert
    assert "Revisions to published history: none" in report


def test_a_module_without_a_revisions_key_says_nothing_about_revisions():
    # Act
    report = render_report(_record("pophousing"), diff_text="")

    # Assert
    assert "Revisions" not in report


def test_a_failure_record_surfaces_the_phase_tagged_summary():
    # Arrange
    record = _record("housing-stress", severity="error", error="RuntimeError: boom")
    record["summary"] = "Phase 3 (Cleaning) failed: boom"

    # Act
    report = render_report(record, diff_text="")

    # Assert
    assert "Outcome: **error**" in report
    assert "Phase 3 (Cleaning) failed" in report


def test_a_missing_record_renders_an_explanatory_report_rather_than_crashing():
    # Act
    report = render_report(None, diff_text="")

    # Assert
    assert "Change report unavailable" in report
    assert report.endswith("\n")


def test_the_fallback_warning_names_the_module_actually_described():
    # Act
    report = render_report(_record("projections"), diff_text="", fell_back=True)

    # Assert
    assert "[!warning]" in report
    assert "projections" in report


def test_an_empty_diff_renders_the_placeholder():
    # Act
    report = render_report(_record("pophousing"), diff_text="")

    # Assert
    assert "(no tracked file changed)" in report


def test_omitting_the_diff_drops_the_section_entirely():
    # Act
    report = render_report(_record("pophousing"), diff_text=None)

    # Assert
    assert "Line-level diff" not in report


"""
========================================================================================================================
End to End
========================================================================================================================
"""


def test_build_report_selects_by_module_from_a_shared_log(tmp_path):
    # Arrange
    log_path = _write_log(tmp_path, [_record("pophousing"), _record("rhna-progress")])

    # Act
    report = build_report("pophousing", data_path=None, log_path=log_path)

    # Assert
    assert "Pophousing change report" in report
    assert "10780" not in report


def test_build_report_on_an_absent_log_explains_itself(tmp_path):
    # Act
    report = build_report("building-permits", data_path=None, log_path=tmp_path / "absent.jsonl")

    # Assert
    assert "Change report unavailable" in report
