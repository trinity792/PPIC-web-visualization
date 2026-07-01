import pandas as pd
import pytest
from scripts.housing_stress.output.finalize_dataset import (
    archive_and_save,
    prepare_output,
)

OUTPUT_COLUMNS = [
    "Year",
    "Geographic Level",
    "Location",
    "Race/Ethnicity",
    "Tenure",
    "Number Over 30%",
    "Number Over 50%",
    "Share Over 30%",
    "Share Over 50%",
]


def _row(
    *,
    year="2023",
    level="County",
    location="Alameda",
    race="All",
    tenure="Total",
    number_30="30",
):
    return {
        "Share Over 50%": "0.15",
        "Tenure": tenure,
        "Location": location,
        "Number Over 30%": number_30,
        "Year": year,
        "Race/Ethnicity": race,
        "Geographic Level": level,
        "Share Over 30%": "0.30",
        "Number Over 50%": "15",
    }


def _prepared_frame(**row_overrides):
    return prepare_output(
        pd.DataFrame([_row(**row_overrides)]),
        {"output_columns": OUTPUT_COLUMNS},
    )


def test_prepare_output_enforces_contract_column_order():
    result = _prepared_frame()

    assert result.columns.tolist() == OUTPUT_COLUMNS


def test_prepare_output_casts_contract_numeric_types():
    result = _prepared_frame()

    assert pd.api.types.is_integer_dtype(result["Year"])
    assert pd.api.types.is_numeric_dtype(result["Number Over 30%"])
    assert pd.api.types.is_numeric_dtype(result["Number Over 50%"])
    assert pd.api.types.is_float_dtype(result["Share Over 30%"])
    assert pd.api.types.is_float_dtype(result["Share Over 50%"])
    assert result.loc[0, "Year"] == 2023
    assert result.loc[0, "Number Over 30%"] == 30


def test_prepare_output_sorts_contract_grain():
    source = pd.DataFrame(
        [
            _row(
                year="2023",
                level="State",
                location="OR",
                race="White",
                tenure="Rented",
            ),
            _row(
                year="2022",
                level="Region",
                location="Bay Area",
                race="All",
                tenure="Total",
            ),
            _row(
                year="2023",
                level="County",
                location="Yuba",
                race="Black",
                tenure="Owned",
            ),
        ]
    )

    result = prepare_output(
        source,
        {"output_columns": OUTPUT_COLUMNS},
    )
    expected = result.sort_values(
        [
            "Year",
            "Geographic Level",
            "Location",
            "Race/Ethnicity",
            "Tenure",
        ],
        ignore_index=True,
    )

    pd.testing.assert_frame_equal(result.reset_index(drop=True), expected)


def test_prepare_output_reports_missing_contract_column():
    source = pd.DataFrame([_row()]).drop(columns="Share Over 50%")

    with pytest.raises(ValueError, match="Share Over 50%"):
        prepare_output(source, {"output_columns": OUTPUT_COLUMNS})


def test_archive_and_save_writes_when_current_file_is_missing(tmp_path):
    current_path = (
        tmp_path
        / "cleaned"
        / "housing-stress"
        / "HousingStress_Current.csv"
    )
    archive_directory = tmp_path / "archive" / "housing-stress"
    source = _prepared_frame()

    result = archive_and_save(source, current_path, archive_directory)

    assert result == current_path
    assert current_path.is_file()
    pd.testing.assert_frame_equal(pd.read_csv(current_path), source)
    assert not archive_directory.exists()


def test_archive_and_save_skips_identical_dataset_without_touching_file(
    tmp_path,
):
    current_path = tmp_path / "HousingStress_Current.csv"
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
    current_path = tmp_path / "HousingStress_Current.csv"
    archive_directory = tmp_path / "archive"
    old = _prepared_frame(year="2022", number_30="20")
    new = _prepared_frame(year="2023", number_30="30")
    old.to_csv(current_path, index=False)

    result = archive_and_save(new, current_path, archive_directory)

    assert result == current_path
    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    pd.testing.assert_frame_equal(pd.read_csv(archives[0]), old)
    pd.testing.assert_frame_equal(pd.read_csv(current_path), new)


def test_archive_and_save_uses_mm_dd_yy_timestamp(tmp_path):
    current_path = tmp_path / "HousingStress_Current.csv"
    archive_directory = tmp_path / "archive"
    _prepared_frame(year="2022").to_csv(current_path, index=False)

    archive_and_save(
        _prepared_frame(year="2023"),
        current_path,
        archive_directory,
    )

    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    assert archives[0].stem.startswith("HousingStress_Current_")
    timestamp = archives[0].stem.removeprefix("HousingStress_Current_")
    month, day, year = timestamp.split("-")
    assert len(month) == len(day) == len(year) == 2
    assert month.isdigit() and day.isdigit() and year.isdigit()
