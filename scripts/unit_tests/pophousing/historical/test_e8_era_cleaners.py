import pandas as pd
import pytest

from scripts.pophousing.historical.e8_era_cleaners import (
    clean_1990_2000,
    clean_2000_2010,
    clean_2010_2020,
)


@pytest.fixture
def old_format_e8_df():
    """Single-column hierarchical layout: California/State Total, county header + County Total, cities."""
    rows = [
        ["California", None, None, None, None, None, None, None, None, None, None, None],
        ["State Total", "1/1/1991", 30_000_000, 28_000_000, 2_000_000, 11_000_000, 6_000_000, 4_000_000, 1_000_000, 10_000_000, 0.05, 2.8],
        ["Alameda", None, None, None, None, None, None, None, None, None, None, None],
        ["County Total", "1/1/1991", 1_300_000, 1_250_000, 50_000, 500_000, 300_000, 180_000, 20_000, 470_000, 0.06, 2.6],
        ["Oakland", "1/1/1991", 370_000, 360_000, 10_000, 150_000, 90_000, 55_000, 5_000, 140_000, 0.04, 2.5],
        [None, "1/1/1992", 375_000, 365_000, 10_000, 152_000, 91_000, 56_000, 5_000, 142_000, 0.045, 2.5],
        ["Berkeley", "1/1/1991", 100_000, 98_000, 2_000, 45_000, 25_000, 18_000, 2_000, 43_000, 0.03, 2.2],
    ]
    return pd.DataFrame(rows)


@pytest.fixture
def new_format_e8_df():
    """2010-2020 layout mirroring the modern E-5 workbook (County, City, Date, ...)."""
    rows = [
        ["Alameda", "County Total", "1/1/2011", 1_310_000, 1_260_000, 50_000, 505_000, 252_000, 50_000, 81_000, 102_000, 20_000, 472_000, 6.5, 2.6],
        [None, "Oakland", "1/1/2011", 375_000, 365_000, 10_000, 152_000, 70_000, 21_000, 30_000, 26_000, 5_000, 142_000, 6.6, 2.5],
        ["California", "State Total", "1/1/2011", 37_200_000, 35_000_000, 2_200_000, 13_700_000, 7_000_000, 1_500_000, 2_200_000, 2_800_000, 200_000, 12_900_000, 5.8, 2.7],
    ]
    return pd.DataFrame(rows)


def _level_of(dataframe, location):
    return set(
        dataframe.loc[dataframe["Location"] == location, "Geographic Level"]
    )


def test_clean_1990_2000_classifies_levels(old_format_e8_df):
    # Act
    result = clean_1990_2000(old_format_e8_df)

    # Assert
    assert _level_of(result, "Alameda") == {"County"}
    assert _level_of(result, "Oakland") == {"City"}
    assert _level_of(result, "Berkeley") == {"City"}
    assert "State" in set(result.loc[result["Location"] == "California", "Geographic Level"])


def test_clean_1990_2000_resolves_summary_labels(old_format_e8_df):
    # Act
    result = clean_1990_2000(old_format_e8_df)

    # Assert: hierarchical summary labels are replaced, not left in Location.
    assert "County Total" not in result["Location"].tolist()
    assert "State Total" not in result["Location"].tolist()


def test_clean_1990_2000_forward_fills_blank_location(old_format_e8_df):
    # Act
    result = clean_1990_2000(old_format_e8_df)

    # Assert: the blank 1992 continuation row inherits Oakland.
    oakland_years = result.loc[result["Location"] == "Oakland", "Year"].tolist()
    assert "1/1/1991" in oakland_years and "1/1/1992" in oakland_years


def test_clean_1990_2000_derives_vacant_units_when_absent(old_format_e8_df):
    # Act
    result = clean_1990_2000(old_format_e8_df)

    # Assert: Vacant Units = Total Housing Units - Occupied Units.
    alameda = result.loc[result["Location"] == "Alameda"].iloc[0]
    assert alameda["Vacant Units"] == 30_000


def test_clean_2000_2010_matches_old_structure(old_format_e8_df):
    # Act: 2000-2010 reuses the 1990-2000 layout handling.
    result = clean_2000_2010(old_format_e8_df)

    # Assert
    assert _level_of(result, "Alameda") == {"County"}
    assert _level_of(result, "Oakland") == {"City"}


def test_clean_2010_2020_classifies_levels(new_format_e8_df):
    # Act
    result = clean_2010_2020(new_format_e8_df)

    # Assert
    assert _level_of(result, "Alameda") == {"County"}
    assert _level_of(result, "Oakland") == {"City"}
    assert _level_of(result, "California") == {"State"}


def test_clean_2010_2020_derives_housing_breakdown(new_format_e8_df):
    # Act
    result = clean_2010_2020(new_format_e8_df)

    # Assert: Single/Multiple Family totals are derived from the detail columns.
    oakland = result.loc[result["Location"] == "Oakland"].iloc[0]
    assert oakland["Single Family Units"] == 70_000 + 21_000
    assert oakland["Multiple Family Units"] == 30_000 + 26_000


def test_clean_2010_2020_keeps_raw_date_for_census_filtering(new_format_e8_df):
    # Act
    result = clean_2010_2020(new_format_e8_df)

    # Assert: the Year column still holds the raw date so census rows can be dropped later.
    assert "1/1/2011" in result["Year"].astype(str).tolist()
