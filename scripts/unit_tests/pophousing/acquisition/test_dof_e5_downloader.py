from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.pophousing.acquisition import dof_e5_downloader
from scripts.pophousing.acquisition.dof_e5_downloader import E5DiscoveryError
from scripts.pophousing.config.sources import get_source_settings
from scripts.shared.downloads.http_downloads import HTTPDownloadError

ESTIMATES_HTML = b"""
<h2>E-5 Population and Housing Estimates for Cities, Counties, and the State:</h2>
<ul><li><a href="/landing/">2020-2025</a></li></ul>
"""
WORKBOOK_HTML = b'<a href="files/E-5-2025_Geo_InternetVersion.xlsx">Workbook</a>'


def _response(content):
    return SimpleNamespace(content=content)


def _mock_page_sequence(monkeypatch, *responses):
    mock_fetch = Mock(side_effect=responses)
    monkeypatch.setattr(dof_e5_downloader, "fetch_response", mock_fetch)
    return mock_fetch


def test_get_e5_file_url_normal_page(monkeypatch):
    # Arrange
    _mock_page_sequence(monkeypatch, _response(ESTIMATES_HTML), _response(WORKBOOK_HTML))

    # Act
    result = dof_e5_downloader.get_e5_file_url(get_source_settings())

    # Assert
    assert result == "https://dof.ca.gov/landing/files/E-5-2025_Geo_InternetVersion.xlsx"


def test_get_e5_file_url_multiple_links_picks_correct(monkeypatch):
    # Arrange
    estimates_html = ESTIMATES_HTML.replace(
        b"<ul>", b'<ul><li><a href="/other/">Other report</a></li>'
    )
    workbook_html = b"""
        <a href="files/other.xlsx">Other workbook</a>
        <a href="files/E-5-2025_Geo_InternetVersion.xlsx">E-5 workbook</a>
    """
    _mock_page_sequence(monkeypatch, _response(estimates_html), _response(workbook_html))

    # Act
    result = dof_e5_downloader.get_e5_file_url(get_source_settings())

    # Assert
    assert result.endswith("E-5-2025_Geo_InternetVersion.xlsx")


def test_get_e5_file_url_landing_page_failure(monkeypatch):
    # Arrange
    _mock_page_sequence(monkeypatch, HTTPDownloadError("connection failed"))

    # Act / Assert
    with pytest.raises(E5DiscoveryError, match="Could not retrieve.*connection failed"):
        dof_e5_downloader.get_e5_file_url(get_source_settings())


def test_get_e5_file_url_subpage_failure(monkeypatch):
    # Arrange
    _mock_page_sequence(monkeypatch, _response(ESTIMATES_HTML), HTTPDownloadError("subpage timed out"))

    # Act / Assert
    with pytest.raises(E5DiscoveryError, match="Could not retrieve.*subpage timed out"):
        dof_e5_downloader.get_e5_file_url(get_source_settings())


def test_get_e5_file_url_no_matching_link(monkeypatch):
    # Arrange
    estimates_html = ESTIMATES_HTML.replace(b"2020-2025", b"Other report")
    _mock_page_sequence(monkeypatch, _response(estimates_html))

    # Act / Assert
    with pytest.raises(E5DiscoveryError, match="landing-page link matching"):
        dof_e5_downloader.get_e5_file_url(get_source_settings())


def test_get_e5_file_url_changed_page_structure(monkeypatch):
    # Arrange
    _mock_page_sequence(monkeypatch, _response(b"<html><body>Redesigned page</body></html>"))

    # Act / Assert
    with pytest.raises(E5DiscoveryError, match="E-5 report heading"):
        dof_e5_downloader.get_e5_file_url(get_source_settings())


