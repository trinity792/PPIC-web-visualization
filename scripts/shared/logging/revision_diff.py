"""
revision_diff.py — separates newly added periods from silently revised values between two dataset versions.

Every module replaces an overlapping period wholesale rather than upserting keys, so a
source that restates an already-published period overwrites the saved figures and the run
log records only "new data detected". This helper computes the difference the change
detectors throw away: which periods were added, which were revised, how many cells moved,
and a capped, magnitude-ranked sample of the individual old -> new value changes. The
result is a JSON-safe dict destined for a run record's `result.revisions` block.

Values are returned as Python scalars, never numpy types: run_records._json_safe falls back
to str(value) on anything json.dumps rejects, which would collapse the whole block into one
unparseable string.

Data sources:
    - pandas.DataFrame inputs — a freshly built frame and the saved frame it will replace

Outputs:
    - dict — added/changed/removed period lists, key and cell counts, and a ranked sample

Usage:
    python scripts/shared/logging/revision_diff.py

Test Folders:
    - scripts/unit_tests/shared/logging/
"""

import numpy as np
import pandas as pd

# ── Constants ─────────────────────────────────────────────────────────────────

# Freshly computed floats and the same values round-tripped through a CSV differ by ~1e-16
# ULP noise that never survives serialization; anything below this is not a revision.
DEFAULT_TOLERANCE = 1e-9

# Enough sample rows to see a pattern, small enough that a wholesale vintage restatement
# (Projections republishes 2020-2070 at once) cannot bloat the JSONL run log.
DEFAULT_SAMPLE_LIMIT = 20

KEY_SEPARATOR = "|"

# Beyond this many changed periods the log line names the span, not every period.
_MAX_PERIODS_IN_MESSAGE = 8

EMPTY_DIFF = {
    "added_periods": [],
    "changed_periods": [],
    "removed_periods": [],
    "added_keys": 0,
    "removed_keys": 0,
    "changed_cells": 0,
    "truncated": False,
    "sample": [],
}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _python_scalar(value):
    """Convert a numpy or pandas scalar to a JSON-serializable Python value. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    if value is None or (not isinstance(value, (list, tuple, dict)) and pd.isna(value)):
        return None
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    return value


def _period_scalar(value):
    """Render a period label without a spurious decimal, so a float Year reads as 2023. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    scalar = _python_scalar(value)
    if isinstance(scalar, float) and scalar.is_integer():
        return int(scalar)
    return scalar


def _key_part(series):
    """Stringify one key column, collapsing whole floats so a Year keys as "2023". Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    if pd.api.types.is_float_dtype(series):
        # Modules normalize Year to float64 for null-safe comparison; without this the
        # sample key would read "Fresno County|2023.0|DoF" instead of matching the contract.
        return series.map(lambda value: str(_period_scalar(value)) if pd.notna(value) else "")
    return series.astype(str)


def _key_series(dataframe, key_columns):
    """Join the key columns into one delimited string Series for keyed alignment. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    if dataframe.empty:
        return pd.Series(dtype="object")
    parts = [_key_part(dataframe[column]) for column in key_columns]
    joined = parts[0]
    for part in parts[1:]:
        joined = joined + KEY_SEPARATOR + part
    return joined


def _numeric(series):
    """Coerce a column to float, mapping booleans to 0/1. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    if pd.api.types.is_bool_dtype(series):
        # pd.to_numeric leaves a bool Series as bool, and numpy refuses to subtract those,
        # so bool contract columns (RHNA's Most Recent) must be cast before comparison.
        return series.astype("float64")
    coerced = pd.to_numeric(series, errors="coerce")
    if pd.api.types.is_bool_dtype(coerced):
        return coerced.astype("float64")
    return coerced


def _changed_mask(new_values, saved_values, tolerance):
    """Return a boolean mask of genuinely changed cells, treating null-on-both as equal. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    new_missing = new_values.isna()
    saved_missing = saved_values.isna()
    both_missing = new_missing & saved_missing
    one_missing = new_missing ^ saved_missing

    new_numeric = _numeric(new_values)
    saved_numeric = _numeric(saved_values)
    comparable = new_numeric.notna() & saved_numeric.notna()

    if comparable.any():
        # Numeric columns tolerate CSV round-trip noise; anything else compares as text so
        # a renamed label or a changed category still registers as a revision.
        numeric_changed = comparable & ((new_numeric - saved_numeric).abs() > tolerance)
    else:
        numeric_changed = pd.Series(False, index=new_values.index)

    text_changed = (~comparable) & (~both_missing) & (~one_missing) & (new_values.astype(str) != saved_values.astype(str))
    return (numeric_changed | text_changed | one_missing) & (~both_missing)


