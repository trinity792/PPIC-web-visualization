import pandas as pd
import pytest
from scripts.projections.cleaning.dof_p3_cleaner import (
    bin_single_year_ages,
    clean_p3_projections,
    map_fips_to_county,
    standardize_sex_labels,
)

GROUPBY_COLUMNS = ["Location", "Year", "Sex", "Race/Ethnicity"]
AGE_BIN_EDGES = list(range(0, 90, 5))


"""
========================================================================================================================
Column Mapping
========================================================================================================================
"""


def test_map_fips_to_county_maps_codes_and_renames_column():
    # Arrange
    source = pd.DataFrame(
        {
            "fips": [6001, 6115],
            "year": [2025, 2025],
        }
    )

    # Act
    result = map_fips_to_county(
        source,
        "fips",
        {6001: "Alameda", 6115: "Yuba"},
    )

    # Assert
    assert result["Location"].tolist() == ["Alameda", "Yuba"]
    assert "fips" not in result.columns
    assert source.columns.tolist() == ["fips", "year"]


def test_map_fips_to_county_reports_every_unmapped_code():
    # Arrange
    source = pd.DataFrame({"fips": [6001, 9997, 9999]})

    # Act / Assert
    with pytest.raises(ValueError, match=r"9997.*9999|9999.*9997"):
        map_fips_to_county(source, "fips", {6001: "Alameda"})


def test_standardize_sex_labels_maps_values_and_renames_column():
    # Arrange
    source = pd.DataFrame({"sex": ["MALE", "FEMALE"]})

    # Act
    result = standardize_sex_labels(
        source,
        "sex",
        {"MALE": "Male", "FEMALE": "Female"},
    )

    # Assert
    assert result["Sex"].tolist() == ["Male", "Female"]
    assert "sex" not in result.columns
    assert source["sex"].tolist() == ["MALE", "FEMALE"]


"""
========================================================================================================================
Age Binning
========================================================================================================================
"""


def test_bin_single_year_ages_sums_population_within_five_year_groups():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda"] * 4,
            "Year": [2025] * 4,
            "Sex": ["Female"] * 4,
            "Race/Ethnicity": ["Asian"] * 4,
            "agerc": [0, 1, 4, 5],
            "perwt": [10, 20, 30, 40],
        }
    )

    # Act
    result = bin_single_year_ages(
        source,
        "agerc",
        "perwt",
        AGE_BIN_EDGES,
        GROUPBY_COLUMNS,
    )

    # Assert
    populations = result.set_index("Age Group")["perwt"].to_dict()
    assert populations["0-4"] == 60
    assert populations["5-9"] == 40
    assert "agerc" not in result.columns


def test_bin_single_year_ages_collapses_ages_85_through_110():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Yuba"] * 4,
            "Year": [2070] * 4,
            "Sex": ["Male"] * 4,
            "Race/Ethnicity": ["White"] * 4,
            "agerc": [85, 86, 100, 110],
            "perwt": [1, 2, 3, 4],
        }
    )

    # Act
    result = bin_single_year_ages(
        source,
        "agerc",
        "perwt",
        AGE_BIN_EDGES,
        GROUPBY_COLUMNS,
    )

    # Assert
    assert result["Age Group"].tolist() == ["85+"]
    assert result["perwt"].tolist() == [10]


def test_bin_single_year_ages_keeps_demographic_groups_separate():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda", "Alameda"],
            "Year": [2025, 2025],
            "Sex": ["Male", "Female"],
            "Race/Ethnicity": ["Black", "Black"],
            "agerc": [1, 1],
            "perwt": [20, 30],
        }
    )

    # Act
    result = bin_single_year_ages(
        source,
        "agerc",
        "perwt",
        AGE_BIN_EDGES,
        GROUPBY_COLUMNS,
    )

    # Assert
    assert len(result) == 2
    assert result.groupby("Sex")["perwt"].sum().to_dict() == {
        "Female": 30,
        "Male": 20,
    }


def test_bin_single_year_ages_places_84_and_85_in_different_groups():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Yuba", "Yuba"],
            "Year": [2070, 2070],
            "Sex": ["Female", "Female"],
            "Race/Ethnicity": ["Hispanic", "Hispanic"],
            "agerc": [84, 85],
            "perwt": [8, 5],
        }
    )

    # Act
    result = bin_single_year_ages(
        source,
        "agerc",
        "perwt",
        AGE_BIN_EDGES,
        GROUPBY_COLUMNS,
    )

    # Assert
    assert result.set_index("Age Group")["perwt"].to_dict() == {
        "80-84": 8,
        "85+": 5,
    }


