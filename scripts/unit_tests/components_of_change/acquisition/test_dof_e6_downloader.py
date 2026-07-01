from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.components_of_change.acquisition import dof_e6_downloader
from scripts.components_of_change.acquisition.dof_e6_downloader import E6DiscoveryError
from scripts.components_of_change.config.sources import get_source_settings
from scripts.shared.downloads.http_downloads import HTTPDownloadError

# Current DOF estimates page: E-6 links live in flex-bullet-group lists, not the
# retired et_pb_text_inner body. The current workbook sits behind the `/E-6`
# landing slug; older releases carry a year range in their slug/text.
ESTIMATES_HTML = b"""
<div class="flex-bullet-group">
  <a href="/forecasting/demographics/estimates/E-6">2020-2025</a>
  <a href="/forecasting/demographics/estimates/e-6-...-july-1-1990-2000">1990-2000</a>
</div>
<div class="flex-bullet-group">
  <a href="/forecasting/demographics/estimates/estimates-e6-2010-2019/">2010-2019</a>
</div>
"""
# The `/E-6` landing page exposes a single workbook link.
LANDING_HTML = b"""
<div class="paragraph">
  <a href="files/E-6_Report.xlsx">E-6. Population Estimates and Components of Change</a>
</div>
"""


def _response(content):
    return SimpleNamespace(content=content)


def _mock_fetch(monkeypatch, *responses):
    mock = Mock(side_effect=responses)
    monkeypatch.setattr(dof_e6_downloader, "fetch_response", mock)
    return mock


"""
========================================================================================================================
Helpers: _looks_like_workbook / _landing_slug / _latest_year_in_text
========================================================================================================================
"""


@pytest.mark.parametrize(
    "href,expected",
    [
        ("/media/docs/E-6_Report.xlsx", True),
        ("https://dof.ca.gov/a/b/E-6.xls", True),
        ("/media/docs/E-6_Report.xlsx?v=2", True),
        ("/forecasting/demographics/estimates/E-6", False),
        ("/forecasting/demographics/estimates/", False),
    ],
)
def test_looks_like_workbook(href, expected):
    assert dof_e6_downloader._looks_like_workbook(href) is expected


@pytest.mark.parametrize(
    "href,expected",
    [
        ("/forecasting/demographics/estimates/E-6", "e-6"),
        ("/forecasting/demographics/estimates/E-6/", "e-6"),
        ("https://dof.ca.gov/a/Estimates-E6-2010-2019/", "estimates-e6-2010-2019"),
    ],
)
def test_landing_slug(href, expected):
    assert dof_e6_downloader._landing_slug(href) == expected


def test_latest_year_in_text_returns_max():
    from bs4 import BeautifulSoup

    link = BeautifulSoup(b'<a href="#">2020-2025</a>', "html.parser").find("a")
    assert dof_e6_downloader._latest_year_in_text(link) == 2025


def test_latest_year_in_text_defaults_when_no_year():
    from bs4 import BeautifulSoup

    link = BeautifulSoup(b'<a href="#">E-6</a>', "html.parser").find("a")
    assert dof_e6_downloader._latest_year_in_text(link) == -1


"""
========================================================================================================================
_get_workbook_url_from_landing_page
========================================================================================================================
"""


def test_get_workbook_url_resolves_relative_link(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(LANDING_HTML))

    # Act
    result = dof_e6_downloader._get_workbook_url_from_landing_page(
        "https://dof.ca.gov/landing/", get_source_settings()
    )

    # Assert
    assert result == "https://dof.ca.gov/landing/files/E-6_Report.xlsx"


def test_get_workbook_url_returns_direct_workbook_without_fetch(monkeypatch):
    # Arrange: a landing url that is itself a workbook should not trigger a fetch.
    mock = _mock_fetch(monkeypatch)

    # Act
    result = dof_e6_downloader._get_workbook_url_from_landing_page(
        "https://dof.ca.gov/media/docs/E-6_70-90final.xlsx", get_source_settings()
    )

    # Assert
    assert result == "https://dof.ca.gov/media/docs/E-6_70-90final.xlsx"
    mock.assert_not_called()


def test_get_workbook_url_no_workbook_link_raises(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(b'<div class="paragraph">no workbook here</div>'))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="did not contain a workbook link"):
        dof_e6_downloader._get_workbook_url_from_landing_page(
            "https://dof.ca.gov/landing/", get_source_settings()
        )


"""
========================================================================================================================
get_e6_file_url
========================================================================================================================
"""


def test_get_e6_file_url_follows_current_landing_slug(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(ESTIMATES_HTML), _response(LANDING_HTML))

    # Act
    result = dof_e6_downloader.get_e6_file_url(get_source_settings())

    # Assert: the `/E-6` slug is followed to its landing page, then to the workbook.
    assert result == "https://dof.ca.gov/forecasting/demographics/estimates/files/E-6_Report.xlsx"


def test_get_e6_file_url_no_matching_slug_raises(monkeypatch):
    # Arrange: E-6 links exist, but none uses the canonical `/E-6` landing slug.
    estimates_html = b'<div class="flex-bullet-group"><a href="/estimates/estimates-e6-2010-2019/">2010-2019</a></div>'
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


def test_get_e6_file_url_positional_picks_most_recent(monkeypatch):
    # Arrange: the 2020-2025 link carries the greatest year and should win.
    _mock_fetch(monkeypatch, _response(ESTIMATES_HTML), _response(LANDING_HTML))

    # Act
    result = dof_e6_downloader.get_e6_file_url_positional(get_source_settings())

    # Assert
    assert result.endswith("E-6_Report.xlsx")


def test_get_e6_file_url_positional_no_e6_link_raises(monkeypatch):
    # Arrange
    _mock_fetch(monkeypatch, _response(b'<div class="flex-bullet-group"><a href="/other/">Other</a></div>'))

    # Act / Assert
    with pytest.raises(E6DiscoveryError, match="did not contain an E-6 link"):
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
