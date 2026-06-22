import pandas as pd

from scripts.pophousing.aggregation.state_aggregation import (
    add_state_data_for_missing_years,
    build_state_rows_from_counties,
    find_missing_state_years,
)


def _row(location, level, year, population=100, housing=50, occupied=40):
    return {
        "Location": location,
        "Geographic Level": level,
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


def _state_gap_dataframe():
    return pd.DataFrame(
        [
            _row("California", "State", 2020, 1_000, 500, 450),
            _row("Alameda", "County", 2020, 100, 50, 40),
            _row("Contra Costa", "County", 2020, 200, 100, 80),
            _row("Alameda", "County", 2021, 110, 60, 50),
            _row("Contra Costa", "County", 2021, 210, 110, 90),
        ]
    )


def test_find_missing_state_years_some_missing():
    result = find_missing_state_years(
        _state_gap_dataframe(), "California", "Year"
    )

    assert result == [2021]


def test_find_missing_state_years_none_missing():
    dataframe = pd.concat(
        [
            _state_gap_dataframe(),
            pd.DataFrame([_row("California", "State", 2021)]),
        ],
        ignore_index=True,
    )

    result = find_missing_state_years(dataframe, "California", "Year")

    assert result == []


def test_find_missing_state_years_all_missing():
    dataframe = _state_gap_dataframe()
    dataframe = dataframe[dataframe["Geographic Level"].eq("County")]

    result = find_missing_state_years(dataframe, "California", "Year")

    assert result == [2020, 2021]


def test_find_missing_state_years_ignores_city_only_years():
    dataframe = pd.concat(
        [
            _state_gap_dataframe(),
            pd.DataFrame([_row("Oakland", "City", 2022)]),
        ],
        ignore_index=True,
    )

    result = find_missing_state_years(dataframe, "California", "Year")

    assert result == [2021]


def test_build_state_rows_sums_counties():
    result = build_state_rows_from_counties(
        _state_gap_dataframe(), [2021], "California"
    )

    assert result.loc[0, "Total Population"] == 320


def test_build_state_rows_does_not_sum_rates():
    result = build_state_rows_from_counties(
        _state_gap_dataframe(), [2021], "California"
    )

    assert result["Vacancy Rate (%)"].isna().all()


def test_build_state_rows_geographic_level():
    result = build_state_rows_from_counties(
        _state_gap_dataframe(), [2021], "California"
    )

    assert result[["Location", "Geographic Level"]].to_dict("records") == [
        {"Location": "California", "Geographic Level": "State"}
    ]


def test_build_state_rows_only_missing_years():
    result = build_state_rows_from_counties(
        _state_gap_dataframe(), [2021], "California"
    )

    assert result["Year"].tolist() == [2021]


def test_build_state_rows_ignores_non_county():
    dataframe = pd.concat(
        [
            _state_gap_dataframe(),
            pd.DataFrame([_row("Oakland", "City", 2021, 1_000)]),
        ],
        ignore_index=True,
    )

    result = build_state_rows_from_counties(
        dataframe, [2021], "California"
    )

    assert result.loc[0, "Total Population"] == 320


def test_add_state_data_fills_gaps():
    result = add_state_data_for_missing_years(
        _state_gap_dataframe(), "California"
    )

    assert result[
        result["Location"].eq("California") & result["Year"].eq(2021)
    ].shape[0] == 1


def test_add_state_data_no_gaps():
    dataframe = pd.concat(
        [
            _state_gap_dataframe(),
            pd.DataFrame([_row("California", "State", 2021)]),
        ],
        ignore_index=True,
    )

    result = add_state_data_for_missing_years(dataframe, "California")

    pd.testing.assert_frame_equal(result, dataframe)


def test_add_state_data_rates_recalculated():
    result = add_state_data_for_missing_years(
        _state_gap_dataframe(), "California"
    )
    state_2021 = result[
        result["Location"].eq("California") & result["Year"].eq(2021)
    ].iloc[0]

    assert (
        state_2021["Vacancy Rate (%)"],
        state_2021["Persons Per Household"],
    ) == (30 / 170 * 100, 280 / 140)


def test_add_state_data_preserves_existing_state_rows():
    dataframe = _state_gap_dataframe()
    original_state = dataframe[dataframe["Location"].eq("California")]

    result = add_state_data_for_missing_years(dataframe, "California")

    pd.testing.assert_frame_equal(
        result.iloc[[0]].reset_index(drop=True), original_state.reset_index(drop=True)
    )
