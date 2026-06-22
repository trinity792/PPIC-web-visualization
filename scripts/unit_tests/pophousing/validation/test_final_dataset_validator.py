import pandas as pd
import pytest

from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.validation.final_dataset_validator import (
    validate_final_housing_dataset,
)


def _row(location, level, year, population=100):
    row = {
        column: 0 for column in get_schema_config()["output_columns"]
    }
    row.update(
        {
            "Location": location,
            "Geographic Level": level,
            "Year": str(year),
            "Total Population": population,
            "Total Housing Units": 50,
            "Vacancy Rate (%)": 5.0,
            "Persons Per Household": 2.5,
            "Source": "DoF",
        }
    )
    return row


def _valid_dataframe():
    rows = []
    for year in (2020, 2021):
        rows.extend(
            [
                _row("California", "State", year, 39_000_000),
                _row("Alameda", "County", year, 1_600_000),
                _row("Oakland", "City", year, 440_000),
                _row("Yountville", "Town", year, 3_000),
                _row("Bay Area", "Region", year, 7_800_000),
                _row("San Francisco", "City", year, 870_000),
                _row("San Francisco", "County", year, 870_000),
            ]
        )
    return pd.DataFrame(rows)


def _config():
    config = get_schema_config()["final_validation"].copy()
    config["minimum_year"] = 2020
    config["maximum_year"] = 2021
    return config


def test_validate_final_valid_dataset():
    assert validate_final_housing_dataset(_valid_dataframe(), _config()) == (
        True,
        [],
    )


def test_validate_final_missing_required_column():
    dataframe = _valid_dataframe().drop(columns=["Vacant Units"])

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("Vacant Units" in message for message in messages)


def test_validate_final_duplicate_keys():
    dataframe = pd.concat(
        [_valid_dataframe(), _valid_dataframe().iloc[[0]]], ignore_index=True
    )

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("duplicate" in message for message in messages)


def test_validate_final_empty_dataset():
    is_valid, messages = validate_final_housing_dataset(
        pd.DataFrame(columns=get_schema_config()["output_columns"]), _config()
    )

    assert is_valid is False and any("empty" in message for message in messages)


def test_validate_final_all_five_levels_present():
    dataframe = _valid_dataframe()
    dataframe = dataframe[~dataframe["Geographic Level"].eq("Town")]

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any(
        "Missing geographic levels" in message and "Town" in message
        for message in messages
    )


def test_validate_final_invalid_level():
    dataframe = _valid_dataframe()
    dataframe.loc[0, "Geographic Level"] = "Unknown"

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("Invalid geographic levels" in message for message in messages)


def test_validate_final_no_null_levels():
    dataframe = _valid_dataframe()
    dataframe.loc[0, "Geographic Level"] = None

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("null geographic levels" in message for message in messages)


def test_validate_final_california_state_rows():
    dataframe = _valid_dataframe()
    dataframe = dataframe[~dataframe["Location"].eq("California")]

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("California State rows" in message for message in messages)


def test_validate_final_year_range():
    dataframe = _valid_dataframe()
    dataframe = dataframe[~dataframe["Year"].eq("2020")]

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("year range" in message for message in messages)


def test_validate_final_no_future_years():
    dataframe = pd.concat(
        [_valid_dataframe(), pd.DataFrame([_row("Oakland", "City", 2022)])],
        ignore_index=True,
    )

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("future years" in message for message in messages)


def test_validate_final_sf_has_both_levels():
    dataframe = _valid_dataframe()
    dataframe = dataframe[
        ~(
            dataframe["Location"].eq("San Francisco")
            & dataframe["Geographic Level"].eq("County")
            & dataframe["Year"].eq("2021")
        )
    ]

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any(
        "San Francisco" in message and "City and County" in message
        for message in messages
    )


def test_validate_final_sf_no_triplication():
    sf_row = _valid_dataframe().query(
        "Location == 'San Francisco' and Year == '2021'"
    ).iloc[[0]]
    dataframe = pd.concat([_valid_dataframe(), sf_row], ignore_index=True)

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("more than twice" in message for message in messages)


def test_validate_final_bay_area_2020_plausible():
    dataframe = _valid_dataframe()

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is True and not any("Bay Area" in message for message in messages)


def test_validate_final_bay_area_2020_missing():
    dataframe = _valid_dataframe()
    dataframe = dataframe[
        ~(dataframe["Location"].eq("Bay Area") & dataframe["Year"].eq("2020"))
    ]

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is True and messages == []


def test_validate_final_bay_area_2020_implausible():
    dataframe = _valid_dataframe()
    mask = dataframe["Location"].eq("Bay Area") & dataframe["Year"].eq("2020")
    dataframe.loc[mask, "Total Population"] = 20_000_000

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("Bay Area 2020" in message for message in messages)


@pytest.mark.parametrize("column", ["Total Population", "Total Housing Units"])
def test_validate_final_no_negative_populations(column):
    dataframe = _valid_dataframe()
    dataframe.loc[0, column] = -1

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any(column in message for message in messages)


def test_validate_final_vacancy_rate_range():
    dataframe = _valid_dataframe()
    dataframe.loc[0, "Vacancy Rate (%)"] = 101

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("Vacancy Rate" in message for message in messages)


def test_validate_final_persons_per_household_range():
    dataframe = _valid_dataframe()
    dataframe.loc[0, "Persons Per Household"] = 11

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and any("Persons Per Household" in message for message in messages)


def test_validate_final_returns_tuple():
    result = validate_final_housing_dataset(_valid_dataframe(), _config())

    assert isinstance(result, tuple) and isinstance(result[0], bool) and isinstance(result[1], list)


def test_validate_final_multiple_failures():
    dataframe = _valid_dataframe().drop(columns=["Vacant Units"])
    dataframe.loc[0, "Geographic Level"] = "Unknown"
    dataframe.loc[1, "Total Population"] = -1

    is_valid, messages = validate_final_housing_dataset(dataframe, _config())

    assert is_valid is False and len(messages) >= 3
