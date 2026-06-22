import pandas as pd

from scripts.pophousing.validation.cleaning_validators import validate_cleaned_e5_data


def _config():
    return {
        "required_columns": ["Location", "Geographic Level", "Year", "Total Population"],
        "critical_columns": ["Location", "Geographic Level", "Year"],
        "duplicate_key_columns": ["Location", "Geographic Level", "Year"],
        "valid_levels": {"City", "County", "State", "Town", "Region"},
        "nonnegative_columns": ["Total Population"],
    }


def _valid_dataframe():
    return pd.DataFrame(
        {
            "Location": ["California", "Oakland"],
            "Geographic Level": ["State", "City"],
            "Year": [2025, 2025],
            "Total Population": [39_000_000, 440_000],
        }
    )


def test_validate_cleaned_e5_data_valid():
    result = validate_cleaned_e5_data(_valid_dataframe(), _config())

    assert result == (True, [])


def test_validate_cleaned_e5_data_empty():
    result = validate_cleaned_e5_data(pd.DataFrame(), _config())

    assert result[0] is False
    assert "Cleaned E-5 data is empty" in result[1]


def test_validate_cleaned_e5_data_missing_columns():
    dataframe = _valid_dataframe().drop(columns=["Year"])

    result = validate_cleaned_e5_data(dataframe, _config())

    assert result[0] is False
    assert any("Year" in message for message in result[1])


def test_validate_cleaned_e5_data_null_critical_value():
    dataframe = _valid_dataframe()
    dataframe.loc[0, "Location"] = None

    result = validate_cleaned_e5_data(dataframe, _config())

    assert result[0] is False
    assert any("null values" in message for message in result[1])


def test_validate_cleaned_e5_data_duplicates():
    dataframe = pd.concat([_valid_dataframe(), _valid_dataframe().iloc[[0]]], ignore_index=True)

    result = validate_cleaned_e5_data(dataframe, _config())

    assert result[0] is False
    assert any("duplicate" in message for message in result[1])


def test_validate_cleaned_e5_data_invalid_level():
    dataframe = _valid_dataframe()
    dataframe.loc[0, "Geographic Level"] = "Unknown"

    result = validate_cleaned_e5_data(dataframe, _config())

    assert result[0] is False
    assert any("Invalid geographic levels" in message for message in result[1])


def test_validate_cleaned_e5_data_negative_values():
    dataframe = _valid_dataframe()
    dataframe.loc[1, "Total Population"] = -1

    result = validate_cleaned_e5_data(dataframe, _config())

    assert result[0] is False
    assert any("negative values" in message for message in result[1])
