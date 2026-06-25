import pandas as pd
import pytest

from scripts.pophousing.historical.e8_schema_normalizer import normalize_e8_columns


def test_normalize_e8_columns_assigns_names():
    # Arrange
    dataframe = pd.DataFrame([[1, 2], [3, 4]])

    # Act
    result = normalize_e8_columns(dataframe, {"column_names": ["Location", "Year"]})

    # Assert
    assert result.columns.tolist() == ["Location", "Year"]


def test_normalize_e8_columns_truncates_surplus_columns():
    # Arrange: E-8 workbooks carry trailing layout columns the schema ignores.
    dataframe = pd.DataFrame([[1, 2, 99], [3, 4, 99]])

    # Act
    result = normalize_e8_columns(dataframe, {"column_names": ["Location", "Year"]})

    # Assert
    assert result.columns.tolist() == ["Location", "Year"]


def test_normalize_e8_columns_too_few_columns_raises():
    # Arrange
    dataframe = pd.DataFrame([[1]])

    # Act / Assert
    with pytest.raises(ValueError, match="at least 2 columns.*found 1"):
        normalize_e8_columns(dataframe, {"column_names": ["Location", "Year"]})


def test_normalize_e8_columns_applies_rename_mapping():
    # Arrange
    dataframe = pd.DataFrame([["Alameda", "Oakland"]])

    # Act
    result = normalize_e8_columns(
        dataframe,
        {
            "column_names": ["Region", "City"],
            "rename_mapping": {"Region": "County", "City": "Location"},
        },
    )

    # Assert
    assert result.columns.tolist() == ["County", "Location"]


def test_normalize_e8_columns_does_not_mutate_input():
    # Arrange
    dataframe = pd.DataFrame([[1, 2]])
    original_columns = dataframe.columns.tolist()

    # Act
    normalize_e8_columns(dataframe, {"column_names": ["a", "b"]})

    # Assert
    assert dataframe.columns.tolist() == original_columns
