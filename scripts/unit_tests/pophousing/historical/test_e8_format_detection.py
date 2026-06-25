import pandas as pd
import pytest

from scripts.pophousing.historical.e8_format_detection import (
    NEW_FORMAT,
    OLD_FORMAT,
    detect_e8_file_format,
)


def test_detect_e8_file_format_old_layout_first_column():
    # Arrange
    dataframe = pd.DataFrame([["Alameda", "1990"], ["County Total", "1990"]])

    # Act
    result = detect_e8_file_format(dataframe)

    # Assert
    assert result == OLD_FORMAT


def test_detect_e8_file_format_new_layout_second_column():
    # Arrange
    dataframe = pd.DataFrame([["Alameda", "County Total", "1/1/2011"]])

    # Act
    result = detect_e8_file_format(dataframe)

    # Assert
    assert result == NEW_FORMAT


def test_detect_e8_file_format_defaults_to_new_when_absent():
    # Arrange
    dataframe = pd.DataFrame([["Oakland", "1/1/2011", 100]])

    # Act
    result = detect_e8_file_format(dataframe)

    # Assert
    assert result == NEW_FORMAT


def test_detect_e8_file_format_respects_search_rows():
    # Arrange: County Total sits past the scanned window.
    dataframe = pd.DataFrame(
        [["filler", "x"]] * 3 + [["County Total", "x"]]
    )

    # Act
    result = detect_e8_file_format(dataframe, search_rows=2)

    # Assert
    assert result == NEW_FORMAT


def test_detect_e8_file_format_empty_columns_raises():
    # Act / Assert
    with pytest.raises(ValueError, match="no columns"):
        detect_e8_file_format(pd.DataFrame())