"""
========================================================================================================================
Entry Point
========================================================================================================================
"""


def _schema_config():
    return {
        "p3_raw_columns": ["fips", "year", "sex", "race7", "agerc", "perwt"],
        "p3_year_range": (2020, 2070),
        "p3_age_range": (0, 110),
        "fips_to_county_map": {6001: "Alameda"},
        "p3_race7_code_map": {
            1: "White",
            2: "Black",
            3: "AIAN",
            4: "Asian",
            5: "NHPI",
            6: "Multiracial",
            7: "Hispanic",
        },
        "sex_label_map": {"MALE": "Male", "FEMALE": "Female"},
        "age_bin_edges": AGE_BIN_EDGES,
        "canonical_age_groups": [
            "0-4",
            "5-9",
            "10-14",
            "15-19",
            "20-24",
            "25-29",
            "30-34",
            "35-39",
            "40-44",
            "45-49",
            "50-54",
            "55-59",
            "60-64",
            "65-69",
            "70-74",
            "75-79",
            "80-84",
            "85+",
        ],
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


def test_clean_p3_projections_produces_expected_rows(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    pd.DataFrame(
        {
            "fips": [6001, 6001, 6001, 6001],
            "year": [2025, 2025, 2025, 2025],
            "sex": ["FEMALE", "FEMALE", "FEMALE", "FEMALE"],
            "race7": [4, 4, 4, 4],
            "agerc": [0, 4, 5, 110],
            "perwt": [10, 20, 30, 40],
        }
    ).to_csv(csv_path, index=False)

    # Act
    result = clean_p3_projections(csv_path, _schema_config())

    # Assert
    assert list(result.columns) == [
        "Geographic Level",
        "Location",
        "Year",
        "Sex",
        "Race/Ethnicity",
        "Age Group",
        "Population",
    ]
    assert len(result) == 3
    assert result.set_index("Age Group")["Population"].to_dict() == {
        "0-4": 30,
        "5-9": 30,
        "85+": 40,
    }
    assert set(result["Geographic Level"]) == {"County"}
    assert set(result["Location"]) == {"Alameda"}
    assert set(result["Sex"]) == {"Female"}
    assert set(result["Race/Ethnicity"]) == {"Asian"}


def test_clean_p3_projections_accepts_and_drops_unrelated_extra_columns(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    pd.DataFrame(
        {
            "fips": [6001],
            "year": [2025],
            "sex": ["MALE"],
            "race7": [1],
            "agerc": [0],
            "perwt": [10],
            "release": ["Vintage 2026"],
            "notes": ["unrelated metadata"],
        }
    ).to_csv(csv_path, index=False)

    # Act
    result = clean_p3_projections(csv_path, _schema_config())

    # Assert
    assert result.loc[0, "Population"] == 10
    assert "release" not in result.columns
    assert "notes" not in result.columns


def test_clean_p3_projections_rejects_duplicate_required_column(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    csv_path.write_text(
        "fips,year,sex,race7,agerc,perwt,perwt\n"
        "6001,2025,MALE,1,0,10,999\n",
        encoding="utf-8",
    )

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)duplicate.*perwt|perwt.*duplicate"):
        clean_p3_projections(csv_path, _schema_config())


def test_clean_p3_projections_rejects_unmapped_sex_values(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    pd.DataFrame(
        {
            "fips": [6001],
            "year": [2025],
            "sex": ["UNKNOWN"],
            "race7": [1],
            "agerc": [0],
            "perwt": [10],
        }
    ).to_csv(csv_path, index=False)

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)sex.*UNKNOWN|UNKNOWN.*sex"):
        clean_p3_projections(csv_path, _schema_config())


def test_map_fips_to_county_preserves_non_fips_columns():
    # Arrange
    source = pd.DataFrame(
        {
            "fips": [6001],
            "year": [2025],
            "population": [100],
        }
    )

    # Act
    result = map_fips_to_county(source, "fips", {6001: "Alameda"})

    # Assert
    assert result.loc[0, "year"] == 2025
    assert result.loc[0, "population"] == 100


def test_map_fips_to_county_accepts_numeric_string_codes():
    # Arrange
    source = pd.DataFrame({"fips": ["6001"]})

    # Act
    result = map_fips_to_county(source, "fips", {6001: "Alameda"})

    # Assert
    assert result["Location"].tolist() == ["Alameda"]


def test_standardize_sex_labels_reports_unmapped_values():
    # Arrange
    source = pd.DataFrame({"sex": ["MALE", "UNKNOWN"]})

    # Act / Assert
    with pytest.raises(ValueError, match="UNKNOWN"):
        standardize_sex_labels(
            source,
            "sex",
            {"MALE": "Male", "FEMALE": "Female"},
        )


def test_standardize_sex_labels_reports_missing_column():
    # Arrange
    source = pd.DataFrame({"gender": ["MALE"]})

    # Act / Assert
    with pytest.raises((KeyError, ValueError), match="sex"):
        standardize_sex_labels(
            source,
            "sex",
            {"MALE": "Male", "FEMALE": "Female"},
        )


def test_bin_single_year_ages_does_not_modify_input():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda"],
            "Year": [2025],
            "Sex": ["Female"],
            "Race/Ethnicity": ["White"],
            "agerc": [0],
            "perwt": [10],
        }
    )
    original = source.copy(deep=True)

    # Act
    bin_single_year_ages(
        source,
        "agerc",
        "perwt",
        AGE_BIN_EDGES,
        GROUPBY_COLUMNS,
    )

    # Assert
    pd.testing.assert_frame_equal(source, original)


def test_bin_single_year_ages_keeps_years_and_races_separate():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda", "Alameda", "Alameda"],
            "Year": [2025, 2026, 2026],
            "Sex": ["Female", "Female", "Female"],
            "Race/Ethnicity": ["White", "White", "Black"],
            "agerc": [0, 0, 0],
            "perwt": [10, 20, 30],
        }
    )

    # Act
    result = bin_single_year_ages(
        source,
        "agerc",
        "perwt",
        AGE_BIN_EDGES,
        GROUPBY_COLUMNS,
    )

    # Assert
    assert len(result) == 3
    assert result.groupby(["Year", "Race/Ethnicity"])["perwt"].sum().to_dict() == {
        (2025, "White"): 10,
        (2026, "Black"): 30,
        (2026, "White"): 20,
    }


