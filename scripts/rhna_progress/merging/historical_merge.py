"""
historical_merge.py — loads the canonical and seed datasets, unions snapshots, and detects a new snapshot.

Data sources:
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Current.csv — saved canonical snapshots
    - data/data-cleaned/RHNA-progress-report/RHNAProgress_Historical.csv — immutable seed

Outputs:
    - pandas.DataFrame — the accumulated snapshot series
    - bool — whether a new snapshot landed (gates the conditional write)

Usage:
    Called by the RHNA Progress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/merging/
"""

import warnings

import pandas as pd

from scripts.rhna_progress.config.schemas import get_schema_config
from scripts.rhna_progress.enrichment.overall_progress import mark_most_recent

"""
========================================================================================================================
Dataset Access
========================================================================================================================
"""


def load_canonical_dataset(paths):
    """Return the existing canonical CSV (empty frame + loud UserWarning when absent, so a cold start proceeds on live data). Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py"""
    path = paths["current_data_path"]
    columns = get_schema_config()["output_columns"]
    if not path.exists():
        warnings.warn(
            "No saved RHNA Progress canonical dataset found; proceeding on live data (cold start).",
            stacklevel=2,
        )
        return pd.DataFrame(columns=columns)
    return pd.read_csv(path)


def load_historical_seed(paths):
    """Read the immutable RHNAProgress_Historical.csv seed of pre-live snapshots (empty when absent). Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py"""
    path = paths["historical_data_path"]
    columns = get_schema_config()["output_columns"]
    if path is None or not path.exists():
        return pd.DataFrame(columns=columns)
    return pd.read_csv(path)


"""
========================================================================================================================
Snapshot Union and Change Detection
========================================================================================================================
"""


def combine_snapshots(existing, seed, new_snapshots):
    """
    Union the seed, the previously saved snapshots, and the newly captured ones; de-duplicate on (Jurisdiction, Cycle, Snapshot Date, Income Level), preferring the freshest capture; re-derive Most Recent.

    Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py
    """
    grain = get_schema_config()["grain_keys"]

    # Order matters: seed < existing < new, so keep="last" prefers the freshest capture on
    # any repeated grain key.
    frames = [frame.copy() for frame in (seed, existing, new_snapshots) if frame is not None and not frame.empty]
    if not frames:
        empty = new_snapshots if new_snapshots is not None else pd.DataFrame()
        return empty.copy()

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset=grain, keep="last")
    combined = combined.sort_values(grain, ignore_index=True)
    return mark_most_recent(combined)


def _canonical_string_frame(df, grain_keys):
    """Stringify a frame ordered by grain so comparison is insensitive to row order and dtype drift."""
    if df is None or df.empty:
        return ""
    frame = df.copy()
    sort_columns = [column for column in grain_keys if column in frame.columns]
    if sort_columns:
        frame = frame.sort_values(sort_columns)
    return frame.reset_index(drop=True).astype(str).to_csv(index=False)


def detect_new_snapshot(existing, combined, grain_keys):
    """
    Order/index-insensitive comparison that returns True only when combined introduces a new (Jurisdiction, Cycle, Snapshot Date, Income Level) row or a changed measure, gating the conditional write.

    Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py
    """
    if existing is None or existing.empty:
        return combined is not None and not combined.empty
    return _canonical_string_frame(existing, grain_keys) != _canonical_string_frame(combined, grain_keys)