def _rank_scores(new_values, saved_values):
    """Score changed cells by relative magnitude so the biggest movers sort first. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    new_numeric = _numeric(new_values)
    saved_numeric = _numeric(saved_values)
    # max(|old|, 1) keeps a small county's 220-birth revision ahead of a rounding wobble in
    # a large one without dividing by zero on a 0 -> n change.
    denominator = saved_numeric.abs().clip(lower=1)
    scores = (new_numeric - saved_numeric).abs() / denominator
    # Non-numeric (text) changes have no magnitude; rank them last but keep them eligible.
    return scores.fillna(-1.0)


"""
========================================================================================================================
Revision Diff
========================================================================================================================
"""


def diff_revisions(
    new_df,
    saved_df,
    key_columns,
    period_column,
    value_columns=None,
    sample_limit=DEFAULT_SAMPLE_LIMIT,
    tolerance=DEFAULT_TOLERANCE,
):
    """
    Separate added periods from revised values between a new frame and the saved frame it replaces.

    Neither input is mutated. Keys present only in new_df count as additions, never as
    revisions, so a genuinely new period never inflates the revision counts. A cell null on
    both sides is not a change; numeric cells compare within tolerance and everything else
    compares as text.

    Args:
        new_df: the freshly built frame
        saved_df: the saved frame new_df will replace
        key_columns: contract grain identifying a row (e.g. ["Location", "Year", "Source"])
        period_column: the temporal column summarized into the period lists (e.g. "Year")
        value_columns: columns compared for revisions; defaults to every shared non-key column
        sample_limit: maximum individual cell changes reported in `sample`
        tolerance: absolute difference below which a numeric change is CSV round-trip noise

    Returns:
        A JSON-safe dict with added_periods, changed_periods, removed_periods, added_keys,
        removed_keys, changed_cells, truncated, and a magnitude-ranked sample of
        {key, column, old, new} records. Returns the zero-diff shape when nothing changed.

    Test file:
        scripts/unit_tests/shared/logging/test_revision_diff.py
    """
    diff = {key: (list(value) if isinstance(value, list) else value) for key, value in EMPTY_DIFF.items()}

    if new_df is None or saved_df is None:
        return diff
    if new_df.empty and saved_df.empty:
        return diff

    missing_keys = [column for column in key_columns if column not in new_df.columns or column not in saved_df.columns]
    if missing_keys and not (new_df.empty or saved_df.empty):
        raise KeyError(f"Cannot diff revisions; missing key columns: {missing_keys}")

    new_frame = new_df.copy()
    saved_frame = saved_df.copy()
    new_frame["__key__"] = _key_series(new_frame, key_columns) if not new_frame.empty else pd.Series(dtype="object")
    saved_frame["__key__"] = _key_series(saved_frame, key_columns) if not saved_frame.empty else pd.Series(dtype="object")

    # A duplicated key would fan out the join; keep the last, matching the merge helpers'
    # own duplicate healing rather than raising inside a logging path.
    new_frame = new_frame.drop_duplicates(subset="__key__", keep="last")
    saved_frame = saved_frame.drop_duplicates(subset="__key__", keep="last")

    new_keys = set(new_frame["__key__"])
    saved_keys = set(saved_frame["__key__"])
    added_keys = new_keys - saved_keys
    removed_keys = saved_keys - new_keys
    shared_keys = new_keys & saved_keys

    diff["added_keys"] = len(added_keys)
    diff["removed_keys"] = len(removed_keys)

    if period_column in new_frame.columns:
        added_periods = new_frame.loc[new_frame["__key__"].isin(added_keys), period_column]
        diff["added_periods"] = sorted({_period_scalar(value) for value in added_periods.dropna()})
    if period_column in saved_frame.columns:
        removed_periods = saved_frame.loc[saved_frame["__key__"].isin(removed_keys), period_column]
        diff["removed_periods"] = sorted({_period_scalar(value) for value in removed_periods.dropna()})

    if not shared_keys:
        return diff

    if value_columns is None:
        value_columns = [
            column
            for column in new_frame.columns
            if column not in key_columns and column != "__key__" and column in saved_frame.columns
        ]

    aligned_new = new_frame[new_frame["__key__"].isin(shared_keys)].set_index("__key__").sort_index()
    aligned_saved = saved_frame[saved_frame["__key__"].isin(shared_keys)].set_index("__key__").sort_index()

    changed_periods = set()
    candidates = []
    total_changed = 0

    for column in value_columns:
        if column not in aligned_new.columns or column not in aligned_saved.columns:
            continue
        new_values = aligned_new[column]
        saved_values = aligned_saved[column]
        mask = _changed_mask(new_values, saved_values, tolerance)
        changed_count = int(mask.sum())
        if not changed_count:
            continue
        total_changed += changed_count

        if period_column in aligned_new.columns:
            changed_periods.update(_period_scalar(value) for value in aligned_new.loc[mask, period_column].dropna())

        # nlargest over the changed cells only, so a 1.7M-row restatement never sorts every
        # cell just to surface the top handful.
        scores = _rank_scores(new_values[mask], saved_values[mask])
        top_keys = scores.nlargest(sample_limit).index
        for key in top_keys:
            candidates.append(
                {
                    "key": str(key),
                    "column": str(column),
                    "old": _python_scalar(saved_values.loc[key]),
                    "new": _python_scalar(new_values.loc[key]),
                    "__score__": float(scores.loc[key]),
                }
            )

    diff["changed_cells"] = total_changed
    diff["changed_periods"] = sorted(changed_periods, key=lambda value: (value is None, value))
    diff["truncated"] = total_changed > sample_limit

    candidates.sort(key=lambda record: record["__score__"], reverse=True)
    diff["sample"] = [
        {key: value for key, value in record.items() if key != "__score__"} for record in candidates[:sample_limit]
    ]
    return diff


def has_revisions(diff):
    """Report whether a diff describes any revised cells or removed keys. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    if not diff:
        return False
    return bool(diff.get("changed_cells") or diff.get("removed_keys"))


def format_revision_summary(diff, limit=3):
    """Render a diff as a one-line human log message, or None when nothing was revised. Test file: scripts/unit_tests/shared/logging/test_revision_diff.py"""
    if not has_revisions(diff):
        return None
    parts = [f"{diff.get('changed_cells', 0)} cells revised"]
    changed_periods = diff.get("changed_periods") or []
    if changed_periods:
        # A wholesale vintage restatement touches every year of the horizon; naming all 51
        # would bury the rest of the line, so summarize the span instead.
        if len(changed_periods) > _MAX_PERIODS_IN_MESSAGE:
            period_text = f"{changed_periods[0]}-{changed_periods[-1]} ({len(changed_periods)} periods)"
        else:
            period_text = ", ".join(str(period) for period in changed_periods)
        parts.append(f"periods {period_text}")
    if diff.get("removed_keys"):
        parts.append(f"{diff['removed_keys']} keys removed")
    message = "Revisions: " + "; ".join(parts)
    highlights = [
        f"{record['key']} {record['column']} {record['old']} -> {record['new']}"
        for record in (diff.get("sample") or [])[:limit]
    ]
    if highlights:
        message = f"{message} — " + "; ".join(highlights)
    return message
