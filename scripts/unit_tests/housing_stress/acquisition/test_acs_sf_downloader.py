from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest
from scripts.housing_stress.acquisition import acs_sf_downloader
from scripts.housing_stress.acquisition.acs_sf_downloader import (
    ACSTableUnavailableError,
)

from scripts.shared.downloads.http_downloads import HTTPDownloadError

TABLE_ITERATIONS = {
    "b25140": "All",
    "b25140b": "Black",
    "b25140c": "American Indian/Alaskan Native",
    "b25140d": "Asian",
    "b25140e": "Native Hawaiian/Pacific Islander",
    "b25140f": "Other",
    "b25140g": "Multiracial",
    "b25140h": "White",
    "b25140i": "Hispanic",
}


def _settings():
    return {
        "data_url_pattern": (
            "https://example.test/{year}/acsdt1y{year}-{tblid}.dat"
        ),
        "geo_url_pattern": "https://example.test/{year}/Geos{year}1YR.txt",
        "table_iterations": dict(TABLE_ITERATIONS),
        "expected_geo_columns": ["GEO_ID", "NAME", "STUSAB"],
    }


def _response(content):
    return SimpleNamespace(content=content)


def _unavailable_error():
    return HTTPDownloadError("HTTP request failed: 404 Not Found")


def _frame(value=1):
    return pd.DataFrame({"B25140_E001": [value]}, index=["0400000US06"])


def test_download_national_table_returns_all_geographies(monkeypatch):
    data = b"GEO_ID|B25140_E001\n0400000US06|100\n0400000US41|200\n"
    geos = (
        b"GEO_ID|NAME|STUSAB\n"
        b"0400000US06|California|CA\n"
        b"0400000US41|Oregon|OR\n"
    )
    monkeypatch.setattr(
        acs_sf_downloader,
        "fetch_response",
        Mock(side_effect=[_response(data), _response(geos)]),
    )

    result = acs_sf_downloader.download_national_table(
        "b25140",
        2023,
        "1",
        _settings(),
        {"User-Agent": "test"},
        30,
    )

    # No state filter: every geography is retained for the caller to slice.
    assert result.index.tolist() == ["0400000US06", "0400000US41"]
    assert set(result["STUSAB"]) == {"CA", "OR"}


def test_download_national_table_404_raises_unavailable_error(monkeypatch):
    monkeypatch.setattr(
        acs_sf_downloader,
        "fetch_response",
        Mock(side_effect=_unavailable_error()),
    )

    with pytest.raises(ACSTableUnavailableError):
        acs_sf_downloader.download_national_table(
            "b25140",
            2024,
            "1",
            _settings(),
            {},
            30,
        )


def test_get_acs_table_joins_geography_and_filters_state(monkeypatch):
    data = (
        b"GEO_ID|B25140_E001|B25140_E003\n"
        b"0400000US06|100|30\n"
        b"0400000US41|200|40\n"
    )
    geos = (
        b"GEO_ID|NAME|STUSAB\n"
        b"0400000US06|California|CA\n"
        b"0400000US41|Oregon|OR\n"
    )
    monkeypatch.setattr(
        acs_sf_downloader,
        "fetch_response",
        Mock(side_effect=[_response(data), _response(geos)]),
    )

    result = acs_sf_downloader.get_acs_table(
        "b25140",
        2023,
        "1",
        "CA",
        _settings(),
        {"User-Agent": "test"},
        30,
    )

    assert result.index.name == "GEO_ID"
    assert result.index.tolist() == ["0400000US06"]
    assert result.loc["0400000US06", "NAME"] == "California"
    assert result.loc["0400000US06", "STUSAB"] == "CA"
    assert result.loc["0400000US06", "B25140_E003"] == 30


def test_get_acs_table_templates_urls_and_forwards_http_settings(monkeypatch):
    data = b"GEO_ID|B25140H_E001\n0400000US06|100\n"
    geos = b"GEO_ID|NAME|STUSAB\n0400000US06|California|CA\n"
    mock_fetch = Mock(side_effect=[_response(data), _response(geos)])
    monkeypatch.setattr(acs_sf_downloader, "fetch_response", mock_fetch)
    headers = {"User-Agent": "housing-stress-test"}

    acs_sf_downloader.get_acs_table(
        "b25140h",
        2022,
        "1",
        "CA",
        _settings(),
        headers,
        45,
    )

    assert mock_fetch.call_args_list == [
        (
            (
                "https://example.test/2022/acsdt1y2022-b25140h.dat",
                headers,
                45,
            ),
            {},
        ),
        (
            ("https://example.test/2022/Geos20221YR.txt", headers, 45),
            {},
        ),
    ]


def test_get_acs_table_404_raises_unavailable_error(monkeypatch):
    monkeypatch.setattr(
        acs_sf_downloader,
        "fetch_response",
        Mock(side_effect=_unavailable_error()),
    )

    with pytest.raises(ACSTableUnavailableError):
        acs_sf_downloader.get_acs_table(
            "b25140",
            2024,
            "1",
            "CA",
            _settings(),
            {},
            30,
        )


def test_get_acs_table_malformed_present_file_raises_value_error(monkeypatch):
    data = b"GEO_ID|B25140_E001\n0400000US06|100\n"
    geos_without_stusab = b"GEO_ID|NAME\n0400000US06|California\n"
    monkeypatch.setattr(
        acs_sf_downloader,
        "fetch_response",
        Mock(side_effect=[_response(data), _response(geos_without_stusab)]),
    )

    with pytest.raises(ValueError) as exc_info:
        acs_sf_downloader.get_acs_table(
            "b25140",
            2023,
            "1",
            "CA",
            _settings(),
            {},
            30,
        )

    assert not isinstance(exc_info.value, ACSTableUnavailableError)


def test_download_all_iterations_returns_all_nine_frames(monkeypatch):
    mock_get_table = Mock(side_effect=[_frame(i) for i in range(9)])
    monkeypatch.setattr(acs_sf_downloader, "get_acs_table", mock_get_table)

    frames, missing = acs_sf_downloader.download_all_iterations(
        2023,
        "1",
        "CA",
        _settings(),
        {},
        30,
    )

    assert list(frames) == list(TABLE_ITERATIONS.values())
    assert missing == []
    assert mock_get_table.call_count == 9


def test_download_all_iterations_records_suppressed_non_base(monkeypatch):
    def fake_get_table(tblid, *args, **kwargs):
        if tblid == "b25140e":
            raise ACSTableUnavailableError("suppressed")
        return _frame()

    monkeypatch.setattr(acs_sf_downloader, "get_acs_table", fake_get_table)

    frames, missing = acs_sf_downloader.download_all_iterations(
        2023,
        "1",
        "CA",
        _settings(),
        {},
        30,
    )

    assert "Native Hawaiian/Pacific Islander" not in frames
    assert missing == ["Native Hawaiian/Pacific Islander"]
    assert len(frames) == 8


def test_download_all_iterations_missing_base_table_raises(monkeypatch):
    mock_get_table = Mock(side_effect=ACSTableUnavailableError("not published"))
    monkeypatch.setattr(acs_sf_downloader, "get_acs_table", mock_get_table)

    with pytest.raises(ACSTableUnavailableError, match="not published"):
        acs_sf_downloader.download_all_iterations(
            2023,
            "1",
            "CA",
            _settings(),
            {},
            30,
        )

    mock_get_table.assert_called_once()
