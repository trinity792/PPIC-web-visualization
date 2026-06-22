import pandas as pd
import pytest

from scripts.pophousing.cleaning.e5_schema_normalizer import (
    normalize_e5_columns,
    rename_e5_schema,
    trim_to_first_data_row,
)


def test_normalize_e5_columns_expected_width():
    dataframe = pd.DataFrame([[1, 2], [3, 4]])

    result = normalize_e5_columns(dataframe, ["a", "b"])

    assert result.columns.tolist() == ["a", "b"]


def test_normalize_e5_columns_unexpected_width():
    dataframe = pd.DataFrame([[1, 2]])

    with pytest.raises(ValueError, match="expected 3 columns.*found 2"):
        normalize_e5_columns(dataframe, ["a", "b", "c"])


def test_normalize_e5_columns_does_not_mutate_input():
    dataframe = pd.DataFrame([[1, 2]])
    original_columns = dataframe.columns.tolist()

    normalize_e5_columns(dataframe, ["a", "b"])

    assert dataframe.columns.tolist() == original_columns


def test_trim_to_first_data_row_anchor_present():
    dataframe = pd.DataFrame({"region": ["metadata", "Alameda", None], "value": [0, 1, 2]})

    result = trim_to_first_data_row(dataframe, "Alameda", "region")

    assert result["value"].tolist() == [1, 2]
    assert result.index.tolist() == [0, 1]


def test_trim_to_first_data_row_anchor_missing():
    dataframe = pd.DataFrame({"region": ["metadata"]})

    with pytest.raises(ValueError, match="anchor.*Alameda.*not found"):
        trim_to_first_data_row(dataframe, "Alameda", "region")


def test_trim_to_first_data_row_column_missing():
    with pytest.raises(KeyError, match="missing column.*region"):
        trim_to_first_data_row(pd.DataFrame({"other": [1]}), "Alameda", "region")


def test_rename_e5_schema_mapping():
    dataframe = pd.DataFrame({"Region": ["Alameda"], "City": ["Oakland"]})

    result = rename_e5_schema(dataframe, {"Region": "County", "City": "Location"})

    assert result.columns.tolist() == ["County", "Location"]


def test_rename_e5_schema_missing_source_column():
    with pytest.raises(KeyError, match="missing columns.*City"):
        rename_e5_schema(pd.DataFrame({"Region": ["Alameda"]}), {"City": "Location"})
