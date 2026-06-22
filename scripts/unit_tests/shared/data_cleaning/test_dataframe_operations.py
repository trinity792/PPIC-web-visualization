import pandas as pd
import pytest

from scripts.shared.data_cleaning.dataframe_operations import assign_values_from_mapping, forward_fill_columns


def test_forward_fill_columns_selected_columns():
    dataframe = pd.DataFrame({"group": ["a", None, "b"], "value": [1, None, 3]})

    result = forward_fill_columns(dataframe, ["group"])

    assert result["group"].tolist() == ["a", "a", "b"]
    assert pd.isna(result.loc[1, "value"])


def test_forward_fill_columns_does_not_mutate_input():
    dataframe = pd.DataFrame({"group": ["a", None]})

    forward_fill_columns(dataframe, ["group"])

    assert pd.isna(dataframe.loc[1, "group"])


def test_forward_fill_columns_missing_column():
    dataframe = pd.DataFrame({"a": [1]})

    with pytest.raises(KeyError, match="missing columns.*b"):
        forward_fill_columns(dataframe, ["b"])


def test_assign_values_from_mapping_existing_target():
    dataframe = pd.DataFrame({"code": ["a", "b", "c"], "label": ["old-a", "old-b", "old-c"]})

    result = assign_values_from_mapping(dataframe, "code", "label", {"a": "new-a", "b": "new-b"})

    assert result["label"].tolist() == ["new-a", "new-b", "old-c"]


def test_assign_values_from_mapping_new_target():
    dataframe = pd.DataFrame({"code": ["a", "c"]})

    result = assign_values_from_mapping(dataframe, "code", "label", {"a": "new-a"})

    assert result["label"].tolist()[0] == "new-a"
    assert pd.isna(result.loc[1, "label"])


def test_assign_values_from_mapping_does_not_mutate_input():
    dataframe = pd.DataFrame({"code": ["a"]})

    assign_values_from_mapping(dataframe, "code", "label", {"a": "new-a"})

    assert "label" not in dataframe.columns


def test_assign_values_from_mapping_missing_source():
    dataframe = pd.DataFrame({"a": [1]})

    with pytest.raises(KeyError, match="missing column.*code"):
        assign_values_from_mapping(dataframe, "code", "label", {})
