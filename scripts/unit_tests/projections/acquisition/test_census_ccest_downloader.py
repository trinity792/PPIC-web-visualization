from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from scripts.projections.acquisition import census_ccest_downloader

from scripts.shared.downloads.http_downloads import HTTPDownloadError

EXPECTED_COLUMNS = [
    "SUMLEV",
    "STATE",
    "COUNTY",
    "STNAME",
    "CTYNAME",
    "YEAR",
    "AGEGRP",
    "NHWA_MALE",
    "NHWA_FEMALE",
    "NHBA_MALE",
    "NHBA_FEMALE",
    "NHIA_MALE",
    "NHIA_FEMALE",
    "NHAA_MALE",
    "NHAA_FEMALE",
    "NHNA_MALE",
    "NHNA_FEMALE",
    "NHTOM_MALE",
    "NHTOM_FEMALE",
    "H_MALE",
    "H_FEMALE",
]

CCEST_LINK_HTML = b"""
<html>
  <body>
    <a href="documentation.pdf">Documentation</a>
    <a href="files/cc-est2025-alldata.csv">County characteristics estimates</a>
  </body>
</html>
"""


def _response(content):
    return SimpleNamespace(content=content, text=content.decode())


"""
========================================================================================================================
URL Discovery
========================================================================================================================
"""


def test_get_census_ccest_url_discovers_csv_and_resolves_relative_url(monkeypatch):
    # Arrange
    mock_fetch = Mock(return_value=_response(CCEST_LINK_HTML))
    monkeypatch.setattr(census_ccest_downloader, "fetch_response", mock_fetch)

    # Act
    result = census_ccest_downloader.get_census_ccest_url(
        "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/",
        {"User-Agent": "test"},
        30,
    )

    # Assert
    assert result == (
        "https://www2.census.gov/programs-surveys/popest/datasets/"
        "2020-2025/files/cc-est2025-alldata.csv"
    )
    mock_fetch.assert_called_once()


def test_get_census_ccest_url_without_matching_csv_raises(monkeypatch):
    # Arrange
    html = b'<html><body><a href="other.csv">Other data</a></body></html>'
    monkeypatch.setattr(
        census_ccest_downloader,
        "fetch_response",
        Mock(return_value=_response(html)),
    )

    # Act / Assert
    with pytest.raises(RuntimeError, match="cc-est"):
        census_ccest_downloader.get_census_ccest_url(
            "https://www2.census.gov/programs-surveys/popest/datasets/",
            {},
            30,
        )


"""
========================================================================================================================
Download and Validation
========================================================================================================================
"""


def test_download_census_ccest_cache_hit_skips_http(monkeypatch, tmp_path):
    # Arrange
    cached_csv = tmp_path / "cc-est2025-alldata.csv"
    cached_csv.write_text(",".join(EXPECTED_COLUMNS) + "\n", encoding="utf-8")
    mock_download = Mock()
    monkeypatch.setattr(census_ccest_downloader, "download_file", mock_download)

    # Act
    result = census_ccest_downloader.download_census_ccest(
        "https://www2.census.gov/cc-est2025-alldata.csv",
        tmp_path,
        {},
        30,
        60,
    )

    # Assert
    assert result == cached_csv
    mock_download.assert_not_called()


def test_download_census_ccest_network_failure_without_cache_raises(
    monkeypatch,
    tmp_path,
):
    # Arrange
    monkeypatch.setattr(
        census_ccest_downloader,
        "download_file",
        Mock(side_effect=HTTPDownloadError("download failed")),
    )

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="download failed"):
        census_ccest_downloader.download_census_ccest(
            "https://www2.census.gov/cc-est2025-alldata.csv",
            tmp_path,
            {},
            30,
            60,
        )


def test_validate_ccest_headers_accepts_expected_columns_and_extras(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est2025-alldata.csv"
    csv_path.write_text(
        ",".join([*EXPECTED_COLUMNS, "UNRELATED_NEW_FIELD"]) + "\n",
        encoding="utf-8",
    )

    # Act / Assert
    census_ccest_downloader.validate_ccest_headers(csv_path, EXPECTED_COLUMNS)


def test_validate_ccest_headers_reports_missing_columns(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est2025-alldata.csv"
    csv_path.write_text(
        ",".join(
            column for column in EXPECTED_COLUMNS if column != "H_FEMALE"
        )
        + "\n",
        encoding="utf-8",
    )

    # Act / Assert
    with pytest.raises(
        ValueError,
        match=r"(?i)missing.*H_FEMALE|H_FEMALE.*missing",
    ):
        census_ccest_downloader.validate_ccest_headers(csv_path, EXPECTED_COLUMNS)
