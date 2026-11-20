import pytest

from scripts.shared.downloads.http_downloads import HTTPDownloadError
from scripts.zillow_affordability.acquisition import zillow_downloader
from scripts.zillow_affordability.acquisition.zillow_downloader import (
    ZillowLinkNotFoundError,
    download_all_series,
    parse_release_date,
)
from scripts.zillow_affordability.config.sources import get_source_config


class _Response:
    def __init__(self, content, last_modified):
        self.content = content
        self.headers = {"Last-Modified": last_modified} if last_modified else {}


def _serve(last_modified_by_key=None, default="Mon, 16 Nov 2026 16:41:44 GMT"):
    """Return a fake fetch_response serving each series' URL with its own Last-Modified."""
    by_url = {item["url"]: item["key"] for item in get_source_config()["series"]}
    last_modified_by_key = last_modified_by_key or {}
    calls = []

    def fake_fetch(url, headers, timeout):
        calls.append(url)
        key = by_url[url]
        return _Response(f"RegionID,{key}\n".encode(), last_modified_by_key.get(key, default))

    return fake_fetch, calls


def test_parse_release_date_reads_an_http_last_modified_header():
    assert parse_release_date("Mon, 16 Nov 2026 16:41:44 GMT") == "2026-11-16"


def test_parse_release_date_rejects_a_missing_or_garbled_header():
    with pytest.raises(ValueError):
        parse_release_date(None)
    with pytest.raises(ValueError):
        parse_release_date("not a date")


def test_download_all_series_writes_every_file_and_returns_paths(tmp_path, monkeypatch):
    fake_fetch, calls = _serve()
    monkeypatch.setattr(zillow_downloader, "fetch_response", fake_fetch)

    payload = download_all_series(get_source_config(), tmp_path)

    assert len(calls) == 12
    assert set(payload["files"]) == {item["key"] for item in get_source_config()["series"]}
    for key, path in payload["files"].items():
        assert path.parent == tmp_path
        assert path.read_text().startswith(f"RegionID,{key}")
    assert not list(tmp_path.glob("*.part"))


def test_release_date_is_the_newest_last_modified_across_files(tmp_path, monkeypatch):
    fake_fetch, _ = _serve({"years_to_save": "Tue, 17 Nov 2026 01:00:00 GMT"})
    monkeypatch.setattr(zillow_downloader, "fetch_response", fake_fetch)

    payload = download_all_series(get_source_config(), tmp_path)

    assert payload["release_date"] == "2026-11-17"


def test_a_404_names_the_moved_series(tmp_path, monkeypatch):
    def not_found(url, headers, timeout):
        raise HTTPDownloadError(f"HTTP request failed for {url}", status_code=404)

    monkeypatch.setattr(zillow_downloader, "fetch_response", not_found)

    with pytest.raises(ZillowLinkNotFoundError, match="mortgage_payment_05"):
        download_all_series(get_source_config(), tmp_path)


def test_a_network_error_propagates_unchanged(tmp_path, monkeypatch):
    def offline(url, headers, timeout):
        raise HTTPDownloadError("HTTP connection failed")

    monkeypatch.setattr(zillow_downloader, "fetch_response", offline)

    with pytest.raises(HTTPDownloadError) as caught:
        download_all_series(get_source_config(), tmp_path)
    assert not isinstance(caught.value, ZillowLinkNotFoundError)
