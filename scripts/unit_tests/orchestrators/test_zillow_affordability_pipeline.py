import os

import pandas as pd
import pytest

from scripts.orchestrators import zillow_affordability_pipeline as pipeline
from scripts.orchestrators.zillow_affordability_pipeline import (
    ZillowAffordabilityPipelinePhaseError,
    build_zillow_affordability_dataset,
)
from scripts.unit_tests.zillow_affordability.helpers import RELEASE_DATE, make_paths, make_raw_frame, write_raw_files


def _serve(monkeypatch, tmp_path, release_date=RELEASE_DATE, scale=1.0, flags=(False, False), overrides=None):
    """Make acquisition return freshly written raw files with the given release date and fallback flags."""
    directory = tmp_path / f"payload-{release_date}-{scale}"
    files = write_raw_files(directory, scale=scale, overrides=overrides)
    payload = {"files": files, "release_date": release_date}
    monkeypatch.setattr(pipeline, "acquire_with_fallback", lambda *args, **kwargs: (payload, *flags))


def _run(paths):
    return build_zillow_affordability_dataset(config={"paths": paths})


def test_first_run_writes_the_table_and_its_release_snapshot(tmp_path, monkeypatch, frozen_archive_clock):
    paths = make_paths(tmp_path)
    _serve(monkeypatch, tmp_path)

    result = _run(paths)

    assert result["new_data"] is True
    assert (result["source_failed"], result["source_used_manual"]) == (False, False)
    assert result["release_date"] == RELEASE_DATE
    assert result["output_path"] == paths["current_data_path"]
    assert result["snapshot_path"].name == "ZillowAffordability_Release_2026-11-16.csv"
    assert result["row_count"] == 27 * 11
    saved = pd.read_csv(paths["current_data_path"])
    assert len(saved) == result["row_count"]


def test_second_run_on_the_same_release_changes_nothing(tmp_path, monkeypatch, frozen_archive_clock):
    paths = make_paths(tmp_path)
    _serve(monkeypatch, tmp_path)
    first = _run(paths)
    current_mtime = os.stat(paths["current_data_path"]).st_mtime_ns
    snapshot_mtime = os.stat(first["snapshot_path"]).st_mtime_ns

    second = _run(paths)

    assert second["new_data"] is False
    assert second["output_path"] is None
    assert second["snapshot_path"] is None
    assert os.stat(paths["current_data_path"]).st_mtime_ns == current_mtime
    assert os.stat(first["snapshot_path"]).st_mtime_ns == snapshot_mtime


def test_a_re_stamped_release_with_identical_values_keeps_the_saved_table(tmp_path, monkeypatch, frozen_archive_clock):
    paths = make_paths(tmp_path)
    _serve(monkeypatch, tmp_path)
    _run(paths)
    before = paths["current_data_path"].read_bytes()

    _serve(monkeypatch, tmp_path, release_date="2026-11-17")
    result = _run(paths)

    assert result["new_data"] is False
    assert paths["current_data_path"].read_bytes() == before
    assert set(result["dataframe"]["Release Date"]) == {RELEASE_DATE}
    assert not list(paths["snapshot_directory"].glob("*2026-11-17*"))


def test_a_revised_release_writes_a_new_snapshot_and_logs_revisions(tmp_path, monkeypatch, frozen_archive_clock):
    paths = make_paths(tmp_path)
    _serve(monkeypatch, tmp_path)
    first = _run(paths)
    first_snapshot = first["snapshot_path"].read_bytes()

    _serve(monkeypatch, tmp_path, release_date="2026-11-17", scale=1.01)
    result = _run(paths)

    assert result["new_data"] is True
    assert result["snapshot_path"].name == "ZillowAffordability_Release_2026-11-17.csv"
    assert first["snapshot_path"].read_bytes() == first_snapshot
    assert result["revisions"]["changed_cells"] > 0
    assert set(pd.read_csv(paths["current_data_path"])["Release Date"]) == {"2026-11-17"}


def test_the_manual_rung_is_cleaned_and_reported(tmp_path, monkeypatch, frozen_archive_clock):
    paths = make_paths(tmp_path)
    _serve(monkeypatch, tmp_path, flags=(False, True))

    result = _run(paths)

    assert result["source_used_manual"] is True
    assert result["new_data"] is True
    assert paths["current_data_path"].exists()


def test_the_saved_table_fallback_is_returned_without_re_cleaning(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    saved = pd.DataFrame({"Release Date": [RELEASE_DATE], "Location": ["Fresno"]})
    monkeypatch.setattr(pipeline, "acquire_with_fallback", lambda *args, **kwargs: (saved, True, False))

    def must_not_clean(*args, **kwargs):
        raise AssertionError("the saved table must not be re-cleaned")

    monkeypatch.setattr(pipeline, "build_cleaned_dataset", must_not_clean)

    result = _run(paths)

    assert result["dataframe"] is saved
    assert result["new_data"] is False
    assert (result["source_failed"], result["source_used_manual"]) == (True, False)
    assert result["output_path"] is None
    assert result["release_date"] == RELEASE_DATE


def test_an_acquisition_failure_is_tagged_with_its_phase(tmp_path, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("every rung failed")

    monkeypatch.setattr(pipeline, "acquire_with_fallback", broken)

    with pytest.raises(ZillowAffordabilityPipelinePhaseError, match="Phase 2 - Acquisition failed: every rung failed"):
        _run(make_paths(tmp_path))


def test_a_source_missing_a_metro_fails_cleaning_and_writes_nothing(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    no_madera = make_raw_frame("years_to_save", ["2012-01-31", "2012-02-29", "2012-03-31"])
    no_madera = no_madera[no_madera["RegionName"] != "Madera, CA"]
    _serve(monkeypatch, tmp_path, overrides={"years_to_save": no_madera})

    with pytest.raises(ZillowAffordabilityPipelinePhaseError, match="Phase 3 - Cleaning"):
        _run(paths)
    assert not paths["current_data_path"].exists()
    assert not paths["snapshot_directory"].exists()


def test_every_run_reminds_reviewers_about_blanked_known_errors(tmp_path, monkeypatch, frozen_archive_clock):
    paths = make_paths(tmp_path)
    _serve(monkeypatch, tmp_path)

    result = _run(paths)

    assert result["known_source_errors"][0]["id"] == "zillow-2013-tax-insurance-spike"
    reminders = [warning for warning in result["warnings"] if warning.startswith("known source error")]
    assert len(reminders) == 1
    assert "Hanford, Santa Rosa, Yuba City" in reminders[0]
    assert "recheck" in reminders[0]


def test_the_reminder_also_appears_when_nothing_changed(tmp_path, monkeypatch, frozen_archive_clock):
    paths = make_paths(tmp_path)
    _serve(monkeypatch, tmp_path)
    _run(paths)

    second = _run(paths)

    assert second["new_data"] is False
    assert any(warning.startswith("known source error") for warning in second["warnings"])
