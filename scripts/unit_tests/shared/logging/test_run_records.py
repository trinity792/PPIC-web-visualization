import json

import pandas as pd

from scripts.shared.logging.run_records import (
    append_run_record,
    build_run_record,
    execute_pipeline_run,
)

MODULE_META = {"module_id": "demo", "module_label": "Demo Module", "phase_total": 5}


def test_build_run_record_success_severity():
    # Act
    record = build_run_record(
        "demo", "Demo Module", 5, summary={"row_count": 10, "year_range": (1991, 2025)}
    )

    # Assert
    assert record["severity"] == "success"
    assert record["error"] is None
    assert record["result"]["row_count"] == 10
    assert record["phase"] == {"index": 5, "total": 5, "name": "Phase 5"}


def test_build_run_record_recovered_when_fallback_flag_set():
    # Act
    record = build_run_record(
        "demo", "Demo Module", 5, summary={"row_count": 10, "source_failed": True}
    )

    # Assert
    assert record["severity"] == "recovered"
    assert record["flags"] == {"source_failed": True}


def test_build_run_record_success_when_fallback_flag_falsey():
    # Act
    record = build_run_record(
        "demo", "Demo Module", 5, summary={"row_count": 10, "dof_failed": False}
    )

    # Assert
    assert record["severity"] == "success"
    assert record["flags"] == {"dof_failed": False}


def test_build_run_record_error_extracts_phase_and_traceback():
    # Arrange
    try:
        raise ValueError("Phase 3 failed: something broke")
    except ValueError as error:
        # Act
        record = build_run_record("demo", "Demo Module", 5, error=error)

    # Assert
    assert record["severity"] == "error"
    assert record["phase"]["index"] == 3
    assert record["error"]["type"] == "ValueError"
    assert record["error"]["function"] == "test_build_run_record_error_extracts_phase_and_traceback"
    assert record["error"]["line"] is not None
    assert "Traceback" in record["error"]["traceback"]


def test_build_run_record_timestamp_carries_pacific_offset():
    # Act
    record = build_run_record("demo", "Demo Module", 5, summary={"row_count": 1})

    # Assert — Pacific offset is -07:00 (PDT) or -08:00 (PST)
    assert record["timestamp"].endswith(("-07:00", "-08:00"))
    assert record["id"].startswith("demo-")


def test_serialize_summary_summarizes_dataframe_and_path():
    # Arrange
    frame = pd.DataFrame({"a": [1, 2, 3]})

    # Act
    record = build_run_record(
        "demo", "Demo Module", 5, summary={"dataset": frame, "row_count": 3}
    )

    # Assert — the frame is summarized, not embedded, and stays JSON-serializable
    assert "shape=(3, 1)" in record["result"]["dataset"]
    json.dumps(record)


def test_append_run_record_writes_json_line(tmp_path):
    # Arrange
    record = build_run_record("demo", "Demo Module", 5, summary={"row_count": 2})

    # Act
    log_path = append_run_record(record, tmp_path / "nested")
    append_run_record(record, tmp_path / "nested")

    # Assert — directory created, two valid JSON lines appended
    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["module"] == "demo"


def test_execute_pipeline_run_writes_success_record_and_returns_summary(tmp_path):
    # Arrange
    def run_fn(logger=None):
        return {"row_count": 7}

    # Act
    summary = execute_pipeline_run(MODULE_META, run_fn, tmp_path)

    # Assert
    assert summary == {"row_count": 7}
    lines = (tmp_path / "pipeline-runs.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert json.loads(lines[-1])["severity"] == "success"


def test_execute_pipeline_run_records_error_and_reraises(tmp_path):
    # Arrange
    def run_fn(logger=None):
        raise ValueError("Phase 2 failed: down")

    # Act
    raised = False
    try:
        execute_pipeline_run(MODULE_META, run_fn, tmp_path)
    except ValueError:
        raised = True

    # Assert — error propagates and a record is still written
    assert raised
    record = json.loads(
        (tmp_path / "pipeline-runs.jsonl").read_text(encoding="utf-8").strip().splitlines()[-1]
    )
    assert record["severity"] == "error"
    assert record["phase"]["index"] == 2
