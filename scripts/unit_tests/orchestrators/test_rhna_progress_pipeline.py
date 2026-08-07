import pandas as pd

from scripts.orchestrators.rhna_progress_pipeline import _latest_snapshot_by_cycle
from scripts.rhna_progress.acquisition.ckan_downloader import _is_newer


def _stored(snapshot_dates, cycles=None):
    """A saved canonical frame as load_canonical_dataset returns it: Snapshot Date as strings."""
    cycles = cycles or [5] * len(snapshot_dates)
    return pd.DataFrame(
        {
            "Cycle": cycles,
            "Snapshot Date": pd.Series(snapshot_dates, dtype=object),
        }
    )


def test_latest_snapshot_by_cycle_keeps_the_time_of_day():
    # Truncating to a date is what made every same-day re-run look like new data.
    existing = _stored(["2026-08-07 15:48:49.003781"])

    assert _latest_snapshot_by_cycle(existing) == {5: "2026-08-07 15:48:49.003781"}


def test_a_second_run_on_the_same_day_does_not_look_like_new_data():
    # The 2026-08-07 regression, end to end across the two functions that disagreed:
    # the gate stores what the pipeline saved, and the resource is unchanged since.
    resource_last_modified = "2026-08-07 15:48:49.003781"
    existing = _stored([resource_last_modified])

    stored = _latest_snapshot_by_cycle(existing)[5]

    assert _is_newer(resource_last_modified, stored) is False


def test_a_genuinely_newer_resource_still_downloads():
    # Guards against the fix over-correcting into "never re-download".
    existing = _stored(["2026-08-07 15:48:49.003781"])

    stored = _latest_snapshot_by_cycle(existing)[5]

    assert _is_newer("2026-08-21 09:15:00.000000", stored) is True


def test_latest_snapshot_by_cycle_handles_mixed_representations():
    # The seed is date-only while live captures carry a full timestamp; both live in the
    # column at once, and the newest must win regardless of shape.
    existing = _stored(["2026-07-15", "2026-08-07 15:48:49.003781"])

    assert _latest_snapshot_by_cycle(existing) == {5: "2026-08-07 15:48:49.003781"}


def test_latest_snapshot_by_cycle_tracks_each_cycle_separately():
    existing = _stored(
        ["2026-08-07 15:48:49.003781", "2026-08-07 15:48:50.699427"],
        cycles=[5, 6],
    )

    assert _latest_snapshot_by_cycle(existing) == {
        5: "2026-08-07 15:48:49.003781",
        6: "2026-08-07 15:48:50.699427",
    }


def test_latest_snapshot_by_cycle_is_empty_on_a_cold_start():
    assert _latest_snapshot_by_cycle(pd.DataFrame()) == {}
    assert _latest_snapshot_by_cycle(None) == {}
