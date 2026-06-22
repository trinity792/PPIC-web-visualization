import pandas as pd
import pytest

from scripts.pophousing.validation.historical_data_validator import validate_historical_housing_data


def _write_csv(dataframe, tmp_path):
    file_path = tmp_path / "historical.csv"
    dataframe.to_csv(file_path, index=False)
    return file_path


def test_validate_historical_valid_file(valid_historical_csv, historical_validation_config):
    # Act
    result = validate_historical_housing_data(valid_historical_csv, historical_validation_config)

    # Assert
    assert result == (True, [])


def test_validate_historical_missing_required_column(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe.drop(columns=["Total Housing Units"])
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert any("Total Housing Units" in message for message in messages)


def test_validate_historical_missing_year_coverage(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe[valid_historical_dataframe["Year"] != 2005]
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert any("Missing years: [2005]" in message for message in messages)


def test_validate_historical_no_state_level_data(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe[valid_historical_dataframe["Geographic Level"] != "State"]
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert any("Missing geographic levels: ['State']" in message for message in messages)


def test_validate_historical_no_california_rows(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange: preserve State rows under another location to isolate the California check.
    dataframe = valid_historical_dataframe.copy()
    dataframe.loc[dataframe["Location"] == "California", "Location"] = "Other State"
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert "No California state data found" in messages


def test_validate_historical_negative_population(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe.copy()
    dataframe.loc[dataframe["Location"] == "Oakland", "Total Population"] = -1
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert "Found 3 negative population values" in messages


def test_validate_historical_zero_population_state(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe.copy()
    state_2020 = (dataframe["Location"] == "California") & (dataframe["Year"] == 2020)
    dataframe.loc[state_2020, "Total Population"] = 0
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert "Average California population is below 30,000,000" in messages


def test_validate_historical_has_duplicates(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = pd.concat([valid_historical_dataframe, valid_historical_dataframe.iloc[[0]]], ignore_index=True)
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert "Found 1 duplicate entries" in messages


def test_validate_historical_excessive_nulls(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe.copy()
    dataframe.loc[0:1, "Total Housing Units"] = None
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert any("'Total Housing Units': 2" in message for message in messages)


def test_validate_historical_file_not_found(tmp_path, historical_validation_config):
    # Arrange
    missing_file = tmp_path / "missing.csv"

    # Act / Assert
    with pytest.raises(FileNotFoundError, match="Historical data file not found"):
        validate_historical_housing_data(missing_file, historical_validation_config)


def test_validate_historical_returns_structured_result(
    valid_historical_csv,
    historical_validation_config,
):
    # Act
    result = validate_historical_housing_data(valid_historical_csv, historical_validation_config)

    # Assert
    assert isinstance(result, tuple)
    assert isinstance(result[0], bool)
    assert isinstance(result[1], list)


def test_validate_historical_invalid_year_values(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe.copy()
    dataframe["Year"] = dataframe["Year"].astype("object")
    dataframe.loc[0, "Year"] = "not-a-year"
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, historical_validation_config)

    # Assert
    assert not is_valid
    assert "Found 1 invalid year values" in messages


def test_validate_historical_allowed_null_threshold(
    tmp_path,
    valid_historical_dataframe,
    historical_validation_config,
):
    # Arrange
    dataframe = valid_historical_dataframe.copy()
    dataframe.loc[0, "Total Housing Units"] = None
    config = {**historical_validation_config, "maximum_null_counts": {"Total Housing Units": 1}}
    file_path = _write_csv(dataframe, tmp_path)

    # Act
    is_valid, messages = validate_historical_housing_data(file_path, config)

    # Assert
    assert is_valid
    assert messages == []
