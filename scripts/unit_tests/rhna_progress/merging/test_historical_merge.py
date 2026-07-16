import pandas as pd
import pytest
from scripts.rhna_progress.merging.historical_merge import (
    combine_snapshots,
    detect_new_snapshot,
    load_canonical_dataset,
    load_historical_seed,
)

from scripts.unit_tests.rhna_progress.helpers import GRAIN_KEYS, OUTPUT_COLUMNS, long_frame, long_row


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

