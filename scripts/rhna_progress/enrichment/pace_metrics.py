"""
pace_metrics.py — derives the per-row time, pace, and four-quadrant Status fields.

Data sources:
    - the long income-level frame with parsed dates and typed measures

Outputs:
    - pandas.DataFrame — the frame with Total/Elapsed Days, Percent Elapsed, Projected
      Units, On Track Score, and Status

Usage:
    Called by the RHNA Progress enrichment phase; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/enrichment/
"""

import pandas as pd

"""
========================================================================================================================
Status Classification (single owner)
========================================================================================================================
"""


def bucket_pace_score(score, thresholds, labels):
    """Bucket a pace score (>= 1.0 On Track, >= 0.70 Nearly, >= 0.50 Somewhat Off, else Far Off)."""
    if score is None or pd.isna(score):
        return labels["far_off_track"]
    if score >= thresholds["on_track"]:
        return labels["on_track"]
    if score >= thresholds["nearly_on_track"]:
        return labels["nearly_on_track"]
    if score >= thresholds["somewhat_off_track"]:
        return labels["somewhat_off_track"]
    return labels["far_off_track"]


def classify_status(units, rhna, snapshot_date, planning_end, on_track_score, thresholds, labels):
    """Apply the four-quadrant rule: No Allocation (RHNA 0) -> Met (Units >= RHNA, terminal) -> Behind (deadline passed) -> the pace bucket of On Track Score. Used identically by tier Status, Overall Category, and the final validator."""
    if pd.isna(rhna) or rhna == 0:
        return labels["no_allocation"]
    if not pd.isna(units) and units >= rhna:
        return labels["met"]
    if (
        not pd.isna(snapshot_date)
        and not pd.isna(planning_end)
        and pd.Timestamp(snapshot_date) > pd.Timestamp(planning_end)
    ):
        return labels["behind"]
    return bucket_pace_score(on_track_score, thresholds, labels)


"""
========================================================================================================================
Time Elapsed
========================================================================================================================
"""


def derive_time_elapsed(df):
    """
    Jurisdiction-level time fields, computed once and broadcast to all five income-level rows: Total Days (End - Start), Elapsed Days (Snapshot Date - Start), Percent Elapsed (kept at its true value, may exceed 1.0).

    Test file: scripts/unit_tests/rhna_progress/enrichment/test_pace_metrics.py
    """
    result = df.copy()
    start = pd.to_datetime(result["Planning Period Start"])
    end = pd.to_datetime(result["Planning Period End"])
    snapshot = pd.to_datetime(result["Snapshot Date"])

    total_days = (end - start).dt.days
    elapsed_days = (snapshot - start).dt.days
    result["Total Days"] = total_days.astype("Int64")
    result["Elapsed Days"] = elapsed_days.astype("Int64")
    result["Percent Elapsed"] = (elapsed_days / total_days).astype("Float64")
    return result


"""
========================================================================================================================
Pace Metrics
========================================================================================================================
"""


def derive_pace_metrics(df, schema_config):
    """
    Single owner of PPIC's per-level pace analysis, applied to every income-level row (tiers and Total). Projected Units = Units / min(Percent Elapsed, 1.0) (the clamp stops a closed period from projecting below actual); On Track Score = Projected
    Units / RHNA; Status via the four-quadrant rule (No Allocation if RHNA == 0; Met if Units >= RHNA; Behind if the deadline has passed; else the pace bucket of On Track Score using the schema_config thresholds). Null-safe: a zero/NaN denominator
    yields null Projected/Score, never a raise.

    Test file: scripts/unit_tests/rhna_progress/enrichment/test_pace_metrics.py
    """
    result = df.copy()
    thresholds = schema_config["status_thresholds"]
    labels = schema_config["status_labels"]

    units = pd.to_numeric(result["Units"], errors="coerce")
    rhna = pd.to_numeric(result["RHNA"], errors="coerce")
    percent_elapsed = pd.to_numeric(result["Percent Elapsed"], errors="coerce")
    # The clamp: a closed period (Percent Elapsed > 1) projects to its actual built count,
    # never below it, so On Track Score converges to Percent rather than shrinking.
    clamped = percent_elapsed.clip(upper=1.0)

    projected = pd.Series(pd.NA, index=result.index, dtype="Float64")
    valid_denominator = clamped > 0
    projected[valid_denominator] = (
        units[valid_denominator].astype("Float64") / clamped[valid_denominator].astype("Float64")
    )

    on_track = pd.Series(pd.NA, index=result.index, dtype="Float64")
    scoreable = valid_denominator & (rhna > 0)
    on_track[scoreable] = projected[scoreable] / rhna[scoreable].astype("Float64")

    result["Projected Units"] = projected
    result["On Track Score"] = on_track

    snapshot = pd.to_datetime(result["Snapshot Date"], errors="coerce")
    end = pd.to_datetime(result["Planning Period End"], errors="coerce")
    result["Status"] = [
        classify_status(u, r, snap, deadline, score, thresholds, labels)
        for u, r, snap, deadline, score in zip(units, rhna, snapshot, end, on_track)
    ]
    return result
