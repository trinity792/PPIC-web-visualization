import pandas as pd
import pytest

from scripts.pophousing.historical.e8_standardization import (
    extract_annual_year,
    standardize_e8_data,
)


def test_extract_annual_year_drops_census_and_unparseable():
    # Arrange
    dates = pd.Series(["1/1/1991", "4/1/1991", "not a date", "2005"])

    # Act
    result = extract_annual_year(dates)

    # Assert: annual estimates keep their year; census/unparseable become NA.
    assert result.iloc[0] == 1991
    assert pd.isna(result.iloc[1])
    assert pd.isna(result.iloc[2])
    assert result.iloc[3] == 2005


def _standardization_frame():
    return pd.DataFrame(
        {
            "Geographic Level": ["City", "City", "City", "City"],
            "Location": ["Oakland", "Oakland", "Oakland", "Oakland"],
            "Year": ["1/1/1991", "4/1/1991", "1/1/1999", "1/1/2005"],
            "Total Population": ["370,000", "371000", "390000", "410000"],
            "Vacancy Rate (%)": [0.05, 0.05, 0.08, 6.0],
        }
    )


def test_standardize_e8_data_drops_census_rows():
    # Act
    result = standardize_e8_data(_standardization_frame(), 1990, 2000)

    # Assert: the 4/1 census duplicate of 1991 is removed.
    assert result["Year"].tolist() == [1991, 1999]


def test_standardize_e8_data_filters_year_bounds():
    # Act
    result = standardize_e8_data(_standardization_frame(), 1995, 2000)

    # Assert
    assert result["Year"].tolist() == [1999]


def test_standardize_e8_data_scales_decimal_vacancy_rates():
    # Act
    result = standardize_e8_data(_standardization_frame(), 1990, 2000)

    # Assert: fractional pre-2020 rates become percentages.
    rate_1991 = result.loc[result["Year"] == 1991, "Vacancy Rate (%)"].iloc[0]
    assert rate_1991 == 5.0


def test_standardize_e8_data_coerces_numeric_text():
    # Act
    result = standardize_e8_data(_standardization_frame(), 1990, 2000)

    # Assert: thousands separators are coerced to numbers.
    assert result["Total Population"].tolist() == [370_000, 390_000]
    assert pd.api.types.is_numeric_dtype(result["Total Population"])


def test_standardize_e8_data_invalid_year_bounds_raises():
    # Act / Assert
    with pytest.raises(ValueError, match="year_start cannot exceed year_end"):
        standardize_e8_data(_standardization_frame(), 2000, 1990)


def test_standardize_e8_data_missing_year_column_raises():
    # Act / Assert
    with pytest.raises(KeyError, match="missing column: Year"):
        standardize_e8_data(pd.DataFrame({"Location": ["Oakland"]}), 1990, 2000)
