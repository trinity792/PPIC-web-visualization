import pandas as pd

from scripts.components_of_change.aggregation.regional_aggregation import add_regional_data, build_regional_rows


def _county_row(location, year, population=100, births=10):
    return {
        "Location": location,
        "Geographic Level": "County",
        "Year": year,
        "Total Population": population,
        "Percent Change in Population": 1.0,
        "Numeric Change in Population": 1.0,
        "Births": births,
        "Deaths": 5,
        "Natural Increase": 5,
        "Net Migration": 2,
        "Net Foreign Immigration": 1,
        "Net Domestic Migration": 1,
        "Crude Birth Rate": 999.0,
        "Crude Death Rate": 999.0,
        "Crude Migration Rate": 999.0,
        "Crude Domestic Migration Rate": 999.0,
        "Crude Foreign Migration Rate": 999.0,
        "Source": "DoF",
    }


def test_build_regional_rows_sums_additive_columns():
    dataframe = pd.DataFrame([_county_row("Alameda", 2020, 100, 10), _county_row("Contra Costa", 2020, 300, 30)])

    result = build_regional_rows(dataframe, {"Bay Area": ["Alameda", "Contra Costa"]})

    assert result.loc[0, "Location"] == "Bay Area"
    assert result.loc[0, "Total Population"] == 400
    assert result.loc[0, "Births"] == 40
    assert pd.isna(result.loc[0, "Crude Birth Rate"])


def test_add_regional_data_replaces_existing_regions_and_recalculates_rates():
    dataframe = pd.DataFrame([_county_row("Alameda", 2020, 100, 10), _county_row("Contra Costa", 2020, 300, 30), _county_row("Bay Area", 2020, 999, 999)])

    result = add_regional_data(dataframe, {"Bay Area": ["Alameda", "Contra Costa"]})
    region = result[result["Location"].eq("Bay Area")].iloc[0]

    assert region["Total Population"] == 400
    assert region["Births"] == 40
    assert region["Crude Birth Rate"] == 100
    assert len(result[result["Location"].eq("Bay Area")]) == 1
