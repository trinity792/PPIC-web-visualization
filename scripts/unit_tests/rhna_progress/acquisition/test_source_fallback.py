from unittest.mock import Mock

import pandas as pd
import pytest
from scripts.rhna_progress.acquisition import source_fallback


def _paths(tmp_path):
    return {
        "manual_download_path": tmp_path / "RHNAProgress_Downloaded.csv",
        "current_data_path": tmp_path / "RHNAProgress_Current.csv",
    }


def test_acquire_with_fallback_prefers_live_ckan(monkeypatch, tmp_path):
    live_records = [{"cycle": 6, "path": tmp_path / "rhna_progress_6.csv"}]
    monkeypatch.setattr(
        source_fallback,
        "fetch_package_metadata",
        Mock(return_value={"resources": [], "metadata_modified": "2026-07-15T12:00:00"}),
    )
    monkeypatch.setattr(
        source_fallback,
        "enumerate_cycle_resources",
        Mock(return_value=[(6, {"name": "6th Cycle RHNA Progress Report"})]),
    )
    monkeypatch.setattr(
        source_fallback,
        "download_changed_cycles",
        Mock(return_value=live_records),
    )
    monkeypatch.setattr(
        source_fallback,
        "refresh_codebooks_and_details",
        Mock(),
    )

    data, source_failed, used_manual = source_fallback.acquire_with_fallback(
        {},
        _paths(tmp_path),
        {6: "2026-07-01"},
    )

    assert data == live_records
    assert (source_failed, used_manual) == (False, False)


def test_acquire_with_fallback_uses_manual_csv_after_live_failure(
    monkeypatch,
    tmp_path,
):
    paths = _paths(tmp_path)
    paths["manual_download_path"].write_text("Jurisdiction\nALAMEDA\n")
    monkeypatch.setattr(
        source_fallback,
        "fetch_package_metadata",
        Mock(side_effect=RuntimeError("CKAN down")),
    )

    data, source_failed, used_manual = source_fallback.acquire_with_fallback(
        {},
        paths,
        {},
    )

    assert data == paths["manual_download_path"]
    assert (source_failed, used_manual) == (False, True)


def test_acquire_with_fallback_uses_saved_canonical_as_last_resort(
    monkeypatch,
    tmp_path,
):
    paths = _paths(tmp_path)
    saved = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda"],
            "Cycle": [6],
            "Snapshot Date": ["2026-07-01"],
        }
    )
    saved.to_csv(paths["current_data_path"], index=False)
    monkeypatch.setattr(
        source_fallback,
        "fetch_package_metadata",
        Mock(side_effect=RuntimeError("CKAN down")),
    )

    data, source_failed, used_manual = source_fallback.acquire_with_fallback(
        {},
        paths,
        {},
    )

    pd.testing.assert_frame_equal(data, saved)
    assert (source_failed, used_manual) == (True, False)


def test_acquire_with_fallback_raises_when_every_ladder_step_fails(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(
        source_fallback,
        "fetch_package_metadata",
        Mock(side_effect=RuntimeError("CKAN down")),
    )

    with pytest.raises(RuntimeError, match="RHNA Progress"):
        source_fallback.acquire_with_fallback({}, _paths(tmp_path), {})

