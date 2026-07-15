import pandas as pd
import pytest

from scripts.building_permits.output.finalize_dataset import (
    archive_and_save,
    prepare_output,
)

OUTPUT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]

MEASURE_COLUMNS = OUTPUT_COLUMNS[3:]


def _row(
    *,
    date="2026-05",
    level="State",
    location="California",
    total="100",
):
    return {
        "5 Units or More": "25",
        "Location": location,
        "2 Units": "5",
        "Date": date,
        "Total": total,
        "Geographic Level": level,
        "1 Unit": "60",
        "3 and 4 Units": "10",
    }


def _prepared_frame(**row_overrides):
    return prepare_output(
        pd.DataFrame([_row(**row_overrides)]),
        {"output_columns": OUTPUT_COLUMNS},
    )


def test_prepare_output_enforces_contract_column_order():
    source = pd.DataFrame([_row()])
    source["Temporary"] = "drop me"

    result = prepare_output(
        source,
        {"output_columns": OUTPUT_COLUMNS},
    )

    assert list(result.columns) == OUTPUT_COLUMNS
    assert "Temporary" not in result.columns


def test_prepare_output_casts_contract_types():
    result = _prepared_frame()

    assert pd.api.types.is_string_dtype(result["Date"])
    assert all(
        pd.api.types.is_integer_dtype(result[column])
        for column in MEASURE_COLUMNS
    )
    assert result.loc[0, "Date"] == "2026-05"
    assert result.loc[0, "Total"] == 100


def test_prepare_output_sorts_contract_grain():
    source = pd.DataFrame(
        [
            _row(
                date="2026-05",
                level="State",
                location="Texas",
            ),
            _row(
                date="2026-05",
                level="Metro",
                location="San Francisco",
            ),
            _row(
                date="2026-04",
                level="State",
                location="California",
            ),
            _row(
                date="2026-05",
                level="Metro",
                location="Bakersfield",
            ),
        ]
    )

    result = prepare_output(
        source,
        {"output_columns": OUTPUT_COLUMNS},
    )

    assert list(
        result[["Date", "Geographic Level", "Location"]].itertuples(
            index=False,
            name=None,
        )
    ) == [
        ("2026-04", "State", "California"),
        ("2026-05", "Metro", "Bakersfield"),
        ("2026-05", "Metro", "San Francisco"),
        ("2026-05", "State", "Texas"),
    ]


def test_prepare_output_reports_missing_contract_column():
    source = pd.DataFrame([_row()]).drop(columns=["2 Units"])

    with pytest.raises(ValueError, match="2 Units"):
        prepare_output(source, {"output_columns": OUTPUT_COLUMNS})


def test_prepare_output_does_not_mutate_input():
    source = pd.DataFrame([_row()])
    original = source.copy(deep=True)

    prepare_output(source, {"output_columns": OUTPUT_COLUMNS})

    pd.testing.assert_frame_equal(source, original)


def test_archive_and_save_writes_when_current_file_is_missing(tmp_path):
    current_path = (
        tmp_path
        / "cleaned"
        / "building-permits"
        / "BuildingPermits_Current.csv"
    )
    archive_directory = tmp_path / "archive" / "building-permits"
    source = _prepared_frame()

    result = archive_and_save(source, current_path, archive_directory)

    assert result == current_path
    assert current_path.is_file()
    pd.testing.assert_frame_equal(pd.read_csv(current_path), source)
    assert not archive_directory.exists()


def test_archive_and_save_skips_identical_data_without_touching_file(
    tmp_path,
):
    current_path = tmp_path / "BuildingPermits_Current.csv"
    archive_directory = tmp_path / "archive"
    source = _prepared_frame()
    source.to_csv(current_path, index=False)
    original_bytes = current_path.read_bytes()
    original_modified_time = current_path.stat().st_mtime_ns

    result = archive_and_save(source, current_path, archive_directory)

    assert result is None
    assert current_path.read_bytes() == original_bytes
    assert current_path.stat().st_mtime_ns == original_modified_time
    assert not archive_directory.exists()


def test_archive_and_save_archives_prior_file_when_data_changes(tmp_path):
    current_path = tmp_path / "BuildingPermits_Current.csv"
    archive_directory = tmp_path / "archive"
    old = _prepared_frame(date="2026-04", total="90")
    new = _prepared_frame(date="2026-05", total="100")
    old.to_csv(current_path, index=False)

    result = archive_and_save(new, current_path, archive_directory)

    assert result == current_path
    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    pd.testing.assert_frame_equal(pd.read_csv(archives[0]), old)
    pd.testing.assert_frame_equal(pd.read_csv(current_path), new)


def test_archive_and_save_uses_building_permits_timestamp_name(tmp_path):
    current_path = tmp_path / "BuildingPermits_Current.csv"
    archive_directory = tmp_path / "archive"
    _prepared_frame(date="2026-04").to_csv(current_path, index=False)

    archive_and_save(
        _prepared_frame(date="2026-05"),
        current_path,
        archive_directory,
    )

    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    assert archives[0].stem.startswith("BuildingPermits_")
    timestamp = archives[0].stem.removeprefix("BuildingPermits_")
    month, day, year = timestamp.split("-")
    assert len(month) == len(day) == len(year) == 2
    assert month.isdigit() and day.isdigit() and year.isdigit()


def test_archive_and_save_leaves_original_intact_when_write_fails(
    tmp_path,
    monkeypatch,
):
    # The contract file holds the irreplaceable pre-2024 deep history; a crash
    # partway through writing must never truncate it. The atomic write stages into
    # a .tmp file, so a failure before the rename leaves the original untouched.
    current_path = tmp_path / "BuildingPermits_Current.csv"
    archive_directory = tmp_path / "archive"
    original = _prepared_frame(date="2026-04", total="90")
    original.to_csv(current_path, index=False)
    original_bytes = current_path.read_bytes()

    def _boom(_self, _target):
        raise OSError("disk full mid-write")

    monkeypatch.setattr(
        "pathlib.Path.replace",
        _boom,
    )

    with pytest.raises(OSError, match="disk full"):
        archive_and_save(
            _prepared_frame(date="2026-05", total="100"),
            current_path,
            archive_directory,
        )

    assert current_path.read_bytes() == original_bytes
    assert not (tmp_path / "BuildingPermits_Current.csv.tmp").exists()


def test_archive_and_save_does_not_mutate_dataframe(tmp_path):
    source = _prepared_frame()
    original = source.copy(deep=True)

    archive_and_save(
        source,
        tmp_path / "BuildingPermits_Current.csv",
        tmp_path / "archive",
    )

    pd.testing.assert_frame_equal(source, original)