def test_bin_single_year_ages_preserves_integer_population_dtype():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda", "Alameda"],
            "Year": [2025, 2025],
            "Sex": ["Female", "Female"],
            "Race/Ethnicity": ["White", "White"],
            "agerc": [0, 1],
            "perwt": [10, 20],
        }
    )

    # Act
    result = bin_single_year_ages(
        source,
        "agerc",
        "perwt",
        AGE_BIN_EDGES,
        GROUPBY_COLUMNS,
    )

    # Assert
    assert pd.api.types.is_integer_dtype(result["perwt"])


def test_clean_p3_projections_rejects_unmapped_fips(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    pd.DataFrame(
        {
            "fips": [9999],
            "year": [2025],
            "sex": ["MALE"],
            "race7": [1],
            "agerc": [0],
            "perwt": [10],
        }
    ).to_csv(csv_path, index=False)

    # Act / Assert
    with pytest.raises(ValueError, match="9999"):
        clean_p3_projections(csv_path, _schema_config())


def test_clean_p3_projections_rejects_unmapped_race_code(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    pd.DataFrame(
        {
            "fips": [6001],
            "year": [2025],
            "sex": ["MALE"],
            "race7": [99],
            "agerc": [0],
            "perwt": [10],
        }
    ).to_csv(csv_path, index=False)

    # Act / Assert
    with pytest.raises(ValueError, match="99"):
        clean_p3_projections(csv_path, _schema_config())


def test_clean_p3_projections_reports_missing_required_column(tmp_path):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    pd.DataFrame(
        {
            "fips": [6001],
            "year": [2025],
            "sex": ["MALE"],
            "race7": [1],
            "agerc": [0],
        }
    ).to_csv(csv_path, index=False)

    # Act / Assert
    with pytest.raises(ValueError, match="perwt"):
        clean_p3_projections(csv_path, _schema_config())


@pytest.mark.parametrize(
    ("column", "invalid_value", "message"),
    [
        ("year", 2019, "year"),
        ("agerc", 111, "agerc|age"),
        ("perwt", -1, "perwt|population"),
        ("perwt", 1.5, "perwt|population|integer"),
        ("perwt", None, "perwt|population|null|missing"),
    ],
)
def test_clean_p3_projections_rejects_semantically_invalid_required_values(
    tmp_path,
    column,
    invalid_value,
    message,
):
    # Arrange
    csv_path = tmp_path / "P-3_fixture.csv"
    row = {
        "fips": 6001,
        "year": 2025,
        "sex": "MALE",
        "race7": 1,
        "agerc": 0,
        "perwt": 10,
    }
    row[column] = invalid_value
    pd.DataFrame([row]).to_csv(csv_path, index=False)

    # Act / Assert
    with pytest.raises(ValueError, match=rf"(?i){message}"):
        clean_p3_projections(csv_path, _schema_config())
