import pandas as pd
import pytest

from scripts.pophousing.aggregation.aggregation_utils import (
    deduplicate_geographic_rows,
    remove_existing_geographic_level,
)


def test_remove_existing_level_drops_target():
    dataframe = pd.DataFrame(
        {"Geographic Level": ["County", "Region", "Region"]}
    )

    result = remove_existing_geographic_level(
        dataframe, "Geographic Level", "Region"
    )

    assert result["Geographic Level"].tolist() == ["County"]


def test_remove_existing_level_preserves_others():
    dataframe = pd.DataFrame(
        {"Geographic Level": ["County", "City", "Town", "State"]}
    )

    result = remove_existing_geographic_level(
        dataframe, "Geographic Level", "Region"
    )

    pd.testing.assert_frame_equal(result, dataframe)


def test_remove_existing_level_no_matching_rows():
    dataframe = pd.DataFrame({"Geographic Level": ["County"]}, index=[4])

    result = remove_existing_geographic_level(
        dataframe, "Geographic Level", "Region"
    )

    assert result.index.tolist() == [0]


def test_remove_existing_level_returns_copy():
    dataframe = pd.DataFrame({"Geographic Level": ["Region", "County"]})

    remove_existing_geographic_level(dataframe, "Geographic Level", "Region")

    assert dataframe["Geographic Level"].tolist() == ["Region", "County"]


def test_remove_existing_level_missing_column():
    with pytest.raises(KeyError, match="missing column.*Geographic Level"):
        remove_existing_geographic_level(
            pd.DataFrame({"Location": ["Oakland"]}),
            "Geographic Level",
            "Region",
        )


def test_deduplicate_keeps_preferred_level():
    dataframe = pd.DataFrame(
        {
            "Location": ["Alameda", "Alameda"],
            "Year": [2023, 2023],
            "Geographic Level": ["City", "County"],
        }
    )

    result = deduplicate_geographic_rows(
        dataframe, "Location", "Year", "Geographic Level", "County"
    )

    assert result["Geographic Level"].tolist() == ["County"]


def test_deduplicate_no_duplicates():
    dataframe = pd.DataFrame(
        {
            "Location": ["Alameda", "Oakland"],
            "Year": [2023, 2023],
            "Geographic Level": ["County", "City"],
        }
    )

    result = deduplicate_geographic_rows(
        dataframe, "Location", "Year", "Geographic Level", "County"
    )

    pd.testing.assert_frame_equal(result, dataframe)


def test_deduplicate_preserves_different_years():
    dataframe = pd.DataFrame(
        {
            "Location": ["Alameda", "Alameda"],
            "Year": [2022, 2023],
            "Geographic Level": ["County", "County"],
        }
    )

    result = deduplicate_geographic_rows(
        dataframe, "Location", "Year", "Geographic Level", "County"
    )

    assert result["Year"].tolist() == [2022, 2023]


def test_deduplicate_multiple_ambiguous_locations():
    dataframe = pd.DataFrame(
        {
            "Location": ["San Francisco", "San Francisco", "San Diego", "San Diego"],
            "Year": [2023] * 4,
            "Geographic Level": ["City", "County", "City", "County"],
        }
    )

    result = deduplicate_geographic_rows(
        dataframe, "Location", "Year", "Geographic Level", "County"
    )

    assert result[["Location", "Geographic Level"]].to_dict("records") == [
        {"Location": "San Francisco", "Geographic Level": "County"},
        {"Location": "San Diego", "Geographic Level": "County"},
    ]
