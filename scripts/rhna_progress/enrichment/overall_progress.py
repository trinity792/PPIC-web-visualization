"""
overall_progress.py — derives jurisdiction-level roll-ups (Tiers Met, Overall Progress/Category) and the Most Recent flag.

Data sources:
    - the long income-level frame with per-tier On Track Score

Outputs:
    - pandas.DataFrame — the frame with Tiers Met/With Goal, Overall Progress, Overall On
      Track Score, Overall Category, and Most Recent

Usage:
    Called by the RHNA Progress enrichment phase; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/enrichment/
"""

import numpy as np
import pandas as pd

from scripts.rhna_progress.enrichment.pace_metrics import bucket_pace_score

_JURISDICTION_KEYS = ["Jurisdiction", "Cycle", "Snapshot Date"]

"""
========================================================================================================================
Overall Roll-ups
========================================================================================================================
"""


def derive_overall_progress(df, schema_config):
    """
    Jurisdiction-level roll-ups from the four tier rows, broadcast to all rows. Tiers With Goal (RHNA > 0) and Tiers Met (Units >= RHNA); Overall Progress = mean over tiers-with-a-goal of min(Units / RHNA, 1.0) (non-compensatory completion); Overall
    On Track Score = the same capped mean of the tier On Track Scores (pace-adjusted); Overall Category via the four-quadrant rule ('Met' when every tier with a goal is met, 'Behind' past the deadline, else the pace bucket of Overall On Track Score,
    'No Allocation' when Tiers With Goal == 0).

    Test file: scripts/unit_tests/rhna_progress/enrichment/test_overall_progress.py
    """
    result = df.copy()
    tiers = schema_config["tier_income_levels"]
    thresholds = schema_config["status_thresholds"]
    labels = schema_config["status_labels"]

    for column in ("Tiers With Goal", "Tiers Met", "Overall Progress", "Overall On Track Score", "Overall Category"):
        if column not in result.columns:
            result[column] = pd.NA

    for _, group in result.groupby(_JURISDICTION_KEYS, sort=False, dropna=False):
        tier_rows = group[group["Income Level"].isin(tiers)]
        rhna = pd.to_numeric(tier_rows["RHNA"], errors="coerce")
        units = pd.to_numeric(tier_rows["Units"], errors="coerce")
        scores = pd.to_numeric(tier_rows["On Track Score"], errors="coerce")
        with_goal = rhna > 0

        tiers_with_goal = int(with_goal.sum())
        tiers_met = int(((units >= rhna) & with_goal).sum())

        if tiers_with_goal > 0:
            # Cap each tier at its goal before averaging so an overbuilt tier contributes
            # at most 1.0 and cannot offset a shortfall elsewhere (non-compensatory).
            completion = np.minimum((units[with_goal] / rhna[with_goal]).to_numpy(dtype=float), 1.0)
            overall_progress = float(np.mean(completion))
            capped_scores = np.minimum(scores[with_goal].fillna(0.0).to_numpy(dtype=float), 1.0)
            overall_on_track = float(np.mean(capped_scores))
        else:
            overall_progress = np.nan
            overall_on_track = np.nan

        snapshot = group["Snapshot Date"].iloc[0]
        deadline = group["Planning Period End"].iloc[0]
        if tiers_with_goal == 0:
            category = labels["no_allocation"]
        elif tiers_met == tiers_with_goal:
            category = labels["met"]
        elif (
            not pd.isna(snapshot)
            and not pd.isna(deadline)
            and pd.Timestamp(snapshot) > pd.Timestamp(deadline)
        ):
            category = labels["behind"]
        else:
            # Overall Category is pace-adjusted: its in-progress bucket keys off the
            # pace-adjusted Overall On Track Score, so it can read "On Track" while the
            # completion-based Overall Progress is still low early in a cycle (two lenses).
            category = bucket_pace_score(overall_on_track, thresholds, labels)

        result.loc[group.index, "Tiers With Goal"] = tiers_with_goal
        result.loc[group.index, "Tiers Met"] = tiers_met
        result.loc[group.index, "Overall Progress"] = overall_progress
        result.loc[group.index, "Overall On Track Score"] = overall_on_track
        result.loc[group.index, "Overall Category"] = category

    return result


def mark_most_recent(df):
    """Set Most Recent = True on all rows sharing the maximum Snapshot Date within each (Jurisdiction, Cycle); False otherwise. Test file: scripts/unit_tests/rhna_progress/enrichment/test_overall_progress.py"""
    result = df.copy()
    snapshot_ts = pd.to_datetime(result["Snapshot Date"])
    latest = snapshot_ts.groupby([result["Jurisdiction"], result["Cycle"]]).transform("max")
    result["Most Recent"] = (snapshot_ts == latest).to_numpy()
    return result
