from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest
from bs4 import BeautifulSoup

from scripts.components_of_change.acquisition import dof_e6_downloader
from scripts.components_of_change.acquisition.dof_e6_downloader import E6DiscoveryError
from scripts.components_of_change.config.sources import get_source_settings
from scripts.shared.downloads.http_downloads import HTTPDownloadError

ESTIMATES_HTML = b"""
<div class="et_pb_text_inner">
  <a href="/forecasting/demographics/estimates/e-6/">E-6 Population Estimates</a>
</div>
"""
LANDING_HTML = b"""
<div class="et_pb_text_inner">
  <ul><li><a href="files/E-6_Report.xlsx">Workbook</a></li></ul>
</div>
"""

# Seven direct-child <ul> elements; the seventh holds the E-6 landing link.
POSITIONAL_HTML = (
    b'<div class="et_pb_text_inner">'
    + b"<ul><li>one</li></ul>" * 6
    + b'<ul><li><a href="/forecasting/demographics/estimates/e-6/">E-6</a></li></ul>'
    + b"</div>"
)


def _response(content):
    return SimpleNamespace(content=content)


def _mock_fetch(monkeypatch, *responses):
    mock = Mock(side_effect=responses)
    monkeypatch.setattr(dof_e6_downloader, "fetch_response", mock)
    return mock


"""
========================================================================================================================
Helpers: _first_text_inner / _get_workbook_url_from_landing_page
========================================================================================================================
"""


def test_first_text_inner_returns_body():
    # Arrange
    soup = BeautifulSoup(ESTIMATES_HTML, "html.parser")

    # Act
    body = dof_e6_downloader._first_text_inner(soup)

    # Assert
    assert body.get("class") == ["et_pb_text_inner"]


def test_first_text_inner_missing_body_raises():
    # Arrange
    soup = BeautifulSoup(b"<div>no body</div>", "html.parser")

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="et_pb_text_inner body"):
        dof_e6_downloader._first_text_inner(soup)


def test_get_workbook_url_resolves_relative_link(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(LANDING_HTML))

    # Act
    result = dof_e6_downloader._get_workbook_url_from_landing_page(
        "https://dof.ca.gov/landing/", get_source_settings()
    )

    # Assert
    assert result == "https://dof.ca.gov/landing/files/E-6_Report.xlsx"


def test_get_workbook_url_no_text_body_raises(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(b"<div>nothing</div>"))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="did not contain workbook links"):
        dof_e6_downloader._get_workbook_url_from_landing_page(
            "https://dof.ca.gov/landing/", get_source_settings()
        )


def test_get_workbook_url_no_list_raises(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(b'<div class="et_pb_text_inner">no list</div>'))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="did not contain a workbook list"):
        dof_e6_downloader._get_workbook_url_from_landing_page(
            "https://dof.ca.gov/landing/", get_source_settings()
        )


def test_get_workbook_url_list_without_link_raises(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(b'<div class="et_pb_text_inner"><ul><li>no link</li></ul></div>'))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="did not contain a link"):
        dof_e6_downloader._get_workbook_url_from_landing_page(
            "https://dof.ca.gov/landing/", get_source_settings()
        )


"""
========================================================================================================================
get_e6_file_url
========================================================================================================================
"""


def test_get_e6_file_url_normal_page(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(ESTIMATES_HTML), _response(LANDING_HTML))

    # Act
    result = dof_e6_downloader.get_e6_file_url(get_source_settings())

    # Assert
    assert result == "https://dof.ca.gov/forecasting/demographics/estimates/e-6/files/E-6_Report.xlsx"


def test_get_e6_file_url_matches_uppercase_href(monkeypatch):
    # Arrange: link selection is case-insensitive on the href.
    estimates_html = ESTIMATES_HTML.replace(b"/e-6/", b"/E6-report/")
    _mock_fetch(monkeypatch, _response(estimates_html), _response(LANDING_HTML))

    # Act
    result = dof_e6_downloader.get_e6_file_url(get_source_settings())

    # Assert
    assert result.endswith("E-6_Report.xlsx")


