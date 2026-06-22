import pandas as pd

from scripts.pophousing.cleaning.hierarchical_location_cleaning import (
    build_county_context_column,
    forward_fill_locations_with_context,
    has_meaningful_housing_data,
    identify_county_headers,
)


def test_has_meaningful_housing_data_positive_value():
    row = pd.Series({"population": "1,000", "housing": 0})

    result = has_meaningful_housing_data(row, ["population", "housing"])

    assert result is True


def test_has_meaningful_housing_data_zero_and_invalid_values():
    row = pd.Series({"population": "unknown", "housing": 0})

    result = has_meaningful_housing_data(row, ["population", "housing"])

    assert result is False


def test_identify_county_headers_followed_by_county_total():
    dataframe = pd.DataFrame({"Location": ["Alameda", "County Total", "Oakland"]})

    result = identify_county_headers(dataframe, {"Alameda"}, "Location")

    assert result == {0}


def test_identify_county_headers_ambiguous_city_without_structure():
    dataframe = pd.DataFrame({"Location": ["Alameda"]})

    result = identify_county_headers(dataframe, {"Alameda"}, "Location")

    assert result == set()


def test_forward_fill_locations_with_context_city_block():
    dataframe = pd.DataFrame(
        {"Location": ["Oakland", None, None], "County": ["Alameda", "Alameda", "Alameda"]}
    )

    result = forward_fill_locations_with_context(dataframe, "Location", "County")

    assert result["Location"].tolist() == ["Oakland", "Oakland", "Oakland"]


def test_forward_fill_locations_with_context_preserves_totals():
    dataframe = pd.DataFrame(
        {
            "Location": ["County Total", None, "State Total", None],
            "County": ["Alameda", "Alameda", None, None],
        }
    )

    result = forward_fill_locations_with_context(dataframe, "Location", "County")

    assert result["Location"].tolist() == ["County Total", "County Total", "State Total", "State Total"]


def test_forward_fill_locations_with_context_does_not_cross_initial_blank():
    dataframe = pd.DataFrame({"Location": [None, "Oakland"], "County": ["Alameda", "Alameda"]})

    result = forward_fill_locations_with_context(dataframe, "Location", "County")

    assert pd.isna(result.loc[0, "Location"])


def test_forward_fill_locations_with_context_does_not_mutate_input():
    dataframe = pd.DataFrame({"Location": ["Oakland", None], "County": ["Alameda", "Alameda"]})

    forward_fill_locations_with_context(dataframe, "Location", "County")

    assert pd.isna(dataframe.loc[1, "Location"])


def test_build_county_context_column_existing_county():
    dataframe = pd.DataFrame({"Location": ["Oakland", None], "County": ["Alameda", None]})

    result = build_county_context_column(dataframe, "Location", "County", "_temp_county")

    assert result["_temp_county"].tolist() == ["Alameda", "Alameda"]


def test_build_county_context_column_infers_county_headers():
    dataframe = pd.DataFrame({"Location": ["Alameda", "County Total", "Oakland"]})

    result = build_county_context_column(dataframe, "Location", "County", "_temp_county")

    assert result["_temp_county"].tolist() == ["Alameda", "Alameda", "Alameda"]
