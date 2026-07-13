import pandas as pd
import pytest
from scripts.projections.output.finalize_dataset import (
    archive_and_save,
    assign_geographic_level,
    prepare_projections_output,
)

OUTPUT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
    "Source",
]


def _geography_config():
    return {
        "california_counties": ["Alameda", "Yuba"],
        "region_names": ["Bay Area", "Far North"],
        "us_state_names": ["California", "Texas", "Nevada"],
    }


def _output_row(location, year):
    return {
        "Source": "DoF P-3",
        "Population": 100,
        "Race/Ethnicity": "White",
        "Sex": "Female",
        "Age Group": "0-4",
        "Year": year,
        "Location": location,
        "Geographic Level": "County",
    }


def test_assign_geographic_level_classifies_all_supported_levels():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": [
                "California",
                "California",
                "Alameda",
                "Bay Area",
                "Texas",
                "Unknown",
            ],
            "Source": [
                "DoF P-3",
                "Census cc-est",
                "DoF P-3",
                "DoF P-3",
                "Census cc-est",
                "DoF P-3",
            ],
        }
    )

    # Act
    result = assign_geographic_level(source, _geography_config())

    # Assert
    assert result["Geographic Level"].tolist() == [
        "State",
        "US State",
        "County",
        "Region",
        "US State",
        "Other",
    ]


def test_assign_geographic_level_does_not_modify_input():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["California", "Alameda"],
            "Source": ["DoF P-3", "DoF P-3"],
        }
    )
    original = source.copy(deep=True)

    # Act
    assign_geographic_level(source, _geography_config())

    # Assert
    pd.testing.assert_frame_equal(source, original)


def test_prepare_projections_output_enforces_contract_column_order():
    # Arrange
    source = pd.DataFrame([_output_row("Alameda", 2025)])

    # Act
    result = prepare_projections_output(
        source,
        {"output_columns": OUTPUT_COLUMNS},
    )

    # Assert
    assert list(result.columns) == OUTPUT_COLUMNS


def test_prepare_projections_output_sorts_rows_and_casts_year():
    # Arrange
    source = pd.DataFrame(
        [
            _output_row("Yuba", "2026"),
            _output_row("Alameda", "2025"),
        ]
    )

    # Act
    result = prepare_projections_output(
        source,
        {"output_columns": OUTPUT_COLUMNS},
    )

    # Assert
    assert result["Location"].tolist() == ["Alameda", "Yuba"]
    assert result["Year"].tolist() == [2025, 2026]
    assert pd.api.types.is_integer_dtype(result["Year"])


def test_prepare_projections_output_reports_missing_contract_columns():
    # Arrange
    source = pd.DataFrame([_output_row("Alameda", 2025)]).drop(
        columns=["Population"]
    )

    # Act / Assert
    with pytest.raises(ValueError, match="Population"):
        prepare_projections_output(source, {"output_columns": OUTPUT_COLUMNS})


"""
========================================================================================================================
Conditional Archival
========================================================================================================================
"""


def test_archive_and_save_writes_when_current_file_is_missing(tmp_path):
    # Arrange
    current_path = tmp_path / "cleaned" / "DemographicProjections_Current.csv"
    archive_directory = tmp_path / "archive"
    source = pd.DataFrame([_output_row("Alameda", 2025)])

    # Act
    result = archive_and_save(source, current_path, archive_directory)

    # Assert
    assert result == current_path
    assert current_path.is_file()
    pd.testing.assert_frame_equal(pd.read_csv(current_path), source)


def test_archive_and_save_skips_byte_identical_dataset(tmp_path):
    # Arrange
    current_path = tmp_path / "DemographicProjections_Current.csv"
    archive_directory = tmp_path / "archive"
    source = pd.DataFrame([_output_row("Alameda", 2025)])
    source.to_csv(current_path, index=False)
    original_bytes = current_path.read_bytes()
    original_modified_time = current_path.stat().st_mtime_ns

    # Act
    result = archive_and_save(source, current_path, archive_directory)

    # Assert
    assert result is None
    assert current_path.read_bytes() == original_bytes
    assert current_path.stat().st_mtime_ns == original_modified_time
    assert not archive_directory.exists()


def test_archive_and_save_archives_old_file_when_data_changes(tmp_path):
    # Arrange
    current_path = tmp_path / "DemographicProjections_Current.csv"
    archive_directory = tmp_path / "archive"
    old = pd.DataFrame([_output_row("Alameda", 2024)])
    new = pd.DataFrame([_output_row("Alameda", 2025)])
    old.to_csv(current_path, index=False)

    # Act
    result = archive_and_save(new, current_path, archive_directory)

    # Assert
    assert result == current_path
    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    pd.testing.assert_frame_equal(pd.read_csv(archives[0]), old)
    pd.testing.assert_frame_equal(pd.read_csv(current_path), new)


def test_archive_and_save_uses_mm_dd_yy_archive_timestamp(tmp_path):
    # Arrange
    current_path = tmp_path / "DemographicProjections_Current.csv"
    archive_directory = tmp_path / "archive"
    pd.DataFrame([_output_row("Alameda", 2024)]).to_csv(
        current_path,
        index=False,
    )

    # Act
    archive_and_save(
        pd.DataFrame([_output_row("Alameda", 2025)]),
        current_path,
        archive_directory,
    )

    # Assert
    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    assert archives[0].stem.startswith("DemographicProjections_Current_")
    timestamp = archives[0].stem.removeprefix(
        "DemographicProjections_Current_"
    )
    month, day, year = timestamp.split("-")
    assert len(month) == len(day) == len(year) == 2
    assert month.isdigit() and day.isdigit() and year.isdigit()


def test_archive_and_save_does_not_modify_dataframe(tmp_path):
    # Arrange
    current_path = tmp_path / "DemographicProjections_Current.csv"
    source = pd.DataFrame([_output_row("Alameda", 2025)])
    original = source.copy(deep=True)

    # Act
    archive_and_save(source, current_path, tmp_path / "archive")

    # Assert
    pd.testing.assert_frame_equal(source, original)


def test_archive_and_save_leaves_no_temp_file(tmp_path):
    # B1: the atomic write stages to a sibling .tmp then os.replace()s it; no
    # temp file may remain after a successful write.
    # Arrange
    current_path = tmp_path / "DemographicProjections_Current.csv"
    source = pd.DataFrame([_output_row("Alameda", 2025)])

    # Act
    archive_and_save(source, current_path, tmp_path / "archive")

    # Assert
    assert list(tmp_path.glob("*.tmp")) == []


def test_archive_and_save_keeps_original_intact_on_write_failure(tmp_path, monkeypatch):
    # B1: a crash mid-write must not corrupt the contract file (which doubles as
    # the next run's history). The prior good copy stays intact and no temp
    # fragment is left behind.
    # Arrange
    import scripts.projections.output.finalize_dataset as finalize

    current_path = tmp_path / "DemographicProjections_Current.csv"
    archive_directory = tmp_path / "archive"
    old = pd.DataFrame([_output_row("Alameda", 2024)])
    new = pd.DataFrame([_output_row("Alameda", 2025)])
    old.to_csv(current_path, index=False)
    original_bytes = current_path.read_bytes()

    def _boom(src, dst):
        raise OSError("simulated crash during replace")

    monkeypatch.setattr(finalize.os, "replace", _boom)

    # Act / Assert
    with pytest.raises(OSError, match="simulated crash"):
        archive_and_save(new, current_path, archive_directory)

    # The original file is untouched and no .tmp fragment survives.
    assert current_path.read_bytes() == original_bytes
    assert list(tmp_path.glob("*.tmp")) == []
