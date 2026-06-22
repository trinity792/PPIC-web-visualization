import pandas as pd
import pytest

from scripts.shared.data_cleaning.type_conversions import coerce_numeric_columns, parse_year_from_date


def test_parse_year_from_date_valid_dates():
    dataframe = pd.DataFrame({"date": ["2024-01-01", "May 1, 2025"]})

    result = parse_year_from_date(dataframe, "date", "year")

    assert result["year"].tolist() == [2024, 2025]


def test_parse_year_from_date_invalid_date():
    dataframe = pd.DataFrame({"date": ["not-a-date"]})

    result = parse_year_from_date(dataframe, "date", "year")

    assert result["year"].isna().all()


def test_parse_year_from_date_missing_column():
    with pytest.raises(KeyError, match="missing column.*date"):
        parse_year_from_date(pd.DataFrame({"other": [1]}), "date", "year")


def test_parse_year_from_date_does_not_mutate_input():
    dataframe = pd.DataFrame({"date": ["2024-01-01"]})

    parse_year_from_date(dataframe, "date", "year")

    assert "year" not in dataframe.columns


def test_coerce_numeric_columns_commas_and_decimals():
    dataframe = pd.DataFrame({"count": ["1,234", "5"], "rate": ["1.5", "2.0"]})

    result = coerce_numeric_columns(dataframe, ["count", "rate"])

    assert result["count"].tolist() == [1234, 5]
    assert result["rate"].tolist() == [1.5, 2.0]


def test_coerce_numeric_columns_invalid_value():
    dataframe = pd.DataFrame({"value": ["unknown"]})

    result = coerce_numeric_columns(dataframe, ["value"])

    assert result["value"].isna().all()


def test_coerce_numeric_columns_missing_column():
    with pytest.raises(KeyError, match="missing columns.*value"):
        coerce_numeric_columns(pd.DataFrame({"other": [1]}), ["value"])


def test_coerce_numeric_columns_does_not_mutate_input():
    dataframe = pd.DataFrame({"value": ["1,234"]})

    coerce_numeric_columns(dataframe, ["value"])

    assert dataframe.loc[0, "value"] == "1,234"
