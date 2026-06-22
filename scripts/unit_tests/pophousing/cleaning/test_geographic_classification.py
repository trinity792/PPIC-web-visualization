import pandas as pd

from scripts.pophousing.cleaning.geographic_classification import (
    apply_town_overrides,
    assign_geographic_level_with_context,
    assign_missing_geographic_levels,
    classify_ambiguous_location,
    drop_helper_columns,
    normalize_state_total_rows,
    remove_balance_rows,
    resolve_county_total_rows,
    sanitize_geographic_levels,
    standardize_san_francisco_classification,
)
from scripts.pophousing.config.geography import get_geography_config


def test_classify_ambiguous_location_explicit_totals():
    row = pd.Series(dtype="object")

    assert classify_ambiguous_location("County Total", "Alameda", 1, row, None, None) == "County"
    assert classify_ambiguous_location("State Total", None, 1, row, None, None) == "State"


def test_classify_ambiguous_location_town():
    row = pd.Series(dtype="object")

    result = classify_ambiguous_location("Atherton", "San Mateo", 7_000, row, None, None)

    assert result == "Town"


def test_classify_ambiguous_location_county_structure():
    dataframe = pd.DataFrame({"Location": ["Alameda", "County Total", "Oakland"]})

    result = classify_ambiguous_location("Alameda", "Alameda", 0, dataframe.iloc[0], dataframe, 0)

    assert result == "County"


def test_classify_ambiguous_location_city_default():
    row = pd.Series(dtype="object")

    result = classify_ambiguous_location("Alameda", "Alameda", 80_000, row, None, None)

    assert result == "City"


def test_assign_geographic_level_with_context_fixed_levels():
    config = get_geography_config()
    row = pd.Series(dtype="object")

    assert assign_geographic_level_with_context("California", None, 1, row, config) == "State"
    assert assign_geographic_level_with_context("Bay Area", None, 1, row, config) == "Region"
    assert assign_geographic_level_with_context("Atherton", "San Mateo", 1, row, config) == "Town"


def test_resolve_county_total_rows():
    dataframe = pd.DataFrame(
        {"Location": ["County Total", "Oakland"], "_temp_county": ["Alameda", "Alameda"]}
    )

    result = resolve_county_total_rows(dataframe, "Location", "_temp_county")

    assert result.loc[0, "Location"] == "Alameda"
    assert result.loc[0, "Geographic Level"] == "County"


def test_normalize_state_total_rows():
    dataframe = pd.DataFrame({"Location": ["State Total", "Oakland"]})

    result = normalize_state_total_rows(dataframe, "Location", "California")

    assert result.loc[0, "Location"] == "California"
    assert result.loc[0, "Geographic Level"] == "State"


def test_assign_missing_geographic_levels_preserves_existing():
    dataframe = pd.DataFrame(
        {
            "Location": ["California", "Oakland"],
            "County": [None, "Alameda"],
            "Total Population": [39_000_000, 440_000],
            "Geographic Level": ["State", None],
        }
    )

    result = assign_missing_geographic_levels(
        dataframe,
        assign_geographic_level_with_context,
        "Location",
        "County",
        "Total Population",
        "Geographic Level",
    )

    assert result["Geographic Level"].tolist() == ["State", "City"]


def test_apply_town_overrides():
    dataframe = pd.DataFrame(
        {"Location": ["Atherton", "Oakland"], "Geographic Level": ["City", "City"]}
    )

    result = apply_town_overrides(dataframe, {"Atherton"}, "Location", "Geographic Level")

    assert result["Geographic Level"].tolist() == ["Town", "City"]


def test_sanitize_geographic_levels():
    dataframe = pd.DataFrame({"Geographic Level": [None, "", "Invalid", "County"]})

    result = sanitize_geographic_levels(dataframe, {"City", "County"}, "City")

    assert result["Geographic Level"].tolist() == ["City", "City", "City", "County"]


def test_remove_balance_rows():
    dataframe = pd.DataFrame({"Location": ["Balance of County", "Balance of State", "Oakland"]})

    result = remove_balance_rows(dataframe, "Location")

    assert result["Location"].tolist() == ["Oakland"]


def test_drop_helper_columns_ignores_missing():
    dataframe = pd.DataFrame({"Location": ["Oakland"], "_temp_county": ["Alameda"]})

    result = drop_helper_columns(dataframe, ["_temp_county", "_missing"])

    assert result.columns.tolist() == ["Location"]


def test_standardize_san_francisco_classification_creates_city_and_county():
    dataframe = pd.DataFrame(
        {"Location": ["San Francisco"], "Geographic Level": ["City"], "Year": [2025]}
    )

    result = standardize_san_francisco_classification(dataframe, "Location", "Geographic Level")

    assert set(result["Geographic Level"]) == {"City", "County"}


def test_standardize_san_francisco_classification_is_idempotent():
    dataframe = pd.DataFrame(
        {
            "Location": ["San Francisco", "San Francisco"],
            "Geographic Level": ["City", "County"],
            "Year": [2025, 2025],
        }
    )

    result = standardize_san_francisco_classification(dataframe, "Location", "Geographic Level")

    assert len(result) == 2
