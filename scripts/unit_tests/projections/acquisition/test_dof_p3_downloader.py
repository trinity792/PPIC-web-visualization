from types import SimpleNamespace
from unittest.mock import Mock
from zipfile import ZipFile

import pytest
from scripts.projections.acquisition import dof_p3_downloader
from scripts.projections.acquisition.dof_p3_downloader import P3DiscoveryError

from scripts.shared.downloads.http_downloads import HTTPDownloadError

EXPECTED_COLUMNS = ["fips", "year", "sex", "race7", "agerc", "perwt"]

P3_LINK_HTML = b"""
<html>
  <body>
    <a href="/downloads/readme.pdf">Documentation</a>
    <a href="/downloads/P-3_Complete.zip">
      P-3 Complete State and County Projections Dataset
    </a>
  </body>
</html>
"""

P3_POSITIONAL_HTML = b"""
<div class="et_pb_text_inner">
  <h3>P-3: Complete State and County Projections Dataset:</h3>
  <ul>
    <li>
      Download
      <ul><li><a href="files/P-3_Complete.zip">ZIP archive</a></li></ul>
    </li>
  </ul>
</div>
"""


def _response(content):
    return SimpleNamespace(content=content, text=content.decode())


"""
========================================================================================================================
URL Discovery
========================================================================================================================
"""


def test_get_p3_file_url_discovers_zip_and_resolves_relative_url(monkeypatch):
    # Arrange
    mock_fetch = Mock(return_value=_response(P3_LINK_HTML))
    monkeypatch.setattr(dof_p3_downloader, "fetch_response", mock_fetch)

    # Act
    result = dof_p3_downloader.get_p3_file_url(
        "https://dof.ca.gov/forecasting/demographics/projections/",
        {"User-Agent": "test"},
        30,
    )

    # Assert
    assert result == "https://dof.ca.gov/downloads/P-3_Complete.zip"
    mock_fetch.assert_called_once_with(
        "https://dof.ca.gov/forecasting/demographics/projections/",
        {"User-Agent": "test"},
        30,
    )


def test_get_p3_file_url_without_matching_zip_raises(monkeypatch):
    # Arrange
    html = b'<html><body><a href="/downloads/other.zip">Other data</a></body></html>'
    monkeypatch.setattr(
        dof_p3_downloader,
        "fetch_response",
        Mock(return_value=_response(html)),
    )

    # Act / Assert
    with pytest.raises(P3DiscoveryError, match="P-3"):
        dof_p3_downloader.get_p3_file_url(
            "https://dof.ca.gov/forecasting/demographics/projections/",
            {},
            30,
        )


def test_get_p3_file_url_positional_uses_p3_heading(monkeypatch):
    # Arrange
    monkeypatch.setattr(
        dof_p3_downloader,
        "fetch_response",
        Mock(return_value=_response(P3_POSITIONAL_HTML)),
    )

    # Act
    result = dof_p3_downloader.get_p3_file_url_positional(
        "https://dof.ca.gov/forecasting/demographics/projections/",
        {},
        30,
    )

    # Assert
    assert result == (
        "https://dof.ca.gov/forecasting/demographics/projections/"
        "files/P-3_Complete.zip"
    )


def test_get_p3_file_url_positional_without_p3_heading_raises(monkeypatch):
    # Arrange
    html = b'<div class="et_pb_text_inner"><h3>Other dataset</h3></div>'
    monkeypatch.setattr(
        dof_p3_downloader,
        "fetch_response",
        Mock(return_value=_response(html)),
    )

    # Act / Assert
    with pytest.raises(P3DiscoveryError, match="P-3"):
        dof_p3_downloader.get_p3_file_url_positional(
            "https://dof.ca.gov/forecasting/demographics/projections/",
            {},
            30,
        )


"""
========================================================================================================================
Download and Extraction
========================================================================================================================
"""


def test_download_p3_data_cache_hit_skips_http(monkeypatch, tmp_path):
    # Arrange
    cached_csv = tmp_path / "P-3_Complete.csv"
    cached_csv.write_text("fips,year,sex,race7,agerc,perwt\n", encoding="utf-8")
    monkeypatch.setattr(
        dof_p3_downloader,
        "get_most_recent_p3_file",
        Mock(return_value=cached_csv),
    )
    mock_download = Mock()
    monkeypatch.setattr(dof_p3_downloader, "download_file", mock_download)

    # Act
    result = dof_p3_downloader.download_p3_data(
        "https://dof.ca.gov/downloads/P-3_Complete.zip",
        tmp_path,
        {},
        30,
        60,
    )

    # Assert
    assert result == cached_csv
    mock_download.assert_not_called()