def test_get_e5_file_url_relative_url_resolution(monkeypatch):
    # Arrange
    workbook_html = b'<a href="/files/E-5-2025_Geo_InternetVersion.xlsx">Workbook</a>'
    _mock_page_sequence(monkeypatch, _response(ESTIMATES_HTML), _response(workbook_html))

    # Act
    result = dof_e5_downloader.get_e5_file_url(get_source_settings())

    # Assert
    assert result == "https://dof.ca.gov/files/E-5-2025_Geo_InternetVersion.xlsx"


def test_get_e5_filename_standard_url():
    # Act
    filename = dof_e5_downloader.get_e5_filename_from_url(
        "https://dof.ca.gov/files/E-5-2025_Geo_InternetVersion.xlsx"
    )

    # Assert
    assert filename == "E-5-2025_Geo_InternetVersion.xlsx"


def test_get_e5_filename_with_query_params():
    # Act
    filename = dof_e5_downloader.get_e5_filename_from_url(
        "https://dof.ca.gov/files/E-5-2025_Geo_InternetVersion.xlsx?download=true"
    )

    # Assert
    assert filename == "E-5-2025_Geo_InternetVersion.xlsx"


def test_get_e5_filename_no_match():
    # Act / Assert
    with pytest.raises(ValueError, match="valid E-5 filename"):
        dof_e5_downloader.get_e5_filename_from_url("https://dof.ca.gov/files/other.xlsx")


def test_get_e5_filename_pattern_validation():
    # Arrange
    pattern = r"E-5-2024_Geo_InternetVersion\.xlsx"

    # Act / Assert
    with pytest.raises(ValueError, match="valid E-5 filename"):
        dof_e5_downloader.get_e5_filename_from_url(
            "https://dof.ca.gov/files/E-5-2025_Geo_InternetVersion.xlsx",
            pattern,
        )


def test_download_e5_data_cache_hit(monkeypatch, tmp_path):
    # Arrange
    cached_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    cached_file.touch()
    expected_df = pd.DataFrame({"Location": ["California"]})
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", Mock(return_value=expected_df))
    mock_download = Mock()
    monkeypatch.setattr(dof_e5_downloader, "download_file", mock_download)

    # Act
    result = dof_e5_downloader.download_e5_data(
        "https://example.com/E-5-2025_Geo_InternetVersion.xlsx", tmp_path, 60
    )

    # Assert
    mock_download.assert_not_called()
    pd.testing.assert_frame_equal(result, expected_df)


def test_download_e5_data_cache_miss(monkeypatch, tmp_path):
    # Arrange
    expected_df = pd.DataFrame({"Location": ["California"]})

    def fake_download(url, destination, headers, timeout):
        destination.touch()
        return destination

    mock_download = Mock(side_effect=fake_download)
    monkeypatch.setattr(dof_e5_downloader, "download_file", mock_download)
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", Mock(return_value=expected_df))

    # Act
    result = dof_e5_downloader.download_e5_data(
        "https://example.com/E-5-2025_Geo_InternetVersion.xlsx", tmp_path, 60
    )

    # Assert
    mock_download.assert_called_once()
    pd.testing.assert_frame_equal(result, expected_df)


def test_download_e5_data_cache_expired(monkeypatch, tmp_path, set_file_age):
    # Arrange
    cached_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    cached_file.touch()
    set_file_age(cached_file, 61)
    mock_download = Mock(return_value=cached_file)
    monkeypatch.setattr(dof_e5_downloader, "download_file", mock_download)
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", Mock(return_value=pd.DataFrame()))

    # Act
    dof_e5_downloader.download_e5_data(
        "https://example.com/E-5-2025_Geo_InternetVersion.xlsx", tmp_path, 60
    )

    # Assert
    mock_download.assert_called_once()


def test_download_e5_data_download_failure_no_cache(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(
        dof_e5_downloader,
        "download_file",
        Mock(side_effect=HTTPDownloadError("download failed")),
    )

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="download failed"):
        dof_e5_downloader.download_e5_data(
            "https://example.com/E-5-2025_Geo_InternetVersion.xlsx", tmp_path, 60
        )


