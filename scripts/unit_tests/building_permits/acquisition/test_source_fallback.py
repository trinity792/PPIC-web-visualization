from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.building_permits.acquisition import source_fallback
from scripts.building_permits.acquisition.census_bps_downloader import (
    BPSMonthUnavailableError,
)
from scripts.shared.downloads.http_downloads import HTTPDownloadError

CBSA_DF = pd.DataFrame({"Location": ["Bakersfield"]})
STATE_DF = pd.DataFrame({"Location": ["California"]})
SAVED_DF = pd.DataFrame(
    {
        "Geographic Level": ["State"],
        "Location": ["California"],
        "Date": ["2026-04"],
    }
)


class FrozenDateTime:
    year = 2026
    month = 5

    @classmethod
    def now(cls):
        return cls()


class FrozenJanuaryDateTime:
    year = 2026
    month = 1

    @classmethod
    def now(cls):
        return cls()


def _resolve(monkeypatch, cbsa_download, state_download, lookback=4):
    monkeypatch.setattr(source_fallback, "datetime", FrozenDateTime)
    monkeypatch.setattr(
        source_fallback,
        "download_cbsa_month",
        cbsa_download,
    )
    monkeypatch.setattr(
        source_fallback,
        "download_state_month",
        state_download,
    )
    return source_fallback.resolve_latest_month(
        {"source": "test"},
        {"User-Agent": "test"},
        30,
        lookback,
    )


def test_resolve_latest_month_accepts_newest_parseable_month(monkeypatch):
    cbsa_download = Mock(return_value=CBSA_DF)
    state_download = Mock(return_value=STATE_DF)

    result = _resolve(monkeypatch, cbsa_download, state_download)

    assert result[:2] == (2026, 5)
    # The probe's downloads are handed back so acquire_months need not re-fetch them.
    assert set(result[2]) == {"2026-05"}
    assert result[2]["2026-05"] == (CBSA_DF, STATE_DF)
    cbsa_download.assert_called_once_with(
        2026,
        5,
        {"source": "test"},
        {"User-Agent": "test"},
        30,
    )
    state_download.assert_called_once_with(
        2026,
        5,
        {"source": "test"},
        {"User-Agent": "test"},
        30,
    )


def test_resolve_latest_month_steps_back_when_either_file_is_unavailable(
    monkeypatch,
):
    cbsa_download = Mock(side_effect=[CBSA_DF, CBSA_DF])
    state_download = Mock(
        side_effect=[
            BPSMonthUnavailableError("state file is not published"),
            STATE_DF,
        ]
    )

    result = _resolve(monkeypatch, cbsa_download, state_download)

    assert result[:2] == (2026, 4)
    assert [call.args[:2] for call in cbsa_download.call_args_list] == [
        (2026, 5),
        (2026, 4),
    ]
    assert [call.args[:2] for call in state_download.call_args_list] == [
        (2026, 5),
        (2026, 4),
    ]


def test_resolve_latest_month_does_not_mask_parse_error(monkeypatch):
    cbsa_download = Mock(side_effect=ValueError("published file is malformed"))
    state_download = Mock(return_value=STATE_DF)

    with pytest.raises(ValueError, match="malformed"):
        _resolve(monkeypatch, cbsa_download, state_download)

    cbsa_download.assert_called_once()
    state_download.assert_not_called()


def test_resolve_latest_month_raises_when_window_is_exhausted(monkeypatch):
    cbsa_download = Mock(side_effect=BPSMonthUnavailableError("not published"))
    state_download = Mock(return_value=STATE_DF)

    with pytest.raises(BPSMonthUnavailableError):
        _resolve(monkeypatch, cbsa_download, state_download, lookback=3)

    assert [call.args[:2] for call in cbsa_download.call_args_list] == [
        (2026, 5),
        (2026, 4),
        (2026, 3),
    ]
    state_download.assert_not_called()


def test_resolve_latest_month_steps_across_year_boundary(monkeypatch):
    monkeypatch.setattr(source_fallback, "datetime", FrozenJanuaryDateTime)
    cbsa_download = Mock(
        side_effect=[
            BPSMonthUnavailableError("not published"),
            CBSA_DF,
        ]
    )
    state_download = Mock(return_value=STATE_DF)
    monkeypatch.setattr(
        source_fallback,
        "download_cbsa_month",
        cbsa_download,
    )
    monkeypatch.setattr(
        source_fallback,
        "download_state_month",
        state_download,
    )

    result = source_fallback.resolve_latest_month({}, {}, 30, 2)

    assert result[:2] == (2025, 12)
    assert [call.args[:2] for call in cbsa_download.call_args_list] == [
        (2026, 1),
        (2025, 12),
    ]


