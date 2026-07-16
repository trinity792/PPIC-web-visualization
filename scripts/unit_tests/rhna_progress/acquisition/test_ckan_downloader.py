import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from scripts.rhna_progress.acquisition import ckan_downloader


def _source_config():
    return {
        "package_id": "ff082e96-72f7-4443-9747-8b8dadc15671",
        "api_base_url": "https://data.ca.gov/api/3/action",
        "resource_name_pattern": r"^(?P<cycle>\d+)(?:st|nd|rd|th) Cycle RHNA Progress Report$",
        "dictionary_name_pattern": r"^(?P<cycle>\d+)(?:st|nd|rd|th) Cycle RHNA Progress Report Data Dictionary$",
        "request_headers": {"User-Agent": "rhna-progress-test"},
        "timeout": 30,
        "retry_attempts": 2,
        "retry_backoff_seconds": 0,
    }


def _response(*, content=b"payload", json_payload=None):
    response = SimpleNamespace(content=content)
    response.raise_for_status = Mock()
    if json_payload is not None:
        response.json = Mock(return_value=json_payload)
    return response


def _resource(name, fmt="CSV", modified="2026-07-15T00:00:00", url=None):
    return {
        "name": name,
        "format": fmt,
        "url": url or f"https://example.test/{name}.csv",
        "last_modified": modified,
    }


def test_fetch_package_metadata_calls_ckan_package_show(monkeypatch):
    payload = {
        "result": {
            "metadata_modified": "2026-07-15T12:00:00",
            "resources": [_resource("6th Cycle RHNA Progress Report")],
        }
    }
    mock_get = Mock(return_value=_response(json_payload=payload))
    monkeypatch.setattr(ckan_downloader.requests, "get", mock_get)

    result = ckan_downloader.fetch_package_metadata(_source_config())

    assert result["metadata_modified"] == "2026-07-15T12:00:00"
    assert result["resources"] == payload["result"]["resources"]
    mock_get.assert_called_once_with(
        "https://data.ca.gov/api/3/action/package_show",
        params={"id": "ff082e96-72f7-4443-9747-8b8dadc15671"},
        headers={"User-Agent": "rhna-progress-test"},
        timeout=30,
    )


def test_fetch_package_metadata_retries_transient_http_failure(monkeypatch):
    success = _response(
        json_payload={
            "result": {
                "metadata_modified": "2026-07-15T12:00:00",
                "resources": [],
            }
        }
    )
    mock_get = Mock(side_effect=[RuntimeError("timeout"), success])
    monkeypatch.setattr(ckan_downloader.requests, "get", mock_get)

    result = ckan_downloader.fetch_package_metadata(_source_config())

    assert result["resources"] == []
    assert mock_get.call_count == 2


def test_fetch_package_metadata_raises_on_hard_failure(monkeypatch):
    monkeypatch.setattr(
        ckan_downloader.requests,
        "get",
        Mock(side_effect=RuntimeError("CKAN unavailable")),
    )

    with pytest.raises(RuntimeError, match="CKAN unavailable"):
        ckan_downloader.fetch_package_metadata(_source_config())


def test_enumerate_cycle_resources_picks_up_future_cycle_and_sorts():
    resources = [
        _resource("6th Cycle RHNA Progress Report"),
        _resource("5th Cycle RHNA Progress Report"),
        _resource("6th Cycle RHNA Progress Report Data Dictionary", fmt="DOCX"),
        _resource("7th Cycle RHNA Progress Report"),
        _resource("Unrelated HCD Resource"),
    ]

    result = ckan_downloader.enumerate_cycle_resources(
        resources,
        _source_config(),
    )

    assert [cycle for cycle, _resource_payload in result] == [5, 6, 7]
    assert [resource["name"] for _cycle, resource in result] == [
        "5th Cycle RHNA Progress Report",
        "6th Cycle RHNA Progress Report",
        "7th Cycle RHNA Progress Report",
    ]


def test_download_changed_cycles_skips_unchanged_and_follows_redirects(
    monkeypatch,
    tmp_path,
):
    resources = [
        (5, _resource("5th Cycle RHNA Progress Report", modified="2026-07-01T00:00:00")),
        (6, _resource("6th Cycle RHNA Progress Report", modified="2026-07-15T00:00:00")),
    ]
    mock_get = Mock(return_value=_response(content=b"Jurisdiction\nALAMEDA\n"))
    monkeypatch.setattr(ckan_downloader.requests, "get", mock_get)
    monkeypatch.setattr(
        ckan_downloader,
        "get_source_config",
        Mock(return_value=_source_config()),
        raising=False,
    )

    result = ckan_downloader.download_changed_cycles(
        resources,
        {5: "2026-07-01", 6: "2026-07-01"},
        {"download_directory": tmp_path},
    )

    assert [(record["cycle"], record["last_modified"]) for record in result] == [
        (6, "2026-07-15T00:00:00")
    ]
    assert result[0]["path"] == tmp_path / "rhna_progress_6.csv"
    assert result[0]["path"].read_bytes() == b"Jurisdiction\nALAMEDA\n"
    mock_get.assert_called_once_with(
        "https://example.test/6th Cycle RHNA Progress Report.csv",
        headers={"User-Agent": "rhna-progress-test"},
        timeout=30,
        allow_redirects=True,
    )


def test_refresh_codebooks_and_details_writes_docx_and_metadata(
    monkeypatch,
    tmp_path,
):
    resources = [
        _resource(
            "5th Cycle RHNA Progress Report Data Dictionary",
            fmt="DOCX",
            url="https://example.test/5.docx",
        ),
        _resource(
            "6th Cycle RHNA Progress Report Data Dictionary",
            fmt="DOCX",
            url="https://example.test/6.docx",
        ),
        _resource("6th Cycle RHNA Progress Report"),
    ]
    mock_get = Mock(side_effect=[_response(content=b"docx-5"), _response(content=b"docx-6")])
    monkeypatch.setattr(ckan_downloader.requests, "get", mock_get)
    monkeypatch.setattr(
        ckan_downloader,
        "get_source_config",
        Mock(return_value=_source_config()),
        raising=False,
    )
    paths = {
        "codebook_directory": tmp_path / "codebooks",
        "details_path": tmp_path / "details" / "RHNAInfo.json",
    }

    ckan_downloader.refresh_codebooks_and_details(
        resources,
        {"metadata_modified": "2026-07-15T12:00:00"},
        paths,
    )

    assert (tmp_path / "codebooks" / "5th-cycle-rhna-progress-report-data-dictionary.docx").read_bytes() == b"docx-5"
    assert (tmp_path / "codebooks" / "6th-cycle-rhna-progress-report-data-dictionary.docx").read_bytes() == b"docx-6"
    details = json.loads((tmp_path / "details" / "RHNAInfo.json").read_text())
    assert details["coverage"] == "California jurisdictions"
    assert details["granularity"] == "Jurisdiction, Cycle, Snapshot Date, Income Level"
    assert details["source_last_updated"] == "2026-07-15T12:00:00"
