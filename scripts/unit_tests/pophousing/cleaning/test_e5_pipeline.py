import pandas as pd
import pytest

from scripts.pophousing.cleaning.e5_pipeline import clean_e5_data
from scripts.pophousing.config.geography import get_geography_config
from scripts.pophousing.config.schemas import get_schema_config


def _raw_row(region, city, date, population, housing, occupied):
    return [
        region,
        city,
        date,
        population,
        population,
        0,
        housing,
        10,
        2,
        3,
        5,
        1,
        occupied,
        0.1,
        2.5,
    ]


def _raw_e5_dataframe():
    return pd.DataFrame(
        [
            ["Metadata"] + [None] * 14,
            _raw_row("Alameda", "County Total", "2020-01-01", "1,600,000", 100, 90),
            _raw_row(None, None, "2021-01-01", "1,610,000", 110, 100),
            _raw_row(None, "Oakland City", "2020-01-01", 440_000, 50, 45),
            _raw_row(None, None, "2021-01-01", 445_000, 55, 50),
            _raw_row(None, "Balance of County", "2020-01-01", 1, 1, 1),
            _raw_row("California", "State Total", "2020-01-01", 39_000_000, 1_000, 900),
        ]
    )


def test_clean_e5_data_end_to_end():
    raw_e5_df = _raw_e5_dataframe()

    result = clean_e5_data(raw_e5_df, get_schema_config(), get_geography_config())

    assert set(result["Location"]) == {"Alameda", "Oakland", "California"}
    assert set(result["Geographic Level"]) == {"County", "City", "State"}
    assert result["Year"].tolist() == [2020, 2021, 2020, 2021, 2020]


def test_clean_e5_data_calculates_housing_columns():
    result = clean_e5_data(_raw_e5_dataframe(), get_schema_config(), get_geography_config())

    oakland_2020 = result[(result["Location"] == "Oakland") & (result["Year"] == 2020)].iloc[0]
    assert oakland_2020["Single Family Units"] == 12
    assert oakland_2020["Multiple Family Units"] == 8
    assert oakland_2020["Vacant Units"] == 5


def test_clean_e5_data_drops_invalid_dates():
    raw_e5_df = _raw_e5_dataframe()
    raw_e5_df.iloc[2, 2] = "not-a-date"

    result = clean_e5_data(raw_e5_df, get_schema_config(), get_geography_config())

    assert len(result) == 4


def test_clean_e5_data_does_not_mutate_input():
    raw_e5_df = _raw_e5_dataframe()
    original = raw_e5_df.copy(deep=True)

    clean_e5_data(raw_e5_df, get_schema_config(), get_geography_config())

    pd.testing.assert_frame_equal(raw_e5_df, original)


def test_clean_e5_data_missing_anchor():
    raw_e5_df = pd.DataFrame([_raw_row("Other", "City", "2020-01-01", 1, 1, 1)])

    with pytest.raises(ValueError, match="anchor.*Alameda.*not found"):
        clean_e5_data(raw_e5_df, get_schema_config(), get_geography_config())
