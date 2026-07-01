import pandas as pd
import pytest
from scripts.projections.cleaning.census_ccest_cleaner import (
    clean_census_estimates,
    parse_ccest_csv,
    rename_ccest_columns,
    reshape_ccest_to_long,
)


def _schema_config():
    return {
        "ccest_expected_columns": [
            "STNAME",
            "CTYNAME",
            "YEAR",
            "AGEGRP",
            "NHWA_MALE",
            "NHWA_FEMALE",
        ],
        "census_rename_map": {
            "CTYNAME": "Location",
            "YEAR": "Year",
            "AGEGRP": "Age Group",
        },
        "census_race_code_map": {
            "NHWA": "White",
            "NHBA": "Black",
            "NHIA": "AIAN",
            "NHAA": "Asian",
            "NHNA": "NHPI",
            "NHTOM": "Multiracial",
            "H": "Hispanic",
        },
        "census_age_group_code_map": {1: "0-4"},
        "sex_label_map": {"MALE": "Male", "FEMALE": "Female"},
        "population_column": "Population",
        "canonical_age_groups": ["0-4"],
        "canonical_sexes": ["Male", "Female"],
        "canonical_race_groups": [
            "White",
            "Black",
            "Asian",
            "NHPI",
            "AIAN",
            "Multiracial",
            "Hispanic",
        ],
        "cleaning_validation_config": {},
    }


def test_parse_ccest_csv_reads_rows_with_valid_headers(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    pd.DataFrame(
        {
            "STNAME": ["California"],
            "CTYNAME": ["Alameda County"],
            "YEAR": [2025],
            "AGEGRP": [1],
            "NHWA_MALE": [10],
            "NHWA_FEMALE": [12],
            "TOT_POP": [22],
        }
    ).to_csv(csv_path, index=False)

    # Act
    result = parse_ccest_csv(csv_path, _schema_config())

    # Assert
    assert len(result) == 1
    assert result.loc[0, "CTYNAME"] == "Alameda County"
    assert "TOT_POP" in result.columns


def test_parse_ccest_csv_reports_missing_headers(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    pd.DataFrame(
        {
            "STNAME": ["California"],
            "CTYNAME": ["Alameda County"],
            "YEAR": [2025],
            "AGEGRP": [1],
            "NHWA_MALE": [10],
        }
    ).to_csv(csv_path, index=False)

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)missing.*NHWA_FEMALE"):
        parse_ccest_csv(csv_path, _schema_config())


def test_rename_ccest_columns_uses_configured_header_map():
    # Arrange
    source = pd.DataFrame(
        {
            "CTYNAME": ["Alameda County"],
            "YEAR": [2025],
            "AGEGRP": [1],
        }
    )

    # Act
    result = rename_ccest_columns(source, _schema_config())

    # Assert
    assert list(result.columns) == ["Location", "Year", "Age Group"]
    assert source.columns.tolist() == ["CTYNAME", "YEAR", "AGEGRP"]


def test_reshape_ccest_to_long_decodes_race_and_sex_columns():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda County"],
            "Year": [2025],
            "Age Group": [1],
            "NHWA_MALE": [10],
            "NHWA_FEMALE": [12],
        }
    )

    # Act
    result = reshape_ccest_to_long(source, _schema_config())

    # Assert
    assert list(result.columns) == [
        "Location",
        "Year",
        "Age Group",
        "Sex",
        "Race/Ethnicity",
        "Population",
    ]
    assert len(result) == 2
    assert set(result["Age Group"]) == {"0-4"}
    assert set(result["Sex"]) == {"Male", "Female"}
    assert set(result["Race/Ethnicity"]) == {"White"}
    assert result["Population"].sum() == 22


def test_rename_ccest_columns_reports_missing_configured_header():
    # Arrange
    source = pd.DataFrame(
        {
            "CTYNAME": ["Alameda County"],
            "YEAR": [2025],
        }
    )

    # Act / Assert
    with pytest.raises(ValueError, match="AGEGRP"):
        rename_ccest_columns(source, _schema_config())


