import pandas as pd
import pytest
from scripts.rhna_progress.output.finalize_dataset import finalize_dataset, write_dataset

from scripts.unit_tests.rhna_progress.helpers import OUTPUT_COLUMNS, long_frame, long_row, schema_config


def _unordered_frame():
    source = long_frame([long_row()])
    source = source[list(reversed(OUTPUT_COLUMNS))]
    source["Temporary"] = "drop me"
    return source


def test_finalize_dataset_enforces_contract_column_order():
    result = finalize_dataset(_unordered_frame(), schema_config())

    assert list(result.columns) == OUTPUT_COLUMNS
    assert "Temporary" not in result.columns


def test_finalize_dataset_casts_core_contract_types():
    source = _unordered_frame()
    source["Units"] = source["Units"].astype(str)
    source["RHNA"] = source["RHNA"].astype(str)
    source["Percent"] = source["Percent"].astype(str)

    result = finalize_dataset(source, schema_config())

    assert pd.api.types.is_integer_dtype(result["Units"])
    assert pd.api.types.is_integer_dtype(result["RHNA"])
    assert pd.api.types.is_float_dtype(result["Percent"])
    assert pd.api.types.is_bool_dtype(result["Most Recent"])


def test_finalize_dataset_reports_missing_contract_column():
    source = _unordered_frame().drop(columns=["Overall Category"])

    with pytest.raises(ValueError, match="Overall Category"):
        finalize_dataset(source, schema_config())


def test_finalize_dataset_does_not_mutate_input():
    source = _unordered_frame()
    original = source.copy(deep=True)

    finalize_dataset(source, schema_config())

    pd.testing.assert_frame_equal(source, original)


def test_write_dataset_skips_when_no_new_snapshot(tmp_path):
    paths = {
        "current_data_path": tmp_path / "RHNAProgress_Current.csv",
        "archive_directory": tmp_path / "archive",
    }

    result = write_dataset(long_frame(), paths, new_snapshot=False)

    assert result is None
    assert not paths["current_data_path"].exists()
    assert not paths["archive_directory"].exists()


def test_write_dataset_atomically_writes_when_new_snapshot(tmp_path):
    paths = {
        "current_data_path": tmp_path / "cleaned" / "RHNAProgress_Current.csv",
        "archive_directory": tmp_path / "archive",
    }
    source = long_frame()

    result = write_dataset(source, paths, new_snapshot=True)

    assert result == paths["current_data_path"]
    assert paths["current_data_path"].is_file()
    assert not paths["current_data_path"].with_suffix(".csv.tmp").exists()
    assert pd.read_csv(paths["current_data_path"])["Jurisdiction"].tolist() == [
        "Alameda"
    ]


def test_write_dataset_archives_prior_current_file_when_data_changes(tmp_path):
    paths = {
        "current_data_path": tmp_path / "RHNAProgress_Current.csv",
        "archive_directory": tmp_path / "archive",
    }
    old = long_frame([long_row(snapshot_date="2026-07-01", units=10)])
    new = long_frame([long_row(snapshot_date="2026-07-15", units=20)])
    old.to_csv(paths["current_data_path"], index=False)

    result = write_dataset(new, paths, new_snapshot=True)

    assert result == paths["current_data_path"]
    archives = list(paths["archive_directory"].glob("*.csv"))
    assert len(archives) == 1
    assert archives[0].stem.startswith("RHNAProgress_")
    assert pd.read_csv(archives[0])["Units"].tolist() == [10]
    assert pd.read_csv(paths["current_data_path"])["Units"].tolist() == [20]


def test_write_dataset_leaves_original_intact_when_atomic_replace_fails(
    tmp_path,
    monkeypatch,
):
    paths = {
        "current_data_path": tmp_path / "RHNAProgress_Current.csv",
        "archive_directory": tmp_path / "archive",
    }
    original = long_frame([long_row(snapshot_date="2026-07-01", units=10)])
    replacement = long_frame([long_row(snapshot_date="2026-07-15", units=20)])
    original.to_csv(paths["current_data_path"], index=False)
    original_bytes = paths["current_data_path"].read_bytes()

    def _boom(_self, _target):
        raise OSError("disk full")

    monkeypatch.setattr("pathlib.Path.replace", _boom)

    with pytest.raises(OSError, match="disk full"):
        write_dataset(replacement, paths, new_snapshot=True)

    assert paths["current_data_path"].read_bytes() == original_bytes
    assert not paths["current_data_path"].with_suffix(".csv.tmp").exists()

