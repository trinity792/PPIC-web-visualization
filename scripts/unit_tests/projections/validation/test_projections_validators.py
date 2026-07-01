import pandas as pd
from scripts.projections.validation.projections_validators import (
    validate_cleaning_output,
    validate_projections_dataset,
    validate_stratification_completeness,
)

CLEANING_COLUMNS = [
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
]

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
    "Source",
]


def _schema_config():
    cleaning_validation = {
        "required_columns": CLEANING_COLUMNS,
        "key_columns": [
            "Location",
            "Year",
            "Age Group",
            "Sex",
            "Race/Ethnicity",
        ],
        "population_column": "Population",
    }
    return {
        "required_columns": CLEANING_COLUMNS,
        "population_column": "Population",
        "year_column": "Year",
        "location_column": "Location",
        "age_group_column": "Age Group",
        "sex_column": "Sex",
        "race_column": "Race/Ethnicity",
        "canonical_age_groups": ["0-4", "5-9"],
        "canonical_sexes": ["Female", "Male"],
        "canonical_race_groups": ["White", "Black"],
        "cleaning_validation_config": cleaning_validation,
    }


def _cleaning_frame():
    return pd.DataFrame(
        [
            {
                "Location": "Alameda",
                "Year": 2025,
                "Age Group": "0-4",
                "Sex": "Female",
                "Race/Ethnicity": "White",
                "Population": 100,
            }
        ],
        columns=CLEANING_COLUMNS,
    )


def _final_validation_config(**overrides):
    config = {
        "required_columns": CONTRACT_COLUMNS,
        "expected_levels": ["State", "County", "Region", "US State"],
        "year_range": (2020, 2070),
        "min_rows": 1,
        "max_rows": 100,
        "population_column": "Population",
        "duplicate_key_columns": [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Sex",
            "Race/Ethnicity",
            "Source",
        ],
    }
    config.update(overrides)
    return config


def _final_frame():
    rows = []
    for level, location, year in (
        ("State", "California", 2020),
        ("County", "Alameda", 2025),
        ("Region", "Bay Area", 2025),
        ("US State", "Texas", 2070),
    ):
        rows.append(
            {
                "Geographic Level": level,
                "Location": location,
                "Year": year,
                "Age Group": "0-4",
                "Sex": "Female",
                "Race/Ethnicity": "White",
                "Population": 100,
                "Source": "Census cc-est",
            }
        )
    return pd.DataFrame(rows, columns=CONTRACT_COLUMNS)


"""
========================================================================================================================
Cleaning-Stage Validation
========================================================================================================================
"""


def test_validate_cleaning_output_accepts_valid_rows():
    # Act
    is_valid, messages = validate_cleaning_output(
        _cleaning_frame(),
        _schema_config(),
    )

    # Assert
    assert is_valid is True
    assert messages == []


def test_validate_cleaning_output_reports_missing_columns():
    # Arrange
    source = _cleaning_frame().drop(columns=["Population"])

    # Act
    is_valid, messages = validate_cleaning_output(source, _schema_config())

    # Assert
    assert is_valid is False
    assert any("Population" in message for message in messages)


def test_validate_cleaning_output_reports_null_key_values():
    # Arrange
    source = _cleaning_frame()
    source.loc[0, "Location"] = None

    # Act
    is_valid, messages = validate_cleaning_output(source, _schema_config())

    # Assert
    assert is_valid is False
    assert any("null" in message.lower() for message in messages)


def test_validate_cleaning_output_reports_negative_population():
    # Arrange
    source = _cleaning_frame()
    source.loc[0, "Population"] = -1

    # Act
    is_valid, messages = validate_cleaning_output(source, _schema_config())

    # Assert
    assert is_valid is False
    assert any(
        "negative" in message.lower() or "minimum" in message.lower()
        for message in messages
    )


def test_validate_cleaning_output_reports_noncanonical_race():
    # Arrange
    source = _cleaning_frame()
    source.loc[0, "Race/Ethnicity"] = "Unknown"

    # Act
    is_valid, messages = validate_cleaning_output(source, _schema_config())

    # Assert
    assert is_valid is False
    assert any("race" in message.lower() for message in messages)