def test_resolve_latest_month_retries_transient_fault_then_succeeds(monkeypatch):
    # A transient network blip on the newest-month probe must not abort Phase 2; the
    # bounded retry recovers before failing loud (guide A4).
    cbsa_download = Mock(side_effect=[HTTPDownloadError("timeout", status_code=None), CBSA_DF])
    state_download = Mock(return_value=STATE_DF)

    result = _resolve(monkeypatch, cbsa_download, state_download)

    assert result[:2] == (2026, 5)
    assert cbsa_download.call_count == 2


def test_resolve_latest_month_fails_loud_on_persistent_transient_fault(monkeypatch):
    # A genuine outage (not a 404) still fails the run rather than silently capping the
    # series at a stale month (guide A4 — fail-loud-with-retry).
    cbsa_download = Mock(side_effect=HTTPDownloadError("connection refused", status_code=None))
    state_download = Mock(return_value=STATE_DF)

    with pytest.raises(HTTPDownloadError, match="connection refused"):
        _resolve(monkeypatch, cbsa_download, state_download)

    # Two attempts on the first probed month (default probe_retry_attempts=2), then loud.
    assert cbsa_download.call_count == 2


def test_months_to_acquire_enumerates_forward_window():
    result = source_fallback.months_to_acquire(
        "2026-02",
        (2026, 5),
    )

    assert result == [(2026, 3), (2026, 4), (2026, 5)]


def test_months_to_acquire_is_empty_when_already_current():
    result = source_fallback.months_to_acquire(
        "2026-05",
        (2026, 5),
    )

    assert result == []


def test_months_to_acquire_enumerates_across_year_boundary():
    result = source_fallback.months_to_acquire(
        "2025-11",
        (2026, 2),
    )

    assert result == [
        (2025, 12),
        (2026, 1),
        (2026, 2),
    ]


def test_months_to_acquire_skips_explicit_exclusions():
    result = source_fallback.months_to_acquire(
        "2026-02",
        (2026, 5),
        excluded_months={"2026-04"},
    )

    assert result == [(2026, 3), (2026, 5)]


def test_acquire_months_prefers_live_monthly_frames():
    cbsa_download = Mock(return_value=CBSA_DF)
    state_download = Mock(return_value=STATE_DF)
    saved_rows = Mock(return_value=SAVED_DF)

    cbsa_frames, state_frames, source_failed = source_fallback.acquire_months(
        [(2026, 4), (2026, 5)],
        cbsa_download,
        state_download,
        saved_rows,
    )

    assert list(cbsa_frames) == ["2026-04", "2026-05"]
    assert list(state_frames) == ["2026-04", "2026-05"]
    assert all(frame is CBSA_DF for frame in cbsa_frames.values())
    assert all(frame is STATE_DF for frame in state_frames.values())
    assert source_failed is False
    saved_rows.assert_not_called()


def test_acquire_months_reuses_prefetched_month_without_redownloading():
    # The latest-month probe already downloaded its files; acquire_months must reuse
    # them rather than fetch the same month a second time (guide B3).
    cbsa_download = Mock(return_value=CBSA_DF)
    state_download = Mock(return_value=STATE_DF)
    prefetched_cbsa = pd.DataFrame({"Location": ["prefetched-cbsa"]})
    prefetched_state = pd.DataFrame({"Location": ["prefetched-state"]})

    cbsa_frames, state_frames, source_failed = source_fallback.acquire_months(
        [(2026, 4), (2026, 5)],
        cbsa_download,
        state_download,
        Mock(),
        prefetched={"2026-05": (prefetched_cbsa, prefetched_state)},
    )

    assert cbsa_frames["2026-05"] is prefetched_cbsa
    assert state_frames["2026-05"] is prefetched_state
    # Only the un-prefetched April month is actually downloaded.
    assert [call.args[:2] for call in cbsa_download.call_args_list] == [(2026, 4)]
    assert source_failed is False


def test_acquire_months_with_empty_window_does_not_use_fallback():
    saved_rows = Mock(return_value=SAVED_DF)

    cbsa_frames, state_frames, source_failed = source_fallback.acquire_months(
        [],
        Mock(),
        Mock(),
        saved_rows,
    )

    assert cbsa_frames == {}
    assert state_frames == {}
    assert source_failed is False
    saved_rows.assert_not_called()


def test_acquire_months_flags_failure_and_loads_saved_rows():
    saved_rows = Mock(return_value=SAVED_DF)

    cbsa_frames, state_frames, source_failed = source_fallback.acquire_months(
        [(2026, 5)],
        Mock(side_effect=RuntimeError("network unavailable")),
        Mock(return_value=STATE_DF),
        saved_rows,
    )

    assert source_failed is True
    assert any(
        payload is SAVED_DF
        for payload in (cbsa_frames, state_frames)
    )
    saved_rows.assert_called_once()
