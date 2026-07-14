from unittest.mock import Mock

import pytest
import requests

from scripts.shared.downloads.http_downloads import HTTPDownloadError, download_file, fetch_response


def _successful_response(content=b"content"):
    response = Mock()
    response.content = content
    response.raise_for_status.return_value = None
    return response


def test_fetch_response_success(monkeypatch):
    # Arrange
    response = _successful_response()
    monkeypatch.setattr(requests, "get", Mock(return_value=response))

    # Act
    result = fetch_response("https://example.com", {}, 30)

    # Assert
    assert result is response


def test_fetch_response_passes_headers(monkeypatch):
    # Arrange
    response = _successful_response()
    mock_get = Mock(return_value=response)
    monkeypatch.setattr(requests, "get", mock_get)
    headers = {"User-Agent": "test-agent"}

    # Act
    fetch_response("https://example.com", headers, 30)

    # Assert
    assert mock_get.call_args.kwargs["headers"] == headers


def test_fetch_response_passes_timeout(monkeypatch):
    # Arrange
    response = _successful_response()
    mock_get = Mock(return_value=response)
    monkeypatch.setattr(requests, "get", mock_get)

    # Act
    fetch_response("https://example.com", {}, 45)

    # Assert
    assert mock_get.call_args.kwargs["timeout"] == 45


def test_fetch_response_http_error(monkeypatch):
    # Arrange
    response = _successful_response()
    response.raise_for_status.side_effect = requests.HTTPError("500 Server Error")
    monkeypatch.setattr(requests, "get", Mock(return_value=response))

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="HTTP request failed.*example.com.*500"):
        fetch_response("https://example.com", {}, 30)


def test_fetch_response_http_error_carries_status_code(monkeypatch):
    response = _successful_response()
    http_error = requests.HTTPError("404 Not Found")
    http_error.response = Mock(status_code=404)
    response.raise_for_status.side_effect = http_error
    monkeypatch.setattr(requests, "get", Mock(return_value=response))

    with pytest.raises(HTTPDownloadError) as exc_info:
        fetch_response("https://example.com", {}, 30)

    assert exc_info.value.status_code == 404


def test_fetch_response_timeout_has_no_status_code(monkeypatch):
    monkeypatch.setattr(requests, "get", Mock(side_effect=requests.Timeout("slow")))

    with pytest.raises(HTTPDownloadError) as exc_info:
        fetch_response("https://example.com", {}, 30)

    assert exc_info.value.status_code is None


def test_fetch_response_connection_error(monkeypatch):
    # Arrange
    monkeypatch.setattr(requests, "get", Mock(side_effect=requests.ConnectionError("offline")))

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="connection failed.*example.com"):
        fetch_response("https://example.com", {}, 30)


def test_fetch_response_timeout_error(monkeypatch):
    # Arrange
    monkeypatch.setattr(requests, "get", Mock(side_effect=requests.Timeout("slow")))

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="timed out.*example.com"):
        fetch_response("https://example.com", {}, 30)


def test_download_file_writes_content(monkeypatch, tmp_path):
    # Arrange
    response = _successful_response(b"workbook")
    monkeypatch.setattr(requests, "get", Mock(return_value=response))
    destination = tmp_path / "file.xlsx"

    # Act
    result = download_file("https://example.com/file.xlsx", destination, {}, 30)

    # Assert
    assert result == destination
    assert destination.read_bytes() == b"workbook"


def test_download_file_creates_parent_directories(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(requests, "get", Mock(return_value=_successful_response()))
    destination = tmp_path / "nested" / "directory" / "file.xlsx"

    # Act
    download_file("https://example.com/file.xlsx", destination, {}, 30)

    # Assert
    assert destination.is_file()


def test_download_file_http_failure(monkeypatch, tmp_path):
    # Arrange
    response = _successful_response()
    response.raise_for_status.side_effect = requests.HTTPError("404")
    monkeypatch.setattr(requests, "get", Mock(return_value=response))
    destination = tmp_path / "file.xlsx"

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="HTTP request failed"):
        download_file("https://example.com/file.xlsx", destination, {}, 30)
    assert not destination.exists()
    assert not (tmp_path / "file.xlsx.part").exists()


def test_download_file_network_error(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(requests, "get", Mock(side_effect=requests.ConnectionError("offline")))
    destination = tmp_path / "file.xlsx"

    # Act / Assert
    with pytest.raises(HTTPDownloadError, match="connection failed"):
        download_file("https://example.com/file.xlsx", destination, {}, 30)
    assert not destination.exists()


def test_download_file_overwrites_existing(monkeypatch, tmp_path):
    # Arrange
    monkeypatch.setattr(requests, "get", Mock(return_value=_successful_response(b"new")))
    destination = tmp_path / "file.xlsx"
    destination.write_bytes(b"old")

    # Act
    download_file("https://example.com/file.xlsx", destination, {}, 30)

    # Assert
    assert destination.read_bytes() == b"new"