def test_validate_cleaning_output_reports_noncanonical_age_group():
    # Arrange
    source = _cleaning_frame()
    source.loc[0, "Age Group"] = "Under 18"

    # Act
    is_valid, messages = validate_cleaning_output(source, _schema_config())

    # Assert
    assert is_valid is False
    assert any("age" in message.lower() for message in messages)


"""
========================================================================================================================
Final Dataset Validation
========================================================================================================================
"""


def test_validate_projections_dataset_accepts_valid_dataset():
    # Act
    is_valid, messages = validate_projections_dataset(
        _final_frame(),
        _final_validation_config(),
    )

    # Assert
    assert is_valid is True
    assert messages == []


def test_validate_projections_dataset_reports_missing_columns():
    # Arrange
    source = _final_frame().drop(columns=["Source"])

    # Act
    is_valid, messages = validate_projections_dataset(
        source,
        _final_validation_config(),
    )

    # Assert
    assert is_valid is False
    assert any("Source" in message for message in messages)


def test_validate_projections_dataset_reports_row_count_below_minimum():
    # Act
    is_valid, messages = validate_projections_dataset(
        _final_frame(),
        _final_validation_config(min_rows=5),
    )

    # Assert
    assert is_valid is False
    assert any("row" in message.lower() for message in messages)


def test_validate_projections_dataset_reports_row_count_above_maximum():
    # Act
    is_valid, messages = validate_projections_dataset(
        _final_frame(),
        _final_validation_config(max_rows=3),
    )

    # Assert
    assert is_valid is False
    assert any("row" in message.lower() for message in messages)


def test_validate_projections_dataset_reports_missing_geographic_level():
    # Arrange
    source = _final_frame()
    source = source[source["Geographic Level"].ne("Region")]

    # Act
    is_valid, messages = validate_projections_dataset(
        source,
        _final_validation_config(),
    )

    # Assert
    assert is_valid is False
    assert any("Region" in message for message in messages)


def test_validate_projections_dataset_reports_year_outside_range():
    # Arrange
    source = _final_frame()
    source.loc[source.index[0], "Year"] = 2019

    # Act
    is_valid, messages = validate_projections_dataset(
        source,
        _final_validation_config(),
    )

    # Assert
    assert is_valid is False
    assert any("year" in message.lower() for message in messages)


def test_validate_projections_dataset_reports_duplicate_keys():
    # Arrange
    source = _final_frame()
    source = pd.concat([source, source.iloc[[0]]], ignore_index=True)

    # Act
    is_valid, messages = validate_projections_dataset(
        source,
        _final_validation_config(),
    )

    # Assert
    assert is_valid is False
    assert any("duplicate" in message.lower() for message in messages)


"""
========================================================================================================================
Stratification Completeness
========================================================================================================================
"""


def test_validate_stratification_completeness_accepts_full_matrix():
    # Arrange
    source = pd.DataFrame(
        [
            {
                "Location": "Alameda",
                "Year": 2025,
                "Age Group": age,
                "Sex": sex,
                "Race/Ethnicity": race,
            }
            for age in ("0-4", "5-9")
            for sex in ("Female", "Male")
            for race in ("White", "Black")
        ]
    )

    # Act
    is_valid, messages = validate_stratification_completeness(
        source,
        "Alameda",
        2025,
        _schema_config(),
    )

    # Assert
    assert is_valid is True
    assert messages == []


def test_validate_stratification_completeness_reports_incomplete_matrix():
    # Arrange
    source = pd.DataFrame(
        [
            {
                "Location": "Alameda",
                "Year": 2025,
                "Age Group": "0-4",
                "Sex": "Female",
                "Race/Ethnicity": "White",
            }
        ]
    )

    # Act
    is_valid, messages = validate_stratification_completeness(
        source,
        "Alameda",
        2025,
        _schema_config(),
    )

    # Assert
    assert is_valid is False
    assert any("8" in message for message in messages)
