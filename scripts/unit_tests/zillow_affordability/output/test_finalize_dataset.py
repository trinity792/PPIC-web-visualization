import os

import pandas as pd
import pytest

from scripts.unit_tests.zillow_affordability.helpers import RELEASE_DATE, make_paths, write_raw_files
from scripts.zillow_affordability.cleaning.reshape_series import build_cleaned_dataset
from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config
from scripts.zillow_affordability.output.finalize_dataset import (
    SnapshotConflictError,
    finalize_dataset,
    snapshot_path_for,
    write_current_dataset,
    write_release_snapshot,
)

SCHEMA = get_schema_config()


@pytest.fixture
def cleaned(tmp_path):
    files = write_raw_files(tmp_path / "raw")
    return build_cleaned_dataset(files, RELEASE_DATE, get_source_config(), SCHEMA)


def test_finalize_orders_columns_and_sorts_by_level_place_scenario_month(cleaned):
    shuffled = cleaned.sample(frac=1, random_state=7)[[*reversed(cleaned.columns)]]

    final = finalize_dataset(shuffled, SCHEMA)

    assert list(final.columns) == SCHEMA["output_columns"]
    assert final.iloc[0][["Geographic Level", "Location", "Housing Scenario", "Date"]].tolist() == [
        "Nation",
        "United States",
        "Buy (5% down)",
        "2012-01",
    ]
    fresno = final[final["Location"] == "Fresno"]
    assert fresno["Housing Scenario"].drop_duplicates().tolist() == SCHEMA["scenario_order"]
    assert final.index.tolist() == list(range(len(final)))


def test_finalize_is_deterministic_regardless_of_input_order(cleaned):
    first = finalize_dataset(cleaned, SCHEMA)
    second = finalize_dataset(cleaned.sample(frac=1, random_state=3), SCHEMA)

    pd.testing.assert_frame_equal(first, second)


def test_finalize_pins_measure_dtypes_to_float(cleaned):
    final = finalize_dataset(cleaned, SCHEMA)

    for column in SCHEMA["measure_columns"]:
        assert final[column].dtype == "float64"


def test_write_current_dataset_writes_then_skips_identical_bytes(tmp_path, cleaned, frozen_archive_clock):
    paths = make_paths(tmp_path)
    final = finalize_dataset(cleaned, SCHEMA)

    assert write_current_dataset(final, paths) == paths["current_data_path"]
    mtime = os.stat(paths["current_data_path"]).st_mtime_ns

    assert write_current_dataset(final, paths) is None
    assert os.stat(paths["current_data_path"]).st_mtime_ns == mtime


def test_write_release_snapshot_writes_once_under_the_release_date(tmp_path, cleaned):
    paths = make_paths(tmp_path)
    final = finalize_dataset(cleaned, SCHEMA)

    written = write_release_snapshot(final, paths)

    assert written == snapshot_path_for(paths, RELEASE_DATE)
    assert written.name == "ZillowAffordability_Release_2026-11-16.csv"
    pd.testing.assert_frame_equal(pd.read_csv(written, dtype={"Date": str}), final, check_dtype=False)


def test_an_identical_existing_snapshot_is_left_alone(tmp_path, cleaned):
    paths = make_paths(tmp_path)
    final = finalize_dataset(cleaned, SCHEMA)
    written = write_release_snapshot(final, paths)
    mtime = os.stat(written).st_mtime_ns

    assert write_release_snapshot(final, paths) is None
    assert os.stat(written).st_mtime_ns == mtime


def test_a_different_snapshot_for_the_same_release_is_never_overwritten(tmp_path, cleaned):
    paths = make_paths(tmp_path)
    final = finalize_dataset(cleaned, SCHEMA)
    written = write_release_snapshot(final, paths)
    original = written.read_bytes()

    changed = final.copy()
    changed["Years to Save"] = changed["Years to Save"] * 2

    with pytest.raises(SnapshotConflictError):
        write_release_snapshot(changed, paths)
    assert written.read_bytes() == original
