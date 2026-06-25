from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from scripts.pophousing.acquisition import dof_historical_downloader
from scripts.pophousing.acquisition.dof_historical_downloader import E8DiscoveryError
from scripts.pophousing.config.sources import get_source_settings
from scripts.shared.downloads.http_downloads import HTTPDownloadError

ESTIMATES_HTML = b"""
<h2>E-8 Historical Population and Housing Estimates</h2>
<ul>
  <li><a href="/1990/">1990-2000</a></li>
  <li><a href="/2000/">2000-2010</a></li>
</ul>
"""
WORKBOOK_HTML = b'<a href="files/E-8_Geo.xlsx">Estimates Organized by Geography</a>'


def _response(content):
    return SimpleNamespace(content=content)


def test_get_historical_landing_page_urls_returns_links(monkeypatch):
    # Arrange
    monkeypatch.setattr(dof_historical_downloader, "fetch_response", Mock(return_value=_response(ESTIMATES_HTML)))

    # Act
    result = dof_historical_downloader.get_historical_landing_page_urls("https://dof.ca.gov/x/")

    # Assert
    assert result == ["https://dof.ca.gov/1990/", "https://dof.ca.gov/2000/"]


def test_get_historical_landing_page_urls_missing_header_raises(monkeypatch):
    # Arrange
    monkeypatch.setattr(dof_historical_downloader, "fetch_response", Mock(return_value=_response(b"<p>redesigned</p>")))

    # Act / Assert
    with pytest.raises(E8DiscoveryError, match="E-8 historical heading"):
        dof_historical_downloader.get_historical_landing_page_urls("https://dof.ca.gov/x/")


def test_get_historical_landing_page_urls_network_failure_raises(monkeypatch):
    # Arrange
    monkeypatch.setattr(dof_historical_downloader, "fetch_response", Mock(side_effect=HTTPDownloadError("offline")))

    # Act / Assert
    with pytest.raises(E8DiscoveryError, match="Could not retrieve.*offline"):
        dof_historical_downloader.get_historical_landing_page_urls("https://dof.ca.gov/x/")


def test_find_geography_workbook_url_resolves_relative_link(monkeypatch):
    # Arrange
    monkeypatch.setattr(dof_historical_downloader, "fetch_response", Mock(return_value=_response(WORKBOOK_HTML)))

    # Act
    result = dof_historical_downloader.find_geography_workbook_url("https://dof.ca.gov/1990/")

    # Assert
    assert result == "https://dof.ca.gov/1990/files/E-8_Geo.xlsx"


def test_find_geography_workbook_url_absent_returns_none(monkeypatch):
    # Arrange
    monkeypatch.setattr(dof_historical_downloader, "fetch_response", Mock(return_value=_response(b"<a href='x.pdf'>other</a>")))

    # Act
    result = dof_historical_downloader.find_geography_workbook_url("https://dof.ca.gov/1990/")

    # Assert
    assert result is None


def test_download_historical_e8_files_downloads_each_workbook(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(
        dof_historical_downloader,
        "get_historical_landing_page_urls",
        Mock(return_value=["https://dof.ca.gov/1990/", "https://dof.ca.gov/2000/"]),
    )
    monkeypatch.setattr(
        dof_historical_downloader,
        "find_geography_workbook_url",
        Mock(side_effect=["https://dof.ca.gov/files/E-8_90.xlsx", "https://dof.ca.gov/files/E-8_00.xlsx"]),
    )
    mock_download = Mock()
    monkeypatch.setattr(dof_historical_downloader, "download_file", mock_download)

    # Act
    result = dof_historical_downloader.download_historical_e8_files(tmp_path, get_source_settings())

    # Assert
    assert [path.name for path in result] == ["E-8_90.xlsx", "E-8_00.xlsx"]
    assert mock_download.call_count == 2


def test_download_historical_e8_files_skips_pages_without_workbook(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(
        dof_historical_downloader,
        "get_historical_landing_page_urls",
        Mock(return_value=["https://dof.ca.gov/1990/", "https://dof.ca.gov/2000/"]),
    )
    monkeypatch.setattr(
        dof_historical_downloader,
        "find_geography_workbook_url",
        Mock(side_effect=[None, "https://dof.ca.gov/files/E-8_00.xlsx"]),
    )
    monkeypatch.setattr(dof_historical_downloader, "download_file", Mock())

    # Act
    result = dof_historical_downloader.download_historical_e8_files(tmp_path, get_source_settings())

    # Assert
    assert [path.name for path in result] == ["E-8_00.xlsx"]


def test_download_historical_e8_files_skips_failed_download(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(
        dof_historical_downloader,
        "get_historical_landing_page_urls",
        Mock(return_value=["https://dof.ca.gov/1990/"]),
    )
    monkeypatch.setattr(
        dof_historical_downloader,
        "find_geography_workbook_url",
        Mock(return_value="https://dof.ca.gov/files/E-8_90.xlsx"),
    )
    monkeypatch.setattr(
        dof_historical_downloader,
        "download_file",
        Mock(side_effect=HTTPDownloadError("broken link")),
    )

    # Act: a single broken link must not abort the run.
    result = dof_historical_downloader.download_historical_e8_files(tmp_path, get_source_settings())

    # Assert
    assert result == []