def test_download_e5_data_download_failure_stale_cache(monkeypatch, tmp_path, set_file_age):
    # Arrange: stale cache is not silently used after a failed refresh.
    cached_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    cached_file.touch()
    set_file_age(cached_file, 61)
    monkeypatch.setattr(
        dof_e5_downloader,
        "download_file",
        Mock(side_effect=HTTPDownloadError("refresh failed")),
    )

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="refresh failed"):
        dof_e5_downloader.download_e5_data(
            "https://example.com/E-5-2025_Geo_InternetVersion.xlsx", tmp_path, 60
        )


def test_download_e5_data_returns_dataframe(monkeypatch, tmp_path):
    # Arrange
    cached_file = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    cached_file.touch()
    monkeypatch.setattr(
        dof_e5_downloader,
        "_read_e5_workbook",
        Mock(return_value=pd.DataFrame({"Year": [2025]})),
    )

    # Act
    result = dof_e5_downloader.download_e5_data(
        "https://example.com/E-5-2025_Geo_InternetVersion.xlsx", tmp_path, 60
    )

    # Assert
    assert isinstance(result, pd.DataFrame)


def test_get_most_recent_e5_file_single_file(monkeypatch, tmp_path):
    # Arrange
    workbook = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    workbook.touch()
    expected_df = pd.DataFrame({"Year": [2025]})
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", Mock(return_value=expected_df))

    # Act
    result = dof_e5_downloader.get_most_recent_e5_file(tmp_path, get_source_settings()["e5_filename_pattern"], 60)

    # Assert
    pd.testing.assert_frame_equal(result, expected_df)


def test_get_most_recent_e5_file_picks_newest(monkeypatch, tmp_path, set_file_age):
    # Arrange
    older = tmp_path / "E-5-2024_Geo_InternetVersion.xlsx"
    newer = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    older.touch()
    newer.touch()
    set_file_age(older, 2)
    set_file_age(newer, 1)
    mock_read = Mock(return_value=pd.DataFrame())
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", mock_read)

    # Act
    dof_e5_downloader.get_most_recent_e5_file(tmp_path, get_source_settings()["e5_filename_pattern"], 60)

    # Assert
    assert mock_read.call_args.args[0] == newer


def test_get_most_recent_e5_file_all_too_old(monkeypatch, tmp_path, set_file_age):
    # Arrange
    workbook = tmp_path / "E-5-2024_Geo_InternetVersion.xlsx"
    workbook.touch()
    set_file_age(workbook, 61)
    mock_read = Mock()
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", mock_read)

    # Act
    result = dof_e5_downloader.get_most_recent_e5_file(tmp_path, get_source_settings()["e5_filename_pattern"], 60)

    # Assert
    assert result is None
    mock_read.assert_not_called()


def test_get_most_recent_e5_file_no_files(monkeypatch, tmp_path):
    # Arrange
    mock_read = Mock()
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", mock_read)

    # Act
    result = dof_e5_downloader.get_most_recent_e5_file(tmp_path, get_source_settings()["e5_filename_pattern"], 60)

    # Assert
    assert result is None
    mock_read.assert_not_called()


def test_get_most_recent_e5_file_ignores_non_matching(monkeypatch, tmp_path):
    # Arrange
    (tmp_path / "other.xlsx").touch()
    mock_read = Mock()
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", mock_read)

    # Act
    result = dof_e5_downloader.get_most_recent_e5_file(tmp_path, get_source_settings()["e5_filename_pattern"], 60)

    # Assert
    assert result is None
    mock_read.assert_not_called()


def test_get_most_recent_e5_file_returns_dataframe(monkeypatch, tmp_path):
    # Arrange
    workbook = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    workbook.touch()
    monkeypatch.setattr(
        dof_e5_downloader,
        "_read_e5_workbook",
        Mock(return_value=pd.DataFrame({"Year": [2025]})),
    )

    # Act
    result = dof_e5_downloader.get_most_recent_e5_file(tmp_path, get_source_settings()["e5_filename_pattern"], 60)

    # Assert
    assert isinstance(result, pd.DataFrame)


