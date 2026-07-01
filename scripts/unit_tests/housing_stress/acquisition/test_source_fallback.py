from unittest.mock import Mock

import pandas as pd
import pytest
from scripts.housing_stress.acquisition import source_fallback
from scripts.housing_stress.acquisition.acs_sf_downloader import (
    ACSTableUnavailableError,
)

LIVE_PAYLOAD = {"All": pd.DataFrame({"E001": [100]})}
MANUAL_DF = pd.DataFrame({"Source": ["manual"]})
SAVED_DF = pd.DataFrame({"Source": ["saved"]})


class FrozenDateTime:
    @classmethod
    def now(cls):
        return cls()

    @property
    def year(self):
        return 2024


def _settings():
    return {
        "dataset": "1",
        "data_url_pattern": "https://example.test/{year}/{tblid}.dat",
        "geo_url_pattern": "https://example.test/{year}/geos.txt",
    }


def _resolve(monkeypatch, get_table, *, lookback=5, excluded=frozenset()):
    monkeypatch.setattr(source_fallback, "datetime", FrozenDateTime)
    monkeypatch.setattr(source_fallback, "get_acs_table", get_table)
    return source_fallback.resolve_latest_vintage(
        "CA",
        _settings(),
        {"User-Agent": "test"},
        30,
        lookback,
        excluded,
    )


def test_resolve_latest_vintage_accepts_newest_parseable_year(monkeypatch):
    mock_get_table = Mock(return_value=pd.DataFrame())

    result = _resolve(monkeypatch, mock_get_table)

    assert result == 2024
    assert mock_get_table.call_args.args[:4] == ("b25140", 2024, "1", "CA")
    mock_get_table.assert_called_once()


def test_resolve_latest_vintage_steps_back_over_unavailable_year(monkeypatch):
    mock_get_table = Mock(
        side_effect=[
            ACSTableUnavailableError("2024 unavailable"),
            pd.DataFrame(),
        ]
    )

    result = _resolve(monkeypatch, mock_get_table)

    assert result == 2023
    assert [call.args[1] for call in mock_get_table.call_args_list] == [2024, 2023]


def test_resolve_latest_vintage_skips_excluded_year_without_probe(monkeypatch):
    mock_get_table = Mock(
        side_effect=[
            ACSTableUnavailableError("2024 unavailable"),
            ACSTableUnavailableError("2023 unavailable"),
            ACSTableUnavailableError("2022 unavailable"),
            ACSTableUnavailableError("2021 unavailable"),
            pd.DataFrame(),
        ]
    )

    result = _resolve(
        monkeypatch,
        mock_get_table,
        lookback=6,
        excluded={2020},
    )

    assert result == 2019
    assert [call.args[1] for call in mock_get_table.call_args_list] == [
        2024,
        2023,
        2022,
        2021,
        2019,
    ]


def test_resolve_latest_vintage_steps_back_over_network_timeout(monkeypatch):
    # The Census server hangs (rather than 404s) for some missing vintages, so a
    # transient HTTPDownloadError must advance to the previous year, not abort.
    from scripts.shared.downloads.http_downloads import HTTPDownloadError

    mock_get_table = Mock(
        side_effect=[
            HTTPDownloadError("HTTP request timed out for …/acsdt1y2024-b25140.dat"),
            pd.DataFrame(),
        ]
    )

    result = _resolve(monkeypatch, mock_get_table)

    assert result == 2023
    assert [call.args[1] for call in mock_get_table.call_args_list] == [2024, 2023]


def test_resolve_latest_vintage_does_not_mask_parse_error(monkeypatch):
    mock_get_table = Mock(side_effect=ValueError("published file is malformed"))

    with pytest.raises(ValueError, match="malformed"):
        _resolve(monkeypatch, mock_get_table)

    mock_get_table.assert_called_once()


def test_resolve_latest_vintage_raises_when_window_exhausted(monkeypatch):
    mock_get_table = Mock(side_effect=ACSTableUnavailableError("not published"))

    with pytest.raises(ACSTableUnavailableError):
        _resolve(monkeypatch, mock_get_table, lookback=3)

    assert [call.args[1] for call in mock_get_table.call_args_list] == [
        2024,
        2023,
        2022,
    ]


def test_acquire_with_fallback_prefers_live_payload(tmp_path):
    live_download = Mock(return_value=LIVE_PAYLOAD)
    saved_rows = Mock(return_value=SAVED_DF)

    raw, source_failed, used_manual = source_fallback.acquire_with_fallback(
        live_download,
        tmp_path / "manual.csv",
        saved_rows,
    )

    assert raw is LIVE_PAYLOAD
    assert (source_failed, used_manual) == (False, False)
    saved_rows.assert_not_called()


def test_acquire_with_fallback_uses_manual_csv_after_live_failure(tmp_path):
    manual_path = tmp_path / "manual.csv"
    MANUAL_DF.to_csv(manual_path, index=False)
    saved_rows = Mock(return_value=SAVED_DF)

    raw, source_failed, used_manual = source_fallback.acquire_with_fallback(
        Mock(side_effect=RuntimeError("network unavailable")),
        manual_path,
        saved_rows,
    )

    pd.testing.assert_frame_equal(raw, MANUAL_DF)
    assert (source_failed, used_manual) == (False, True)
    saved_rows.assert_not_called()


def test_acquire_with_fallback_uses_saved_rows_when_manual_missing(tmp_path):
    saved_rows = Mock(return_value=SAVED_DF)

    raw, source_failed, used_manual = source_fallback.acquire_with_fallback(
        Mock(side_effect=RuntimeError("network unavailable")),
        tmp_path / "missing.csv",
        saved_rows,
    )

    pd.testing.assert_frame_equal(raw, SAVED_DF)
    assert (source_failed, used_manual) == (True, False)
    saved_rows.assert_called_once()


def test_acquire_with_fallback_uses_saved_rows_when_manual_is_malformed(tmp_path):
    manual_path = tmp_path / "manual.csv"
    manual_path.write_text('Source\n"unterminated', encoding="utf-8")
    saved_rows = Mock(return_value=SAVED_DF)

    raw, source_failed, used_manual = source_fallback.acquire_with_fallback(
        Mock(side_effect=RuntimeError("network unavailable")),
        manual_path,
        saved_rows,
    )

    pd.testing.assert_frame_equal(raw, SAVED_DF)
    assert (source_failed, used_manual) == (True, False)


def test_acquire_with_fallback_does_not_read_manual_after_live_success(tmp_path):
    manual_path = tmp_path / "manual.csv"
    MANUAL_DF.to_csv(manual_path, index=False)

    raw, source_failed, used_manual = source_fallback.acquire_with_fallback(
        Mock(return_value=LIVE_PAYLOAD),
        manual_path,
        Mock(side_effect=AssertionError("saved rows must not be loaded")),
    )

    assert raw is LIVE_PAYLOAD
    assert (source_failed, used_manual) == (False, False)


def test_acquire_with_fallback_propagates_saved_rows_failure(tmp_path):
    saved_rows = Mock(side_effect=RuntimeError("saved rows unavailable"))

    with pytest.raises(RuntimeError, match="saved rows unavailable"):
        source_fallback.acquire_with_fallback(
            Mock(side_effect=RuntimeError("network unavailable")),
            tmp_path / "missing.csv",
            saved_rows,
        )
