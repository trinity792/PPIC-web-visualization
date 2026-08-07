from datetime import date

import pandas as pd
import pytest
from scripts.rhna_progress.merging.historical_merge import (
    combine_snapshots,
    detect_new_snapshot,
    load_canonical_dataset,
    load_historical_seed,
    summarize_revisions,
)

from scripts.unit_tests.rhna_progress.helpers import GRAIN_KEYS, OUTPUT_COLUMNS, long_frame, long_row


def test_summarize_revisions_reports_a_new_snapshot_as_added():
    # Snapshot Date is part of the grain, so a fresh capture lands as added rows only.
    existing = long_frame([long_row(snapshot_date=date(2026, 7, 15))])
    combined = long_frame(
        [long_row(snapshot_date=date(2026, 7, 15)), long_row(snapshot_date=date(2026, 7, 29))]
    )

    diff = summarize_revisions(existing, combined, GRAIN_KEYS)

    assert diff["added_keys"] == 1
    assert diff["changed_cells"] == 0


def test_summarize_revisions_flags_a_rewritten_stored_snapshot():
    # An already-captured snapshot's values must not move; when they do it points at a
    # re-derived enrichment formula or a bad write, not a source revision.
    existing = long_frame([long_row(snapshot_date=date(2026, 7, 15), units=50)])
    combined = long_frame([long_row(snapshot_date=date(2026, 7, 15), units=75)])

    diff = summarize_revisions(existing, combined, GRAIN_KEYS)

    assert diff["changed_cells"] >= 1
    assert any(record["column"] == "Units" for record in diff["sample"])


def test_load_canonical_dataset_missing_file_returns_empty_contract_with_warning(tmp_path):
    with pytest.warns(UserWarning, match="canonical"):
        result = load_canonical_dataset({"current_data_path": tmp_path / "missing.csv"})

    assert result.empty
    assert list(result.columns) == OUTPUT_COLUMNS


def test_load_canonical_dataset_reads_saved_rows(tmp_path):
    path = tmp_path / "RHNAProgress_Current.csv"
    expected = long_frame()
    expected.to_csv(path, index=False)

    result = load_canonical_dataset({"current_data_path": path})

    assert result["Jurisdiction"].tolist() == ["Alameda"]
    assert result["Income Level"].tolist() == ["Total"]


def test_load_historical_seed_missing_file_returns_empty_contract(tmp_path):
    result = load_historical_seed({"historical_data_path": tmp_path / "missing.csv"})

    assert result.empty
    assert list(result.columns) == OUTPUT_COLUMNS


def test_load_historical_seed_reads_seed_rows(tmp_path):
    path = tmp_path / "RHNAProgress_Historical.csv"
    expected = long_frame([long_row(snapshot_date="2026-06-01")])
    expected.to_csv(path, index=False)

    result = load_historical_seed({"historical_data_path": path})

    assert result["Snapshot Date"].tolist() == ["2026-06-01"]


def test_combine_snapshots_unions_seed_existing_and_new_rows():
    seed = long_frame([long_row(snapshot_date="2026-06-01", units=10)])
    existing = long_frame([long_row(snapshot_date="2026-07-01", units=20)])
    new = long_frame([long_row(snapshot_date="2026-07-15", units=30)])

    result = combine_snapshots(existing, seed, new)

    assert result["Snapshot Date"].astype(str).tolist() == [
        "2026-06-01",
        "2026-07-01",
        "2026-07-15",
    ]
    assert result["Units"].tolist() == [10, 20, 30]


def test_combine_snapshots_dedupes_on_grain_preferring_new_snapshot_payload():
    existing = long_frame([long_row(snapshot_date="2026-07-15", units=20)])
    seed = pd.DataFrame(columns=OUTPUT_COLUMNS)
    new = long_frame([long_row(snapshot_date="2026-07-15", units=99)])

    result = combine_snapshots(existing, seed, new)

    assert len(result) == 1
    assert result.loc[0, "Units"] == 99


def test_combine_snapshots_rederives_most_recent_by_jurisdiction_cycle():
    existing = long_frame([long_row(snapshot_date="2026-07-01", most_recent=True)])
    seed = pd.DataFrame(columns=OUTPUT_COLUMNS)
    new = long_frame([long_row(snapshot_date="2026-07-15", most_recent=False)])

    result = combine_snapshots(existing, seed, new)

    assert not result.loc[result["Snapshot Date"].astype(str).eq("2026-07-01"), "Most Recent"].any()
    assert result.loc[result["Snapshot Date"].astype(str).eq("2026-07-15"), "Most Recent"].all()


