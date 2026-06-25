import pandas as pd

from scripts.components_of_change.calculations.demographic_rates import add_crude_rates, recalculate_population_change


def test_add_crude_rates_uses_population_denominator():
    dataframe = pd.DataFrame({"Total Population": [1000], "Births": [12], "Deaths": [8]})

    result = add_crude_rates(dataframe, "Total Population", {"Crude Birth Rate": "Births", "Crude Death Rate": "Deaths"})

    assert result.loc[0, "Crude Birth Rate"] == 12
    assert result.loc[0, "Crude Death Rate"] == 8


def test_recalculate_population_change_groups_by_location_and_sorts_years():
    dataframe = pd.DataFrame({"Location": ["A", "A", "B", "B"], "Year": [2021, 2020, 2020, 2021], "Total Population": [110, 100, 50, 75]})

    result = recalculate_population_change(dataframe, "Location", "Total Population")

    a_2021 = result[result["Location"].eq("A") & result["Year"].eq(2021)].iloc[0]
    b_2021 = result[result["Location"].eq("B") & result["Year"].eq(2021)].iloc[0]
    assert a_2021["Numeric Change in Population"] == 10
    assert a_2021["Percent Change in Population"] == 10
    assert b_2021["Numeric Change in Population"] == 25
    assert b_2021["Percent Change in Population"] == 50
