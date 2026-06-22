import pandas as pd

from scripts.pophousing.cleaning.geographic_classification import (
    assign_geographic_level_with_context,
    assign_missing_geographic_levels,
    standardize_san_francisco_classification,
)
from scripts.pophousing.cleaning.location_standardization import (
    standardize_location_column,
)


def _enriched_dataframe():
    return pd.DataFrame(
        {
            "Location": [
                "California",
                "Bay Area",
                "Alameda",
                "Oakland",
                "Amador",
            ],
            "Geographic Level": ["State", "Region", "County", "City", "City"],
            "Year": [2021, 2021, 2021, 2021, 1999],
            "Total Population": [39_000_000, 7_800_000, 1_600_000, 440_000, 200],
            "Source": ["E-5", "Aggregated", "E-5", "E-5", "E-8"],
        }
    )


def test_standardize_on_enriched_data_region_rows_untouched():
    result = standardize_location_column(
        _enriched_dataframe(),
        "Location",
        "Geographic Level",
        ("City", "Town"),
    )

    assert result.loc[result["Geographic Level"].eq("Region"), "Location"].tolist() == [
        "Bay Area"
    ]


def test_standardize_on_enriched_data_only_levels_filter():
    dataframe = _enriched_dataframe()
    dataframe.loc[2, "Location"] = "Amador"

    result = standardize_location_column(
        dataframe, "Location", "Geographic Level", ("City", "Town")
    )

    assert result.loc[2, "Location"] == "Amador"


def test_standardize_on_enriched_data_historical_names():
    result = standardize_location_column(
        _enriched_dataframe(),
        "Location",
        "Geographic Level",
        ("City", "Town"),
    )

    assert result.loc[4, "Location"] == "Amador City"


def test_assign_levels_on_enriched_data_no_regressions():
    dataframe = _enriched_dataframe()

    result = assign_missing_geographic_levels(
        dataframe,
        assign_geographic_level_with_context,
        "Location",
        "County",
        "Total Population",
        "Geographic Level",
    )

    assert result["Geographic Level"].tolist() == dataframe[
        "Geographic Level"
    ].tolist()


def test_assign_levels_on_enriched_data_fills_new_gaps():
    dataframe = _enriched_dataframe()
    dataframe.loc[0, "Geographic Level"] = None

    result = assign_missing_geographic_levels(
        dataframe,
        assign_geographic_level_with_context,
        "Location",
        "County",
        "Total Population",
        "Geographic Level",
    )

    assert result.loc[0, "Geographic Level"] == "State"


def test_sf_duplication_on_enriched_data_both_sources():
    dataframe = pd.DataFrame(
        {
            "Location": ["San Francisco", "San Francisco"],
            "Geographic Level": ["City", "City"],
            "Year": [2019, 2021],
            "Source": ["E-8", "E-5"],
        }
    )

    result = standardize_san_francisco_classification(
        dataframe, "Location", "Geographic Level"
    )

    assert set(zip(result["Source"], result["Geographic Level"])) == {
        ("E-8", "City"),
        ("E-8", "County"),
        ("E-5", "City"),
        ("E-5", "County"),
    }


def test_sf_duplication_on_enriched_data_row_count():
    dataframe = pd.DataFrame(
        {
            "Location": ["San Francisco", "San Francisco"],
            "Geographic Level": ["City", "City"],
            "Year": [2019, 2021],
        }
    )

    result = standardize_san_francisco_classification(
        dataframe, "Location", "Geographic Level"
    )

    assert len(result) == 4


def test_sf_duplication_on_enriched_data_no_other_rows_affected():
    dataframe = pd.DataFrame(
        {
            "Location": ["Oakland", "San Francisco"],
            "Geographic Level": ["City", "City"],
            "Year": [2021, 2021],
        }
    )

    result = standardize_san_francisco_classification(
        dataframe, "Location", "Geographic Level"
    )

    pd.testing.assert_frame_equal(
        result[result["Location"].eq("Oakland")].reset_index(drop=True),
        dataframe[dataframe["Location"].eq("Oakland")].reset_index(drop=True),
    )