def test_get_most_recent_e5_file_searches_archive(monkeypatch, tmp_path, set_file_age):
    # Arrange: the only workbook lives in the archive (retention moved it there).
    download_dir = tmp_path / "downloads"
    archive_dir = tmp_path / "archive"
    download_dir.mkdir()
    archive_dir.mkdir()
    archived = archive_dir / "E-5-2024_Geo_InternetVersion.xlsx"
    archived.touch()
    set_file_age(archived, 120)  # older than the cache window, within fallback
    mock_read = Mock(return_value=pd.DataFrame({"Year": [2024]}))
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", mock_read)

    # Act
    result = dof_e5_downloader.get_most_recent_e5_file(
        download_dir, get_source_settings()["e5_filename_pattern"], 400, archive_directory=archive_dir
    )

    # Assert
    assert isinstance(result, pd.DataFrame)
    assert mock_read.call_args.args[0] == archived


def test_get_most_recent_e5_file_prefers_newest_across_dirs(monkeypatch, tmp_path, set_file_age):
    # Arrange: a fresh cache workbook and an older archived one.
    download_dir = tmp_path / "downloads"
    archive_dir = tmp_path / "archive"
    download_dir.mkdir()
    archive_dir.mkdir()
    cached = download_dir / "E-5-2025_Geo_InternetVersion.xlsx"
    archived = archive_dir / "E-5-2024_Geo_InternetVersion.xlsx"
    cached.touch()
    archived.touch()
    set_file_age(cached, 5)
    set_file_age(archived, 120)
    mock_read = Mock(return_value=pd.DataFrame())
    monkeypatch.setattr(dof_e5_downloader, "_read_e5_workbook", mock_read)

    # Act
    dof_e5_downloader.get_most_recent_e5_file(
        download_dir, get_source_settings()["e5_filename_pattern"], 400, archive_directory=archive_dir
    )

    # Assert
    assert mock_read.call_args.args[0] == cached


def test_read_e5_workbook_data_sheet(monkeypatch, tmp_path):
    # Arrange
    workbook_path = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    excel_file = Mock()
    excel_file.sheet_names = ["Metadata", "E-5 Data"]
    excel_context = Mock()
    excel_context.__enter__ = Mock(return_value=excel_file)
    excel_context.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(dof_e5_downloader.pd, "ExcelFile", Mock(return_value=excel_context))
    expected_df = pd.DataFrame({"Year": [2025]})
    mock_read_excel = Mock(return_value=expected_df)
    monkeypatch.setattr(dof_e5_downloader.pd, "read_excel", mock_read_excel)

    # Act
    result = dof_e5_downloader._read_e5_workbook(workbook_path)

    # Assert
    mock_read_excel.assert_called_once_with(excel_file, sheet_name="E-5 Data")
    pd.testing.assert_frame_equal(result, expected_df)


def test_read_e5_workbook_without_data_sheet(monkeypatch, tmp_path):
    # Arrange
    workbook_path = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    excel_file = Mock()
    excel_file.sheet_names = ["Metadata"]
    excel_context = Mock()
    excel_context.__enter__ = Mock(return_value=excel_file)
    excel_context.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(dof_e5_downloader.pd, "ExcelFile", Mock(return_value=excel_context))

    # Act / Assert
    with pytest.raises(ValueError, match="no data worksheet"):
        dof_e5_downloader._read_e5_workbook(workbook_path)


def test_read_e5_workbook_missing_excel_engine(monkeypatch, tmp_path):
    # Arrange
    workbook_path = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    monkeypatch.setattr(
        dof_e5_downloader.pd,
        "ExcelFile",
        Mock(side_effect=ImportError("Missing optional dependency 'openpyxl'")),
    )

    # Act / Assert
    with pytest.raises(RuntimeError, match="requires the openpyxl package"):
        dof_e5_downloader._read_e5_workbook(workbook_path)