def test_download_p3_data_network_failure_without_cache_raises(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(
        dof_p3_downloader,
        "get_most_recent_p3_file",
        Mock(return_value=None),
    )
    monkeypatch.setattr(
        dof_p3_downloader,
        "download_file",
        Mock(side_effect=HTTPDownloadError("download failed")),
    )

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="download failed"):
        dof_p3_downloader.download_p3_data(
            "https://dof.ca.gov/downloads/P-3_Complete.zip",
            tmp_path,
            {},
            30,
            60,
        )


def test_extract_csv_from_zip_extracts_single_csv(tmp_path):
    # Arrange
    zip_path = tmp_path / "P-3_Complete.zip"
    csv_content = "fips,year,sex,race7,agerc,perwt\n6001,2025,MALE,1,0,100\n"
    with ZipFile(zip_path, "w") as archive:
        archive.writestr("P-3_Complete.csv", csv_content)

    # Act
    result = dof_p3_downloader.extract_csv_from_zip(zip_path, tmp_path)

    # Assert
    assert result == tmp_path / "P-3_Complete.csv"
    assert result.read_text(encoding="utf-8") == csv_content


def test_extract_csv_from_zip_without_csv_raises(tmp_path):
    # Arrange
    zip_path = tmp_path / "P-3_Complete.zip"
    with ZipFile(zip_path, "w") as archive:
        archive.writestr("README.txt", "No projection data in this archive.")

    # Act / Assert
    with pytest.raises(ValueError, match="exactly one CSV"):
        dof_p3_downloader.extract_csv_from_zip(zip_path, tmp_path)


def test_extract_csv_from_zip_with_multiple_csvs_raises(tmp_path):
    # Arrange
    zip_path = tmp_path / "P-3_Complete.zip"
    with ZipFile(zip_path, "w") as archive:
        archive.writestr("county.csv", "fips,year\n")
        archive.writestr("state.csv", "fips,year\n")

    # Act / Assert
    with pytest.raises(ValueError, match="exactly one CSV"):
        dof_p3_downloader.extract_csv_from_zip(zip_path, tmp_path)


def test_get_most_recent_p3_file_returns_newest_matching_file(
    tmp_path,
    set_file_age,
):
    # Arrange
    older = tmp_path / "P-3_2024.csv"
    newer = tmp_path / "P-3_2026.csv"
    unrelated = tmp_path / "other.csv"
    older.touch()
    newer.touch()
    unrelated.touch()
    set_file_age(older, 2)
    set_file_age(newer, 1)

    # Act
    result = dof_p3_downloader.get_most_recent_p3_file(
        tmp_path,
        r"P-3_\d{4}\.csv",
        60,
    )

    # Assert
    assert result == newer


def test_get_most_recent_p3_file_ignores_expired_files(tmp_path, set_file_age):
    # Arrange
    expired = tmp_path / "P-3_2024.csv"
    expired.touch()
    set_file_age(expired, 61)

    # Act
    result = dof_p3_downloader.get_most_recent_p3_file(
        tmp_path,
        r"P-3_\d{4}\.csv",
        60,
    )

    # Assert
    assert result is None


"""
========================================================================================================================
CSV Validation
========================================================================================================================
"""


def test_validate_p3_csv_accepts_expected_columns_and_extras(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_Complete.csv"
    csv_path.write_text(
        "fips,year,sex,race7,agerc,perwt,release\n"
        "6001,2025,MALE,1,0,100,2026\n",
        encoding="utf-8",
    )

    # Act / Assert
    dof_p3_downloader.validate_p3_csv(csv_path, EXPECTED_COLUMNS)


def test_validate_p3_csv_reports_missing_columns(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_Complete.csv"
    csv_path.write_text(
        "fips,year,sex,race7,agerc\n6001,2025,MALE,1,0\n",
        encoding="utf-8",
    )

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)missing.*perwt|perwt.*missing"):
        dof_p3_downloader.validate_p3_csv(csv_path, EXPECTED_COLUMNS)
