import pandas as pd

from scripts.pophousing.cleaning.location_standardization import standardize_location_column


def test_standardize_location_column_city_mapping():
    dataframe = pd.DataFrame(
        {"Location": ["San Buenaventura"], "Geographic Level": ["City"]}
    )

    result = standardize_location_column(dataframe, "Location", "Geographic Level", ("City",))

    assert result.loc[0, "Location"] == "Ventura"


def test_standardize_location_column_historical_mapping():
    dataframe = pd.DataFrame({"Location": ["Amador"], "Geographic Level": ["City"]})

    result = standardize_location_column(dataframe, "Location", "Geographic Level", ("City",))

    assert result.loc[0, "Location"] == "Amador City"


def test_standardize_location_column_removes_city_suffix():
    dataframe = pd.DataFrame({"Location": ["Example City"], "Geographic Level": ["City"]})

    result = standardize_location_column(dataframe, "Location", "Geographic Level", ("City",))

    assert result.loc[0, "Location"] == "Example"


def test_standardize_location_column_preserves_proper_city_name():
    dataframe = pd.DataFrame({"Location": ["Redwood City"], "Geographic Level": ["City"]})

    result = standardize_location_column(dataframe, "Location", "Geographic Level", ("City",))

    assert result.loc[0, "Location"] == "Redwood City"


def test_standardize_location_column_only_selected_levels():
    dataframe = pd.DataFrame({"Location": ["Example City"], "Geographic Level": ["County"]})

    result = standardize_location_column(dataframe, "Location", "Geographic Level", ("City",))

    assert result.loc[0, "Location"] == "Example City"


def test_standardize_location_column_preserves_nulls():
    dataframe = pd.DataFrame({"Location": [None], "Geographic Level": ["City"]})

    result = standardize_location_column(dataframe, "Location", "Geographic Level", ("City",))

    assert pd.isna(result.loc[0, "Location"])


def test_standardize_location_column_does_not_mutate_input():
    dataframe = pd.DataFrame({"Location": ["Example City"], "Geographic Level": ["City"]})

    standardize_location_column(dataframe, "Location", "Geographic Level", ("City",))

    assert dataframe.loc[0, "Location"] == "Example City"
