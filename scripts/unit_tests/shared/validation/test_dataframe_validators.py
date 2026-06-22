import numpy as np
import pandas as pd
import pytest

from scripts.shared.validation.dataframe_validators import (
    find_duplicate_rows,
    validate_not_empty,
    validate_null_counts,
    validate_numeric_range,
    validate_required_columns,
)


def test_validate_required_columns_all_present(generic_dataframe):
    # Act
    missing_columns = validate_required_columns(generic_dataframe, ["a", "b"])

    # Assert
    assert missing_columns == []


def test_validate_required_columns_one_missing(generic_dataframe):
    # Act
    missing_columns = validate_required_columns(generic_dataframe, ["a", "c"])

    # Assert
    assert missing_columns == ["c"]


def test_validate_required_columns_multiple_missing(generic_dataframe):
    # Act
    missing_columns = validate_required_columns(generic_dataframe, ["a", "c", "d"])

    # Assert
    assert missing_columns == ["c", "d"]


def test_validate_required_columns_extra_columns_ok(generic_dataframe):
    # Act
    missing_columns = validate_required_columns(generic_dataframe, ["a"])

    # Assert
    assert missing_columns == []


def test_validate_required_columns_empty_dataframe():
    # Arrange
    dataframe = pd.DataFrame(columns=["a", "b"])

    # Act
    missing_columns = validate_required_columns(dataframe, ["a", "b"])

    # Assert
    assert missing_columns == []


def test_validate_required_columns_empty_required_list(generic_dataframe):
    # Act
    missing_columns = validate_required_columns(generic_dataframe, [])

    # Assert
    assert missing_columns == []


def test_find_duplicate_rows_no_duplicates(generic_dataframe):
    # Act
    duplicate_rows = find_duplicate_rows(generic_dataframe, ["a"])

    # Assert
    assert duplicate_rows.empty


def test_find_duplicate_rows_with_duplicates():
    # Arrange
    dataframe = pd.DataFrame({"key": [1, 1, 2], "value": ["a", "a", "b"]})

    # Act
    duplicate_rows = find_duplicate_rows(dataframe, ["key"])

    # Assert
    assert duplicate_rows["key"].tolist() == [1, 1]


def test_find_duplicate_rows_multiple_key_columns():
    # Arrange
    dataframe = pd.DataFrame({"a": [1, 1, 1], "b": [2, 2, 3]})

    # Act
    duplicate_rows = find_duplicate_rows(dataframe, ["a", "b"])

    # Assert
    assert duplicate_rows.index.tolist() == [0, 1]


def test_find_duplicate_rows_single_key_column():
    # Arrange
    dataframe = pd.DataFrame({"a": [1, 2, 2], "b": [1, 2, 3]})

    # Act
    duplicate_rows = find_duplicate_rows(dataframe, ["a"])

    # Assert
    assert duplicate_rows.index.tolist() == [1, 2]


def test_find_duplicate_rows_ignores_non_key_columns():
    # Arrange
    dataframe = pd.DataFrame({"key": [1, 1], "value": ["different", "values"]})

    # Act
    duplicate_rows = find_duplicate_rows(dataframe, ["key"])

    # Assert
    assert len(duplicate_rows) == 2


def test_find_duplicate_rows_missing_key_column(generic_dataframe):
    # Act / Assert
    with pytest.raises(KeyError, match="missing columns.*c"):
        find_duplicate_rows(generic_dataframe, ["c"])


def test_validate_null_counts_no_nulls(generic_dataframe):
    # Act
    null_counts = validate_null_counts(generic_dataframe, ["a", "b"])

    # Assert
    assert null_counts == {}


def test_validate_null_counts_some_nulls():
    # Arrange
    dataframe = pd.DataFrame({"a": [1, None], "b": [None, None]})

    # Act
    null_counts = validate_null_counts(dataframe, ["a", "b"])

    # Assert
    assert null_counts == {"a": 1, "b": 2}


def test_validate_null_counts_all_null_column():
    # Arrange
    dataframe = pd.DataFrame({"a": [None, None], "b": [1, 2]})

    # Act
    null_counts = validate_null_counts(dataframe, ["a"])

    # Assert
    assert null_counts == {"a": 2}


def test_validate_null_counts_nan_vs_none():
    # Arrange
    dataframe = pd.DataFrame({"a": [np.nan, None, 1]})

    # Act
    null_counts = validate_null_counts(dataframe, ["a"])

    # Assert
    assert null_counts == {"a": 2}


def test_validate_null_counts_subset_of_columns():
    # Arrange
    dataframe = pd.DataFrame({"a": [1, 2], "b": [None, None]})

    # Act
    null_counts = validate_null_counts(dataframe, ["a"])

    # Assert
    assert null_counts == {}


def test_validate_not_empty_with_rows(generic_dataframe):
    # Act
    result = validate_not_empty(generic_dataframe)

    # Assert
    assert result is True


def test_validate_not_empty_without_rows():
    # Arrange
    dataframe = pd.DataFrame(columns=["a"])

    # Act
    result = validate_not_empty(dataframe)

    # Assert
    assert result is False


def test_validate_numeric_range_all_within():
    dataframe = pd.DataFrame({"value": [0, 5, 10]})

    result = validate_numeric_range(dataframe, "value", 0, 10, None)

    assert result.empty


def test_validate_numeric_range_below_minimum():
    dataframe = pd.DataFrame({"value": [-1, 0, 1]})

    result = validate_numeric_range(dataframe, "value", 0, 10, None)

    assert result.index.tolist() == [0]


def test_validate_numeric_range_above_maximum():
    dataframe = pd.DataFrame({"value": [9, 10, 11]})

    result = validate_numeric_range(dataframe, "value", 0, 10, None)

    assert result.index.tolist() == [2]


def test_validate_numeric_range_with_mask():
    dataframe = pd.DataFrame({"value": [-1, 5, 11]})
    row_mask = pd.Series([False, True, True], index=dataframe.index)

    result = validate_numeric_range(dataframe, "value", 0, 10, row_mask)

    assert result.index.tolist() == [2]


def test_validate_numeric_range_null_values():
    dataframe = pd.DataFrame({"value": [None, np.nan, 5]})

    result = validate_numeric_range(dataframe, "value", 0, 10, None)

    assert result.empty


@pytest.mark.parametrize(
    ("minimum", "maximum", "expected_indices"),
    [(None, 10, [2]), (0, None, [0])],
)
def test_validate_numeric_range_open_bounds(
    minimum, maximum, expected_indices
):
    dataframe = pd.DataFrame({"value": [-1, 5, 11]})

    result = validate_numeric_range(
        dataframe, "value", minimum, maximum, None
    )

    assert result.index.tolist() == expected_indices


def test_validate_numeric_range_mask_alignment():
    dataframe = pd.DataFrame({"value": [5]}, index=[1])

    with pytest.raises(ValueError, match="row_mask must align"):
        validate_numeric_range(
            dataframe, "value", 0, 10, pd.Series([True], index=[0])
        )