def test_combine_snapshots_does_not_mutate_inputs():
    existing = long_frame([long_row(snapshot_date="2026-07-01")])
    seed = long_frame([long_row(snapshot_date="2026-06-01")])
    new = long_frame([long_row(snapshot_date="2026-07-15")])
    originals = [frame.copy(deep=True) for frame in (existing, seed, new)]

    combine_snapshots(existing, seed, new)

    for frame, original in zip((existing, seed, new), originals):
        pd.testing.assert_frame_equal(frame, original)


def test_detect_new_snapshot_returns_false_for_identical_data_ignoring_order():
    existing = long_frame(
        [
            long_row(jurisdiction="Alameda", snapshot_date="2026-07-15"),
            long_row(jurisdiction="Berkeley", snapshot_date="2026-07-15"),
        ]
    )
    combined = existing.iloc[::-1].copy()
    combined.index = [10, 20]

    assert detect_new_snapshot(existing, combined, GRAIN_KEYS) is False


def test_detect_new_snapshot_returns_true_for_added_grain_row():
    existing = long_frame([long_row(jurisdiction="Alameda")])
    combined = long_frame(
        [
            long_row(jurisdiction="Alameda"),
            long_row(jurisdiction="Berkeley"),
        ]
    )

    assert detect_new_snapshot(existing, combined, GRAIN_KEYS) is True


def test_detect_new_snapshot_returns_true_for_changed_measure():
    existing = long_frame([long_row(units=50)])
    combined = long_frame([long_row(units=51)])

    assert detect_new_snapshot(existing, combined, GRAIN_KEYS) is True



def test_combine_snapshots_collapses_a_recaptured_snapshot_across_dtypes():
    # The 2026-08-07 corruption: `existing` comes back from CSV as strings while a fresh
    # capture carries pd.Timestamp, so the same logical snapshot compared unequal and every
    # row doubled. Both representations of one snapshot must collapse to a single row.
    stamp = "2026-08-07 15:48:49.003781"
    existing = long_frame([long_row(snapshot_date=stamp)])
    recaptured = long_frame([long_row(snapshot_date=pd.Timestamp(stamp))])

    combined = combine_snapshots(existing, None, recaptured)

    assert len(combined) == 1
    assert combined["Most Recent"].tolist() == [True]


def test_combine_snapshots_keeps_genuinely_distinct_snapshots():
    # Guards against the fix over-collapsing: two different captures stay two rows.
    existing = long_frame([long_row(snapshot_date="2026-08-07 15:48:49.003781")])
    newer = long_frame([long_row(snapshot_date=pd.Timestamp("2026-08-21 09:15:00.000000"))])

    combined = combine_snapshots(existing, None, newer)

    assert len(combined) == 2
    # Only the later capture is flagged current.
    assert combined["Most Recent"].tolist() == [False, True]


def test_combine_snapshots_does_not_rewrite_the_stored_snapshot_representation():
    # The frontend sorts Snapshot Date with localeCompare, so the stored strings must survive
    # unchanged, and the transient parse key must not reach the output. `existing` is forced to
    # object dtype because that is what load_canonical_dataset's plain read_csv produces, and
    # mixed representations there are what defeated the original dedupe.
    # Built directly rather than via long_row, which wraps Snapshot Date in pd.Timestamp and
    # so cannot express the plain strings load_canonical_dataset's read_csv actually returns.
    def stored_frame(snapshot_dates):
        return pd.DataFrame(
            {
                "Jurisdiction": ["Alameda"] * len(snapshot_dates),
                "Cycle": [6] * len(snapshot_dates),
                "Snapshot Date": pd.Series(snapshot_dates, dtype=object),
                "Income Level": ["Total"] * len(snapshot_dates),
                "Units": [50] * len(snapshot_dates),
            }
        )

    existing = stored_frame(["2026-07-15", "2026-08-07 15:48:49.003781"])
    recaptured = stored_frame([pd.Timestamp("2026-08-07 15:48:49.003781")])

    combined = combine_snapshots(existing, None, recaptured)

    assert "_snapshot_parsed" not in combined.columns
    # Assert the serialized text, which is what reaches the CSV and the frontend's
    # localeCompare sort. The surviving row for the re-captured snapshot is the fresh
    # pd.Timestamp (keep="last" prefers it), but it must serialize identically.
    assert combined["Snapshot Date"].astype(str).tolist() == [
        "2026-07-15",
        "2026-08-07 15:48:49.003781",
    ]


def test_combine_snapshots_handles_a_seed_dated_without_a_time():
    # Mixed representations in one column (date-only seed + full-timestamp captures) used to
    # raise inside mark_most_recent's pd.to_datetime.
    seed = long_frame([long_row(snapshot_date="2026-07-15")])
    captured = long_frame([long_row(snapshot_date="2026-08-07 15:48:49.003781")])

    combined = combine_snapshots(None, seed, captured)

    assert len(combined) == 2
    assert combined["Most Recent"].tolist() == [False, True]