def test_get_e6_file_url_no_matching_link_raises(monkeypatch):
    # Arrange
    estimates_html = b'<div class="et_pb_text_inner"><a href="/other/">Other</a></div>'
    _mock_fetch(monkeypatch, _response(estimates_html))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="Could not find E-6 landing page link"):
        dof_e6_downloader.get_e6_file_url(get_source_settings())


def test_get_e6_file_url_propagates_fetch_failure(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, HTTPDownloadError("connection failed"))

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="connection failed"):
        dof_e6_downloader.get_e6_file_url(get_source_settings())


"""
========================================================================================================================
get_e6_file_url_positional
========================================================================================================================
"""


def test_get_e6_file_url_positional_uses_seventh_list(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(POSITIONAL_HTML), _response(LANDING_HTML))

    # Act
    result = dof_e6_downloader.get_e6_file_url_positional(get_source_settings())

    # Assert
    assert result.endswith("E-6_Report.xlsx")


def test_get_e6_file_url_positional_too_few_lists_raises(monkeypatch):
    # Arrange: only three direct-child lists, not the required seven.
    html = b'<div class="et_pb_text_inner">' + b"<ul><li>x</li></ul>" * 3 + b"</div>"
    _mock_fetch(monkeypatch, _response(html))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="seventh list"):
        dof_e6_downloader.get_e6_file_url_positional(get_source_settings())


def test_get_e6_file_url_positional_seventh_list_without_link_raises(monkeypatch):
    # Arrange: seven lists, but the seventh has no anchor.
    html = b'<div class="et_pb_text_inner">' + b"<ul><li>x</li></ul>" * 7 + b"</div>"
    _mock_fetch(monkeypatch, _response(html))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="did not contain a link"):
        dof_e6_downloader.get_e6_file_url_positional(get_source_settings())


"""
========================================================================================================================
download_e6_workbook
========================================================================================================================
"""


def _mock_excel(monkeypatch, sheet_names, frame):
    excel_file = Mock()
    excel_file.sheet_names = sheet_names
    monkeypatch.setattr(dof_e6_downloader, "fetch_response", Mock(return_value=_response(b"bytes")))
    monkeypatch.setattr(dof_e6_downloader.pd, "ExcelFile", Mock(return_value=excel_file))
    mock_read = Mock(return_value=frame)
    monkeypatch.setattr(dof_e6_downloader.pd, "read_excel", mock_read)
    return excel_file, mock_read


def test_download_e6_workbook_reads_default_second_sheet(monkeypatch):
    # Arrange
    expected = pd.DataFrame({"Location": ["California"]})
    excel_file, mock_read = _mock_excel(monkeypatch, ["Cover", "Data"], expected)

    # Act
    result = dof_e6_downloader.download_e6_workbook("https://dof.ca.gov/E-6.xlsx", {}, 30)

    # Assert
    mock_read.assert_called_once_with(excel_file, sheet_name="Data")
    pd.testing.assert_frame_equal(result, expected)


def test_download_e6_workbook_respects_sheet_index(monkeypatch):
    # Arrange
    excel_file, mock_read = _mock_excel(monkeypatch, ["A", "B", "C"], pd.DataFrame({"x": [1]}))

    # Act
    dof_e6_downloader.download_e6_workbook("https://dof.ca.gov/E-6.xlsx", {}, 30, sheet_index=2)

    # Assert
    assert mock_read.call_args.kwargs["sheet_name"] == "C"


def test_download_e6_workbook_sheet_index_out_of_range_raises(monkeypatch):
    # Arrange: only one sheet, default index 1 is out of range.
    _mock_excel(monkeypatch, ["OnlySheet"], pd.DataFrame())

    # Act / Assert
    with pytest.raises(IndexError, match="outside workbook sheet range"):
        dof_e6_downloader.download_e6_workbook("https://dof.ca.gov/E-6.xlsx", {}, 30)