def test_reshape_ccest_to_long_ignores_total_population_columns():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda County"],
            "Year": [2025],
            "Age Group": [1],
            "TOT_POP": [1_000],
            "TOT_MALE": [490],
            "NHWA_MALE": [10],
            "NHWA_FEMALE": [12],
        }
    )

    # Act
    result = reshape_ccest_to_long(source, _schema_config())

    # Assert
    assert len(result) == 2
    assert result["Population"].sum() == 22
    assert set(result["Race/Ethnicity"]) == {"White"}


def test_reshape_ccest_to_long_does_not_modify_input():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda County"],
            "Year": [2025],
            "Age Group": [1],
            "NHWA_MALE": [10],
            "NHWA_FEMALE": [12],
        }
    )
    original = source.copy(deep=True)

    # Act
    reshape_ccest_to_long(source, _schema_config())

    # Assert
    pd.testing.assert_frame_equal(source, original)


def test_clean_census_estimates_produces_canonical_rows(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    pd.DataFrame(
        {
            "STNAME": ["California"],
            "CTYNAME": ["Alameda County"],
            "YEAR": [2025],
            "AGEGRP": [1],
            "NHWA_MALE": [10],
            "NHWA_FEMALE": [12],
        }
    ).to_csv(csv_path, index=False)

    # Act
    result = clean_census_estimates(csv_path, _schema_config())

    # Assert
    assert list(result.columns) == [
        "Location",
        "Year",
        "Age Group",
        "Sex",
        "Race/Ethnicity",
        "Population",
    ]
    assert len(result) == 2
    assert set(result["Age Group"]) == {"0-4"}
    assert set(result["Sex"]) == {"Male", "Female"}
    assert set(result["Race/Ethnicity"]) == {"White"}
    assert result["Population"].sum() == 22


def test_reshape_ccest_to_long_reports_unmapped_race_code():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda County"],
            "Year": [2025],
            "Age Group": [1],
            "UNKNOWN_MALE": [10],
        }
    )

    # Act / Assert
    with pytest.raises(ValueError, match="UNKNOWN"):
        reshape_ccest_to_long(source, _schema_config())


def test_parse_ccest_csv_accepts_header_only_file(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-empty.csv"
    pd.DataFrame(columns=_schema_config()["ccest_expected_columns"]).to_csv(
        csv_path,
        index=False,
    )

    # Act
    result = parse_ccest_csv(csv_path, _schema_config())

    # Assert
    assert result.empty
    assert list(result.columns) == _schema_config()["ccest_expected_columns"]


def test_reshape_ccest_to_long_keeps_years_and_age_groups_separate():
    # Arrange
    config = _schema_config()
    config["census_age_group_code_map"] = {1: "0-4", 2: "5-9"}
    source = pd.DataFrame(
        {
            "Location": ["Alameda County", "Alameda County"],
            "Year": [2024, 2025],
            "Age Group": [1, 2],
            "NHWA_MALE": [10, 20],
            "NHWA_FEMALE": [12, 22],
        }
    )

    # Act
    result = reshape_ccest_to_long(source, config)

    # Assert
    assert result.groupby(["Year", "Age Group"])["Population"].sum().to_dict() == {
        (2024, "0-4"): 22,
        (2025, "5-9"): 42,
    }


def test_clean_census_estimates_standardizes_county_name(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    pd.DataFrame(
        {
            "STNAME": ["California"],
            "CTYNAME": ["Alameda County"],
            "YEAR": [2025],
            "AGEGRP": [1],
            "NHWA_MALE": [10],
            "NHWA_FEMALE": [12],
        }
    ).to_csv(csv_path, index=False)

    # Act
    result = clean_census_estimates(csv_path, _schema_config())

    # Assert
    assert set(result["Location"]) == {"Alameda"}
