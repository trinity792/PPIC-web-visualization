from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.building_permits.acquisition import census_bps_downloader
from scripts.building_permits.acquisition.census_bps_downloader import (
    BPSMonthUnavailableError,
)
from scripts.shared.downloads.http_downloads import HTTPDownloadError


def _settings():
    return {
        "cbsa_url_pattern": "https://example.test/cbsamonthly_{yyyymm}.xls",
        "state_url_pattern": "https://example.test/statemonthly_{yyyymm}.xls",
    }


def _response(content=b"fixture-xls"):
    return SimpleNamespace(content=content)


def _not_found_error():
    return HTTPDownloadError("HTTP request failed: 404 Not Found")


def test_download_cbsa_month_templates_url_and_parses_spreadsheet(monkeypatch):
    expected = pd.DataFrame({"CBSA": [12540], "Name": ["Bakersfield, CA"]})
    mock_fetch = Mock(return_value=_response())
    mock_read_excel = Mock(return_value=expected)
    monkeypatch.setattr(census_bps_downloader, "fetch_response", mock_fetch)
    monkeypatch.setattr(census_bps_downloader.pd, "read_excel", mock_read_excel)
    headers = {"User-Agent": "building-permits-test"}

    result = census_bps_downloader.download_cbsa_month(
        2026,
        5,
        _settings(),
        headers,
        45,
    )

    pd.testing.assert_frame_equal(result, expected)
    mock_fetch.assert_called_once_with(
        "https://example.test/cbsamonthly_202605.xls",
        headers,
        45,
    )
    spreadsheet = mock_read_excel.call_args.args[0]
    assert isinstance(spreadsheet, BytesIO)
    assert spreadsheet.getvalue() == b"fixture-xls"


def test_download_state_month_templates_url_and_parses_spreadsheet(monkeypatch):
    expected = pd.DataFrame({"Location": ["California"], "Total": [100]})
    mock_fetch = Mock(return_value=_response())
    monkeypatch.setattr(census_bps_downloader, "fetch_response", mock_fetch)
    monkeypatch.setattr(
        census_bps_downloader.pd,
        "read_excel",
        Mock(return_value=expected),
    )
    headers = {"User-Agent": "building-permits-test"}

    result = census_bps_downloader.download_state_month(
        2025,
        11,
        _settings(),
        headers,
        30,
    )

    pd.testing.assert_frame_equal(result, expected)
    mock_fetch.assert_called_once_with(
        "https://example.test/statemonthly_202511.xls",
        headers,
        30,
    )


@pytest.mark.parametrize(
    "download_fn_name",
    ["download_cbsa_month", "download_state_month"],
)
def test_download_month_404_raises_unavailable_error(
    monkeypatch,
    download_fn_name,
):
    monkeypatch.setattr(
        census_bps_downloader,
        "fetch_response",
        Mock(side_effect=_not_found_error()),
    )

    with pytest.raises(BPSMonthUnavailableError):
        getattr(census_bps_downloader, download_fn_name)(
            2026,
            6,
            _settings(),
            {},
            30,
        )


def test_download_month_malformed_present_file_raises_value_error(monkeypatch):
    monkeypatch.setattr(
        census_bps_downloader,
        "fetch_response",
        Mock(return_value=_response(b"not-an-xls")),
    )
    monkeypatch.setattr(
        census_bps_downloader.pd,
        "read_excel",
        Mock(side_effect=ValueError("Excel file format cannot be determined")),
    )

    with pytest.raises(ValueError) as exc_info:
        census_bps_downloader.download_cbsa_month(
            2026,
            5,
            _settings(),
            {},
            30,
        )

    assert not isinstance(exc_info.value, BPSMonthUnavailableError)


def test_download_month_non_404_http_error_is_not_marked_unavailable(monkeypatch):
    server_error = HTTPDownloadError("HTTP request failed: 500 Server Error")
    monkeypatch.setattr(
        census_bps_downloader,
        "fetch_response",
        Mock(side_effect=server_error),
    )

    with pytest.raises(HTTPDownloadError) as exc_info:
        census_bps_downloader.download_state_month(
            2026,
            5,
            _settings(),
            {},
            30,
        )

    assert exc_info.value is server_error
