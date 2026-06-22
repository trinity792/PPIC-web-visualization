import pandas as pd

from scripts.pophousing.aggregation.regional_aggregation import (
    add_regional_data,
    build_regional_rows,
)
from scripts.pophousing.config.geography import get_geography_config


def _county_row(location, year, population=100, housing=50, occupied=40):
    return {
        "Location": location,
        "Geographic Level": "County",
        "Year": year,
        "Total Population": population,
        "Household Population": occupied * 2,
        "Total Housing Units": housing,
        "Occupied Units": occupied,
        "Vacant Units": housing - occupied,
        "Vacancy Rate (%)": 99.0,
        "Persons Per Household": 99.0,
        "Source": "E-5",
    }


def _bay_area_dataframe():
    return pd.DataFrame(
        [
            _county_row("Alameda", 2020, 100, 50, 40),
            _county_row("Contra Costa", 2020, 200, 100, 80),
            _county_row("Alameda", 2021, 110, 60, 50),
            _county_row("Contra Costa", 2021, 210, 110, 90),
        ]
    )


def test_build_regional_rows_sums_population():
    result = build_regional_rows(
        _bay_area_dataframe(),
        {"Bay Area": ["Alameda", "Contra Costa"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert result["Total Population"].tolist() == [300, 320]


def test_build_regional_rows_sums_housing():
    result = build_regional_rows(
        _bay_area_dataframe(),
        {"Bay Area": ["Alameda", "Contra Costa"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert result[["Total Housing Units", "Occupied Units", "Vacant Units"]].to_dict(
        "records"
    ) == [
        {"Total Housing Units": 150, "Occupied Units": 120, "Vacant Units": 30},
        {"Total Housing Units": 170, "Occupied Units": 140, "Vacant Units": 30},
    ]


def test_build_regional_rows_does_not_sum_rates():
    result = build_regional_rows(
        _bay_area_dataframe(),
        {"Bay Area": ["Alameda", "Contra Costa"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert result["Vacancy Rate (%)"].isna().all()


def test_build_regional_rows_per_year():
    result = build_regional_rows(
        _bay_area_dataframe(),
        {"Bay Area": ["Alameda", "Contra Costa"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert result["Year"].tolist() == [2020, 2021]


def test_build_regional_rows_geographic_level():
    result = build_regional_rows(
        _bay_area_dataframe(),
        {"Bay Area": ["Alameda", "Contra Costa"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert set(result["Geographic Level"]) == {"Region"}


def test_build_regional_rows_all_nine_regions():
    regions = get_geography_config()["regions_mapping"]
    rows = [_county_row(counties[0], 2020) for counties in regions.values()]

    result = build_regional_rows(
        pd.DataFrame(rows), regions, "Location", "Geographic Level", "Year"
    )

    assert set(result["Location"]) == set(regions)


def test_build_regional_rows_missing_county():
    dataframe = pd.DataFrame([_county_row("Alameda", 2020)])

    result = build_regional_rows(
        dataframe,
        {"Bay Area": ["Alameda", "Contra Costa"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert result.loc[0, "Total Population"] == 100


def test_build_regional_rows_ignores_non_county_rows():
    dataframe = pd.DataFrame(
        [
            _county_row("Alameda", 2020, 100),
            {**_county_row("Alameda", 2020, 1_000), "Geographic Level": "City"},
        ]
    )

    result = build_regional_rows(
        dataframe,
        {"Bay Area": ["Alameda"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert result.loc[0, "Total Population"] == 100


def test_build_regional_rows_does_not_double_count_san_francisco():
    dataframe = pd.DataFrame(
        [
            _county_row("San Francisco", 2020, 100),
            {**_county_row("San Francisco", 2020, 100), "Geographic Level": "City"},
        ]
    )

    result = build_regional_rows(
        dataframe,
        {"Bay Area": ["San Francisco"]},
        "Location",
        "Geographic Level",
        "Year",
    )

    assert result.loc[0, "Total Population"] == 100


def test_add_regional_data_replaces_stale_regions():
    dataframe = pd.concat(
        [
            _bay_area_dataframe(),
            pd.DataFrame(
                [
                    {
                        **_county_row("Bay Area", 2020, 999),
                        "Geographic Level": "Region",
                    }
                ]
            ),
        ],
        ignore_index=True,
    )

    result = add_regional_data(
        dataframe, {"Bay Area": ["Alameda", "Contra Costa"]}
    )

    assert result[result["Location"].eq("Bay Area")]["Total Population"].tolist() == [
        300,
        320,
    ]


def test_add_regional_data_rates_are_recalculated():
    result = add_regional_data(
        _bay_area_dataframe(), {"Bay Area": ["Alameda", "Contra Costa"]}
    )
    region_2020 = result[
        result["Location"].eq("Bay Area") & result["Year"].eq(2020)
    ].iloc[0]

    assert (
        region_2020["Vacancy Rate (%)"],
        region_2020["Persons Per Household"],
    ) == (20.0, 2.0)


def test_add_regional_data_preserves_county_rows():
    dataframe = _bay_area_dataframe()

    result = add_regional_data(
        dataframe, {"Bay Area": ["Alameda", "Contra Costa"]}
    )

    pd.testing.assert_frame_equal(result.iloc[: len(dataframe)], dataframe)


def test_add_regional_data_row_count():
    dataframe = _bay_area_dataframe()

    result = add_regional_data(
        dataframe, {"Bay Area": ["Alameda", "Contra Costa"]}
    )

    assert len(result) == len(dataframe) + 2
