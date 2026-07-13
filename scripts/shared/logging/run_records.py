"""
run_records.py — builds and appends one structured JSONL record per pipeline run.

Data sources:
    - module metadata (id, label, phase count) — supplied by each orchestrator
    - a pipeline run function returning a summary dict, or raising a phase error

Outputs:
    - {logs_dir}/pipeline-runs.jsonl — one appended JSON record per run (the /logs contract)
    - dict — the run record, so callers can inspect what was written

Usage:
    python scripts/shared/logging/run_records.py

Test Folders:
    - scripts/unit_tests/shared/logging/
"""

import json
import re
import traceback
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from scripts.shared.logging.pipeline_logging import (
    close_logging,
    log_message,
    setup_logging,
)

PACIFIC = ZoneInfo("America/Los_Angeles")
DEFAULT_RUN_LOG_FILENAME = "pipeline-runs.jsonl"
PHASE_PATTERN = re.compile(r"Phase\s+(\d+)")
# Summary keys that mark a run as recovered (a fallback path was taken) rather than clean.
FALLBACK_FLAG_PATTERN = re.compile(r"(_failed|_used_manual|source_failed)$")

"""
========================================================================================================================
Run Records
========================================================================================================================
"""


def _now_pacific():
    """Return the current Pacific-time datetime. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    return datetime.now(PACIFIC)


def _has_fallback_flag(summary):
    """Report whether a summary dict carries a truthy recovery flag. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    if not isinstance(summary, dict):
        return False
    return any(
        FALLBACK_FLAG_PATTERN.search(str(key)) and value
        for key, value in summary.items()
    )


def _phase_from_message(message, phase_total):
    """Parse a 'Phase N' index and label out of an error message. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    match = PHASE_PATTERN.search(message or "")
    index = int(match.group(1)) if match else None
    name = f"Phase {index}" if index is not None else "Unknown phase"
    return {"index": index, "total": phase_total, "name": name}


def _error_details(error):
    """Extract type, message, traceback, and last-frame location from an exception. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    frames = traceback.extract_tb(error.__traceback__)
    last_frame = frames[-1] if frames else None
    return {
        "type": type(error).__name__,
        "message": str(error),
        "file": last_frame.filename if last_frame else None,
        "function": last_frame.name if last_frame else None,
        "line": last_frame.lineno if last_frame else None,
        "traceback": "".join(
            traceback.format_exception(type(error), error, error.__traceback__)
        ).strip(),
    }


def _fallback_flags(summary):
    """Collect the truthy recovery flags from a summary dict. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    if not isinstance(summary, dict):
        return {}
    return {
        str(key): _json_safe(value)
        for key, value in summary.items()
        if FALLBACK_FLAG_PATTERN.search(str(key))
    }


def build_run_record(
    module_id, module_label, phase_total, summary=None, error=None, started_at=None
):
    """Build a structured run record, deriving severity, timestamp, phase, and error detail. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    timestamp = (started_at or _now_pacific()).isoformat(timespec="seconds")

    if error is not None:
        severity = "error"
        message = str(error)
        phase = _phase_from_message(message, phase_total)
        error_details = _error_details(error)
        flags = {}
        result = None
    else:
        severity = "recovered" if _has_fallback_flag(summary) else "success"
        message = f"{module_label} run completed"
        phase = {"index": phase_total, "total": phase_total, "name": f"Phase {phase_total}"}
        error_details = None
        flags = _fallback_flags(summary)
        result = _serialize_summary(summary)

    return {
        "id": f"{module_id}-{timestamp}",
        "module": module_id,
        "moduleLabel": module_label,
        "severity": severity,
        "timestamp": timestamp,
        "phase": phase,
        "summary": message,
        "result": result,
        "flags": flags,
        "error": error_details,
    }


def _json_safe(value):
    """Return value unchanged if JSON-serializable, else a compact stand-in. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        shape = getattr(value, "shape", None)
        if shape is not None:
            return f"<{type(value).__name__} shape={tuple(shape)}>"
        return str(value)


def _serialize_summary(summary):
    """Coerce a summary dict into JSON-serializable values, summarizing frames and paths. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    if not isinstance(summary, dict):
        return None
    return {str(key): _json_safe(value) for key, value in summary.items()}


def append_run_record(record, logs_dir, filename=DEFAULT_RUN_LOG_FILENAME):
    """Append one run record as a JSON line to the run-log file. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    logs_dir = Path(logs_dir)
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / filename
    with log_path.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(record) + "\n")
    return log_path


def execute_pipeline_run(module_meta, run_fn, logs_dir):
    """Run a pipeline with logging, record the outcome as a run record, and re-raise on failure. Test file: scripts/unit_tests/shared/logging/test_run_records.py"""
    module_id = module_meta["module_id"]
    module_label = module_meta["module_label"]
    phase_total = module_meta["phase_total"]

    logger = setup_logging(module_id, logs_dir)
    started_at = _now_pacific()
    logger.info(f"{module_label} pipeline started")
    try:
        summary = run_fn(logger=logger)
    except Exception as error:
        logger.error(f"{module_label} pipeline failed: {error}")
        record = build_run_record(
            module_id, module_label, phase_total, error=error, started_at=started_at
        )
        append_run_record(record, logs_dir)
        close_logging(logger)
        raise

    log_message(logger, f"{module_label} pipeline finished")
    record = build_run_record(
        module_id, module_label, phase_total, summary=summary, started_at=started_at
    )
    append_run_record(record, logs_dir)
    close_logging(logger)
    return summary
