import os
from datetime import datetime

import pandas as pd
import pytest

from scripts.unit_tests.zillow_affordability.helpers import make_paths, write_raw_files
from scripts.zillow_affordability.acquisition import source_fallback
from scripts.zillow_affordability.acquisition.source_fallback import acquire_with_fallback, find_manual_files
from scripts.zillow_affordability.config.sources import get_source_config


def _live_payload(paths):
    files = write_raw_files(paths["download_directory"])
    return {"files": files, "release_date": "2026-11-16"}


def _fail(*args, **kwargs):
    raise RuntimeError("live download failed")


def _saved_table(paths):
    paths["current_data_path"].parent.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame({"Release Date": ["2026-10-15"], "Location": ["Fresno"]})
    frame.to_csv(paths["current_data_path"], index=False)
    return frame


def test_find_manual_files_returns_all_twelve_and_the_newest_file_date(tmp_path):
    paths = make_paths(tmp_path)
    files = write_raw_files(paths["manual_directory"])
    stamp = datetime(2026, 11, 3, 12, 0).timestamp()
    for path in files.values():
        os.utime(path, (stamp, stamp))

    payload = find_manual_files(get_source_config(), paths["manual_directory"])

    assert set(payload["files"]) == set(files)
    assert payload["release_date"] == "2026-11-03"


def test_find_manual_files_names_every_missing_file(tmp_path):
    paths = make_paths(tmp_path)
    files = write_raw_files(paths["manual_directory"])
    files["years_to_save"].unlink()

    with pytest.raises(FileNotFoundError, match="Metro_years_to_save"):
        find_manual_files(get_source_config(), paths["manual_directory"])


def test_live_success_reports_no_fallback(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    monkeypatch.setattr(source_fallback, "download_all_series", lambda config, directory: _live_payload(paths))

    payload, source_failed, used_manual = acquire_with_fallback(get_source_config(), paths)

    assert payload["release_date"] == "2026-11-16"
    assert (source_failed, used_manual) == (False, False)


def test_live_failure_falls_back_to_the_manual_folder(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    write_raw_files(paths["manual_directory"])
    monkeypatch.setattr(source_fallback, "download_all_series", _fail)

    payload, source_failed, used_manual = acquire_with_fallback(get_source_config(), paths)

    assert len(payload["files"]) == 12
    assert all(path.parent == paths["manual_directory"] for path in payload["files"].values())
    assert (source_failed, used_manual) == (False, True)


def test_no_manual_files_falls_back_to_the_saved_table_unchanged(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    saved = _saved_table(paths)
    monkeypatch.setattr(source_fallback, "download_all_series", _fail)

    payload, source_failed, used_manual = acquire_with_fallback(get_source_config(), paths)

    assert isinstance(payload, pd.DataFrame)
    pd.testing.assert_frame_equal(payload, saved)
    assert (source_failed, used_manual) == (True, False)


def test_all_rungs_failing_names_each_rung(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    monkeypatch.setattr(source_fallback, "download_all_series", _fail)

    with pytest.raises(RuntimeError) as caught:
        acquire_with_fallback(get_source_config(), paths)

    message = str(caught.value)
    assert "live" in message and "manual" in message and "saved" in message
    assert "live download failed" in message
