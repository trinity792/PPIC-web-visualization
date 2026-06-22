import pandas as pd
import pytest

from scripts.shared.data_cleaning.row_filters import (
    drop_empty_rows_without_data,
    filter_year_range,
    remove_header_like_rows,
    remove_summary_rows,
)


def test_filter_year_range_minimum_only():
    dataframe = pd.DataFrame({"year": [2019, 2020, 2021]})

    result = filter_year_range(dataframe, "year", 2020, None)

    assert result["year"].tolist() == [2020, 2021]


def test_filter_year_range_minimum_and_maximum():
    dataframe = pd.DataFrame({"year": [2019, 2020, 2021, 2022]})

    result = filter_year_range(dataframe, "year", 2020, 2021)

    assert result["year"].tolist() == [2020, 2021]


def test_filter_year_range_missing_column():
    with pytest.raises(KeyError, match="missing column.*year"):
        filter_year_range(pd.DataFrame({"other": [1]}), "year", 2020, None)


def test_filter_year_range_invalid_bounds():
    with pytest.raises(ValueError, match="min_year cannot exceed max_year"):
        filter_year_range(pd.DataFrame({"year": [2020]}), "year", 2021, 2020)


def test_remove_summary_rows_patterns_and_keep_values():
    dataframe = pd.DataFrame({"name": ["Balance", "Total", "Keep Total", "Record"]})

    result = remove_summary_rows(dataframe, "name", {"Keep Total"}, [r"Balance", r"Total"])

    assert result["name"].tolist() == ["Keep Total", "Record"]


def test_remove_summary_rows_without_patterns():
    dataframe = pd.DataFrame({"name": ["a", "b"]})

    result = remove_summary_rows(dataframe, "name", set())

    assert result.equals(dataframe)


def test_remove_header_like_rows_multiple_patterns():
    dataframe = pd.DataFrame({"name": ["HEADER", "Column Names", "Record"]})

    result = remove_header_like_rows(dataframe, "name", [r"^HEADER$", r"Column"])

    assert result["name"].tolist() == ["Record"]


def test_drop_empty_rows_without_data_removes_empty_zero_row():
    dataframe = pd.DataFrame({"name": [None, "Record"], "a": [0, 0], "b": [0, 0]})

    result = drop_empty_rows_without_data(dataframe, "name", ["a", "b"])

    assert result["name"].tolist() == ["Record"]


def test_drop_empty_rows_without_data_keeps_empty_row_with_data():
    dataframe = pd.DataFrame({"name": [None], "a": [1]})

    result = drop_empty_rows_without_data(dataframe, "name", ["a"])

    assert len(result) == 1


def test_drop_empty_rows_without_data_handles_numeric_strings():
    dataframe = pd.DataFrame({"name": [""], "a": ["1,000"]})

    result = drop_empty_rows_without_data(dataframe, "name", ["a"])

    assert len(result) == 1
