"""
change_report.py — renders the latest run record as a reviewer-facing Markdown change report.

Reads the JSONL run log written by run_records.py and renders the newest record for one module
as the Markdown that becomes a data-refresh pull request's body and the Actions job summary.
Written for the GitHub Actions workflow in
docs/PPIC Summer 2026/explainers/github-actions-workflow-reference.md, but runnable locally
against any run log.

The seven module pipelines do not share a `result` schema. Only `row_count` and `output_path`
appear in all of them, so those two carry the report's headline and the module-specific keys
are discovered by pattern rather than looked up in a per-module table. A module added later
therefore reports whatever it emits instead of silently rendering "n/a".

Data sources:
    - {logs_dir}/pipeline-runs.jsonl — one JSON record per run, appended by run_records.py
    - git diff --numstat -- {data_path} — line-level change against the published dataset

Outputs:
    - stdout — the Markdown report; the workflow tees it to a file and to $GITHUB_STEP_SUMMARY

Usage:
    python -m scripts.shared.logging.change_report --module building-permits --data-path data/data-cleaned/building-permits
    python -m scripts.shared.logging.change_report --module pophousing --data-path data/data-cleaned/housing-population
    python -m scripts.shared.logging.change_report --module projections --data-path data/data-cleaned/demographic-projections --no-diff
    python -m scripts.shared.logging.change_report --module housing-stress --data-path data/data-cleaned/housing-stress --log-path logs/sample-runs.jsonl

Test Folders:
    - scripts/unit_tests/shared/logging/
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from scripts.shared.logging.revision_diff import format_revision_summary, has_revisions
from scripts.shared.logging.run_records import DEFAULT_RUN_LOG_FILENAME, FALLBACK_FLAG_PATTERN

# Every "did the source publish something new" key across the seven modules: new_data and
# new_snapshot (building-permits, housing-stress, rhna-progress), new_census_data_found and
# new_dof_data_found (components-of-change), census_new_data and dof_new_data (projections).
NEW_DATA_PATTERN = re.compile(r"^new_|_new_data$")
# acquired_months (building-permits) and acquired_cycles (rhna-progress).
ACQUIRED_PATTERN = re.compile(r"^acquired_")
# Keys holding a frame repr or a bare dataset name rather than a reportable value.
OPAQUE_KEYS = frozenset({"dataset", "dataframe"})
# Acronyms that .capitalize() would otherwise flatten to "Dof", "Rhna", "Acs".
LABEL_OVERRIDES = {"dof": "DoF", "rhna": "RHNA", "acs": "ACS", "bps": "BPS", "e5": "E-5", "e8": "E-8"}

DEFAULT_LOG_PATH = Path("logs") / DEFAULT_RUN_LOG_FILENAME
NO_DIFF_MESSAGE = "(no tracked file changed)"


"""
========================================================================================================================
Reading Run Records
========================================================================================================================
"""


def load_records(log_path):
    """
    Read every well-formed JSON object from a JSONL run log.

    Malformed lines are skipped rather than raising, because this runs after a pipeline has
    already finished and a truncated final line must not cost the reviewer the whole report.

    Args:
        log_path: path to the JSONL run log. A missing file yields an empty list.

    Returns:
        list[dict] — records in file order, oldest first.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    log_path = Path(log_path)
    if not log_path.is_file():
        return []

    records = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            records.append(parsed)
    return records


def select_record(records, module_id):
    """
    Return the newest record for one module, or the newest record overall when none matches.

    Selecting by module matters because pipeline-runs.jsonl is shared by all seven modules. On a
    GitHub-hosted runner the log starts empty and holds exactly one record, so taking the last
    line happens to work; locally it does not, and a report describing the wrong module is worse
    than no report. The fallback covers a module whose orchestrator writes a different id than
    the workflow passes, which would otherwise render an empty report with no explanation.

    Args:
        records: list of run-record dicts, oldest first.
        module_id: the value the orchestrator passes to execute_pipeline_run().

    Returns:
        tuple[dict | None, bool] — the record (None when records is empty), and whether it was
        chosen by the fallback rather than by matching module_id.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    if not records:
        return None, False

    for record in reversed(records):
        if record.get("module") == module_id:
            return record, False
    return records[-1], True


"""
========================================================================================================================
Interpreting a Result Block
========================================================================================================================
"""


def _is_reportable(key, value):
    """Report whether a result entry is a scalar worth printing verbatim. Test file: scripts/unit_tests/shared/logging/test_change_report.py"""
    return key not in OPAQUE_KEYS and isinstance(value, (bool, int, float, str))


def collect_flags(result, pattern):
    """
    Return the scalar entries of a result dict whose keys match a pattern, in sorted key order.

    Args:
        result: the run record's `result` block, or anything falsy.
        pattern: a compiled regex applied with .search() to each key.

    Returns:
        list[tuple[str, object]] — matching (key, value) pairs.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    if not isinstance(result, dict):
        return []
    return sorted(
        (key, value)
        for key, value in result.items()
        if pattern.search(str(key)) and _is_reportable(key, value)
    )


def _relativize(path_text):
    """
    Render an output path relative to the repository root when it sits inside it.

    Orchestrators record absolute paths, which would otherwise put a maintainer's home
    directory into every pull request body. A path outside the repository is returned unchanged
    rather than rewritten, because a surprising location is worth showing in full.

    Args:
        path_text: the recorded output path.

    Returns:
        str — a repository-relative path where possible, otherwise the original text.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    try:
        from lib.config import PROJECT_ROOT

        return str(Path(path_text).resolve().relative_to(PROJECT_ROOT))
    except (ImportError, ValueError, OSError):
        return str(path_text)


def describe_publication(result):
    """
    Describe whether the run wrote a new dataset, using the two keys every module emits.

    `output_path` is null whenever archive_and_save() declined to write, which is the one
    new-data signal shared by all seven modules. The per-module flags collected elsewhere say
    which source published; this says whether anything reached the published file.

    Args:
        result: the run record's `result` block, or anything falsy.

    Returns:
        tuple[bool, str] — whether a file was written, and the path or a short explanation.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    if not isinstance(result, dict):
        return False, "no result block in the run record"

    output_path = result.get("output_path")
    if output_path:
        return True, _relativize(output_path)
    return False, "no file written; the prepared data matched the published file byte for byte"


