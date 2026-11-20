from scripts.unit_tests.zillow_affordability.helpers import RELEASE_DATE, make_paths, write_raw_files
from scripts.zillow_affordability.cleaning.reshape_series import build_cleaned_dataset
from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config
from scripts.zillow_affordability.merging.historical_merge import (
    detect_new_data,
    load_current_dataset,
    summarize_revisions,
)
from scripts.zillow_affordability.output.finalize_dataset import finalize_dataset


def _built(tmp_path, release_date=RELEASE_DATE, scale=1.0):
    files = write_raw_files(tmp_path / f"raw-{scale}", scale=scale)
    cleaned = build_cleaned_dataset(files, release_date, get_source_config(), get_schema_config())
    return finalize_dataset(cleaned, get_schema_config())


def _saved_and_reloaded(tmp_path, frame):
    paths = make_paths(tmp_path)
    paths["current_data_path"].parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(paths["current_data_path"], index=False)
    return load_current_dataset(paths)


def test_load_current_dataset_returns_none_when_nothing_is_saved(tmp_path):
    assert load_current_dataset(make_paths(tmp_path)) is None


def test_load_current_dataset_keeps_key_columns_as_text(tmp_path):
    reloaded = _saved_and_reloaded(tmp_path, _built(tmp_path))

    assert reloaded["Date"].iloc[0] == "2012-01"
    assert reloaded["Release Date"].iloc[0] == RELEASE_DATE


def test_no_saved_table_is_new_data(tmp_path):
    assert detect_new_data(None, _built(tmp_path), get_schema_config()) is True


def test_the_same_values_reloaded_from_disk_are_not_new_data(tmp_path):
    built = _built(tmp_path)
    reloaded = _saved_and_reloaded(tmp_path, built)

    assert detect_new_data(reloaded, built, get_schema_config()) is False


def test_a_new_release_date_alone_is_not_new_data(tmp_path):
    reloaded = _saved_and_reloaded(tmp_path, _built(tmp_path))

    assert detect_new_data(reloaded, _built(tmp_path, release_date="2026-11-17"), get_schema_config()) is False


def test_revised_values_are_new_data(tmp_path):
    reloaded = _saved_and_reloaded(tmp_path, _built(tmp_path))

    assert detect_new_data(reloaded, _built(tmp_path, scale=1.01), get_schema_config()) is True


def test_an_added_month_is_new_data(tmp_path):
    built = _built(tmp_path)
    reloaded = _saved_and_reloaded(tmp_path, built[built["Date"] != "2012-03"])

    assert detect_new_data(reloaded, built, get_schema_config()) is True


def test_summarize_revisions_separates_added_months_from_revised_cells(tmp_path):
    saved = _built(tmp_path)
    saved = saved[saved["Date"] != "2012-03"]
    revised = _built(tmp_path, scale=1.01)

    diff = summarize_revisions(saved, revised, get_schema_config())

    assert diff["added_periods"] == ["2012-03"]
    assert diff["changed_cells"] > 0
