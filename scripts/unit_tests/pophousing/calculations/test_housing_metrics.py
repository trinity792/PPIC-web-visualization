import pandas as pd
import pytest

from scripts.pophousing.calculations.housing_metrics import (
    add_housing_derived_columns,
    recalculate_housing_rates,
)


def test_add_housing_derived_columns_calculates_units():
    dataframe = pd.DataFrame(
        {
            "Single Family Detached Units": [10],
            "Single Family Attached Units": [2],
            "Two to Four Family Units": [3],
            "Five Plus Family Units": [5],
            "Total Housing Units": [25],
            "Occupied Units": [20],
        }
    )

    result = add_housing_derived_columns(dataframe)

    assert result.loc[0, "Single Family Units"] == 12
    assert result.loc[0, "Multiple Family Units"] == 8
    assert result.loc[0, "Vacant Units"] == 5


def test_add_housing_derived_columns_fills_missing_components():
    dataframe = pd.DataFrame(
        {
            "Single Family Detached Units": [10],
            "Single Family Attached Units": [None],
            "Two to Four Family Units": [None],
            "Five Plus Family Units": [5],
            "Total Housing Units": [25],
            "Occupied Units": [20],
        }
    )

    result = add_housing_derived_columns(dataframe)

    assert result.loc[0, "Single Family Units"] == 10
    assert result.loc[0, "Multiple Family Units"] == 5


def test_add_housing_derived_columns_missing_required_column():
    dataframe = pd.DataFrame({"Total Housing Units": [1]})

    with pytest.raises(KeyError, match="missing columns"):
        add_housing_derived_columns(dataframe)


def test_add_housing_derived_columns_does_not_mutate_input():
    dataframe = pd.DataFrame(
        {
            "Single Family Detached Units": [1],
            "Single Family Attached Units": [1],
            "Two to Four Family Units": [1],
            "Five Plus Family Units": [1],
            "Total Housing Units": [4],
            "Occupied Units": [3],
        }
    )

    add_housing_derived_columns(dataframe)

    assert "Vacant Units" not in dataframe.columns


def test_recalculate_housing_rates_selected_rows():
    dataframe = pd.DataFrame(
        {
            "Vacant Units": [10, 20],
            "Total Housing Units": [100, 100],
            "Household Population": [180, 160],
            "Occupied Units": [90, 80],
            "Vacancy Rate (%)": [0, 99],
            "Persons Per Household": [0, 99],
        }
    )

    result = recalculate_housing_rates(dataframe, pd.Series([True, False]))

    assert result["Vacancy Rate (%)"].tolist() == [10.0, 99.0]
    assert result["Persons Per Household"].tolist() == [2.0, 99.0]


def test_recalculate_housing_rates_zero_denominators():
    dataframe = pd.DataFrame(
        {
            "Vacant Units": [0],
            "Total Housing Units": [0],
            "Household Population": [0],
            "Occupied Units": [0],
        }
    )

    result = recalculate_housing_rates(dataframe, pd.Series([True]))

    assert result.loc[0, "Vacancy Rate (%)"] == 0
    assert result.loc[0, "Persons Per Household"] == 0


def test_recalculate_housing_rates_mask_alignment():
    dataframe = pd.DataFrame(
        {
            "Vacant Units": [1],
            "Total Housing Units": [2],
            "Household Population": [1],
            "Occupied Units": [1],
        },
        index=[5],
    )

    with pytest.raises(ValueError, match="row_mask must align"):
        recalculate_housing_rates(dataframe, pd.Series([True], index=[0]))