"""
========================================================================================================================
Rendering
========================================================================================================================
"""


def _format_value(value):
    """Render a scalar result value for Markdown. Test file: scripts/unit_tests/shared/logging/test_change_report.py"""
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)


def _humanize(key):
    """Turn a result key into a sentence-case label, preserving known acronyms. Test file: scripts/unit_tests/shared/logging/test_change_report.py"""
    words = [LABEL_OVERRIDES.get(word, word) for word in key.split("_")]
    if words and words[0] not in LABEL_OVERRIDES.values():
        words[0] = words[0].capitalize()
    return " ".join(words)


def render_report(record, diff_text=None, fell_back=False):
    """
    Render one run record as the Markdown a reviewer reads on the pull request.

    Args:
        record: a run-record dict, or None when the log held nothing.
        diff_text: output of `git diff --numstat`, or None to omit the diff section.
        fell_back: True when select_record could not match the requested module, which is
            surfaced in the report because it means the numbers may describe another module.

    Returns:
        str — Markdown, always ending in a newline.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    if not record:
        return (
            "## Change report unavailable\n\n"
            "No run record was found in the run log. The pipeline may have failed before "
            "writing one; check the step log above for the traceback.\n"
        )

    result = record.get("result") or {}
    label = record.get("moduleLabel") or record.get("module") or "Pipeline"
    written, publication = describe_publication(result)

    lines = [f"## {label} change report", ""]

    if fell_back:
        lines += [
            "> [!warning] No record matched the requested module id, so this describes the "
            f"most recent run instead (`{record.get('module', 'unknown')}`). Check that the "
            "workflow's `module_id` matches what the orchestrator passes to "
            "`execute_pipeline_run()`.",
            "",
        ]

    lines += [
        f"- Outcome: **{record.get('severity', 'unknown')}**",
        f"- Run finished: {record.get('timestamp', 'n/a')}",
        f"- Rows in dataset: {result.get('row_count', 'n/a')}",
        f"- Dataset written: **{'yes' if written else 'no'}** ({publication})",
    ]

    new_data_flags = collect_flags(result, NEW_DATA_PATTERN)
    if new_data_flags:
        lines.append("- New data reported by source:")
        lines += [f"    - {_humanize(key)}: {_format_value(value)}" for key, value in new_data_flags]

    acquired = collect_flags(result, ACQUIRED_PATTERN)
    lines += [f"- {_humanize(key)}: {_format_value(value)}" for key, value in acquired]

    fallbacks = [(key, value) for key, value in collect_flags(result, FALLBACK_FLAG_PATTERN) if value]
    if fallbacks:
        lines.append("- Fallback paths taken: " + ", ".join(_humanize(key) for key, _ in fallbacks))

    revisions = result.get("revisions")
    if has_revisions(revisions):
        # Restated history is the most review-relevant thing the record holds: a revision
        # changes numbers the site has already published, unlike an appended period.
        lines += ["", "### Revisions to previously published data", "", format_revision_summary(revisions)]
    elif isinstance(revisions, dict):
        lines.append("- Revisions to published history: none")

    if record.get("error"):
        lines += ["", f"> Failure: `{record.get('summary', 'no summary recorded')}`"]

    if diff_text is not None:
        lines += ["", "### Line-level diff", "", "```text", diff_text or NO_DIFF_MESSAGE, "```"]

    return "\n".join(lines) + "\n"


def read_data_diff(data_path):
    """
    Return `git diff --numstat` for one path, or an empty string when git is unavailable.

    Args:
        data_path: repository-relative directory to scope the diff to.

    Returns:
        str — the trimmed numstat output; empty when nothing changed or git could not run.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    try:
        completed = subprocess.run(
            ["git", "diff", "--numstat", "--", str(data_path)],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return ""
    return completed.stdout.strip()


"""
========================================================================================================================
Entry Point
========================================================================================================================
"""


def build_report(module_id, data_path=None, log_path=DEFAULT_LOG_PATH):
    """
    Load the run log, select the module's newest record, and render it.

    Args:
        module_id: the id the orchestrator passes to execute_pipeline_run().
        data_path: directory to scope the git diff to; None omits the diff section.
        log_path: path to the JSONL run log.

    Returns:
        str — the Markdown report.

    Test file: scripts/unit_tests/shared/logging/test_change_report.py
    """
    record, fell_back = select_record(load_records(log_path), module_id)
    diff_text = read_data_diff(data_path) if data_path else None
    return render_report(record, diff_text=diff_text, fell_back=fell_back)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Render the latest pipeline run record as Markdown")
    parser.add_argument("--module", required=True, help="Module id as written to the run record, e.g. pophousing")
    parser.add_argument("--data-path", default=None, help="Cleaned data directory to scope the git diff to")
    parser.add_argument("--no-diff", action="store_true", help="Omit the line-level diff section")
    parser.add_argument("--log-path", default=str(DEFAULT_LOG_PATH), help="Path to the JSONL run log")
    args = parser.parse_args()

    sys.stdout.write(
        build_report(
            args.module,
            data_path=None if args.no_diff else args.data_path,
            log_path=args.log_path,
        )
    )
