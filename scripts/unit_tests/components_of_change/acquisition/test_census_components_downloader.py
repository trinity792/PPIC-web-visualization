from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.components_of_change.acquisition import census_components_downloader
from scripts.components_of_change.acquisition.census_components_downloader import CensusComponentsDiscoveryError
from scripts.components_of_change.config.sources import get_source_settings
from scripts.shared.downloads.http_downloads import HTTPDownloadError


def _settings(**overrides):
    settings = get_source_settings()
    settings.update(overrides)
    return settings


"""
========================================================================================================================
get_census_components_url
========================================================================================================================
"""


def test_get_census_components_url_first_year_succeeds(monkeypatch):
    # Arrange
    mock_fetch = Mock(return_value=SimpleNamespace(content=b""))
    monkeypatch.setattr(census_components_downloader, "fetch_response", mock_fetch)

    # Act
    url = census_components_downloader.get_census_components_url(_settings(census_initial_year=2024))

    # Assert
    assert "co-est2024-alldata.csv" in url
    assert mock_fetch.call_count == 1


def test_get_census_components_url_walks_backward_until_available(monkeypatch):
    # Arrange: the two most recent years 404, the third responds.
    responses = [
        HTTPDownloadError("404"),
        HTTPDownloadError("404"),
        SimpleNamespace(content=b""),
    ]
    monkeypatch.setattr(census_components_downloader, "fetch_response", Mock(side_effect=responses))

    # Act
    url = census_components_downloader.get_census_components_url(_settings(census_initial_year=2024))

    # Assert
    assert "co-est2022-alldata.csv" in url


def test_get_census_components_url_all_years_fail_raises(monkeypatch):
    # Arrange
    monkeypatch.setattr(
        census_components_downloader,
        "fetch_response",
        Mock(side_effect=HTTPDownloadError("404")),
    )

    # Act / Assert
    with pytest.raises(CensusComponentsDiscoveryError, match="within 3 years"):
        census_components_downloader.get_census_components_url(
            _settings(census_initial_year=2024, max_lookback_years=3)
        )


def test_get_census_components_url_chains_last_error(monkeypatch):
    # Arrange
    monkeypatch.setattr(
        census_components_downloader,
        "fetch_response",
        Mock(side_effect=HTTPDownloadError("network down")),
    )

    # Act / Assert
    with pytest.raises(CensusComponentsDiscoveryError) as exc_info:
        census_components_downloader.get_census_components_url(
            _settings(census_initial_year=2024, max_lookback_years=2)
        )
    assert isinstance(exc_info.value.__cause__, HTTPDownloadError)


def test_get_census_components_url_override_limits_attempts(monkeypatch):
    # Arrange
    mock_fetch = Mock(side_effect=HTTPDownloadError("404"))
    monkeypatch.setattr(census_components_downloader, "fetch_response", mock_fetch)

    # Act / Assert
    with pytest.raises(CensusComponentsDiscoveryError):
        census_components_downloader.get_census_components_url(
            _settings(census_initial_year=2024), max_lookback_years=2
        )
    assert mock_fetch.call_count == 2


def test_get_census_components_url_derives_decade_folder(monkeypatch):
    # Arrange: a 2031 candidate must build a 2030-decade folder, not a hardcoded 2020.
    captured = {}

    def _capture(url, *args, **kwargs):
        captured["url"] = url
        return SimpleNamespace(content=b"")

    monkeypatch.setattr(census_components_downloader, "fetch_response", Mock(side_effect=_capture))

    # Act
    url = census_components_downloader.get_census_components_url(_settings(census_initial_year=2031))

    # Assert
    assert "datasets/2030-2031/" in url
    assert "co-est2031-alldata.csv" in captured["url"]


def test_discover_returns_response_for_reuse(monkeypatch):
    # Arrange
    response = SimpleNamespace(content=b"STNAME\nCalifornia\n")
    monkeypatch.setattr(census_components_downloader, "fetch_response", Mock(return_value=response))

    # Act
    url, discovered_response = census_components_downloader.discover_census_components(
        _settings(census_initial_year=2024)
    )

    # Assert
    assert "co-est2024-alldata.csv" in url
    assert discovered_response is response


"""
========================================================================================================================
download_census_components
========================================================================================================================
"""


def test_download_reuses_discovery_response_without_second_fetch(monkeypatch):
    # Arrange: passing the discovery response must avoid a second GET of the same file.
    mock_fetch = Mock()
    monkeypatch.setattr(census_components_downloader, "fetch_response", mock_fetch)
    monkeypatch.setattr(census_components_downloader.pd, "read_csv", Mock(return_value=pd.DataFrame()))
    response = SimpleNamespace(content=b"STNAME\nCalifornia\n")

    # Act
    census_components_downloader.download_census_components(
        "https://example.com/data.csv", _settings(), response=response
    )

    # Assert
    mock_fetch.assert_not_called()


def test_download_census_components_reads_local_csv(tmp_path):
    # Arrange
    csv_path = tmp_path / "co-est2024-alldata.csv"
    pd.DataFrame({"STNAME": ["California"], "CTYNAME": ["Alameda"]}).to_csv(csv_path, index=False)

    # Act
    result = census_components_downloader.download_census_components(csv_path)

    # Assert
    assert list(result.columns) == ["STNAME", "CTYNAME"]
    assert result.loc[0, "CTYNAME"] == "Alameda"


def test_download_census_components_local_path_skips_fetch(monkeypatch, tmp_path):
    # Arrange: a local path must not trigger an HTTP request.
    csv_path = tmp_path / "co-est2024-alldata.csv"
    pd.DataFrame({"STNAME": ["California"]}).to_csv(csv_path, index=False)
    mock_fetch = Mock()
    monkeypatch.setattr(census_components_downloader, "fetch_response", mock_fetch)

    # Act
    census_components_downloader.download_census_components(csv_path)

    # Assert
    mock_fetch.assert_not_called()


def test_download_census_components_url_fetches_via_requests(monkeypatch):
    # Arrange: URLs must be pulled through the shared requests/certifi stack, not
    # pd.read_csv's urllib (which fails TLS verification on some hosts), then read
    # from the in-memory response with the latin1/python-engine settings.
    mock_fetch = Mock(return_value=SimpleNamespace(content=b"STNAME\nCalifornia\n"))
    monkeypatch.setattr(census_components_downloader, "fetch_response", mock_fetch)
    mock_read = Mock(return_value=pd.DataFrame())
    monkeypatch.setattr(census_components_downloader.pd, "read_csv", mock_read)

    # Act
    census_components_downloader.download_census_components("https://example.com/data.csv", _settings())

    # Assert
    mock_fetch.assert_called_once()
    read_source = mock_read.call_args.args[0]
    assert isinstance(read_source, BytesIO)
    assert mock_read.call_args.kwargs["engine"] == "python"
    assert mock_read.call_args.kwargs["encoding"] == "latin1"
