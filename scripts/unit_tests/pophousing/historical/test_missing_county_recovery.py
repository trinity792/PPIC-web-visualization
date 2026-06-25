import pandas as pd
import pytest

from scripts.pophousing.historical.missing_county_recovery import (
    extract_missing_county_rows,
    integrate_missing_county_rows,
)


@pytest.fixture
def raw_new_format_df():
    """2010-2020 layout with County Total rows (one census, two annual)."""
    rows = [
        ["Alameda", "County Total", "4/1/2010", 1_300_000, 1_250_000, 50_000, 500_000, 250_000, 50_000, 80_000, 100_000, 20_000, 470_000, 6.0, 2.6],
        ["Alameda", "County Total", "1/1/2011", 1_310_000, 1_260_000, 50_000, 505_000, 252_000, 50_000, 81_000, 102_000, 20_000, 472_000, 6.5, 2.6],
        [None, "Oakland", "1/1/2011", 375_000, 365_000, 10_000, 152_000, 70_000, 21_000, 30_000, 26_000, 5_000, 142_000, 6.6, 2.5],
    ]
    return pd.DataFrame(rows)


def test_extract_missing_county_rows_returns_only_counties(raw_new_format_df):
    # Act
    result = extract_missing_county_rows(raw_new_format_df, range(2011, 2020))

    # Assert
    assert set(result["Geographic Level"]) == {"County"}
    assert result["Location"].tolist() == ["Alameda"]
    assert result["Year"].tolist() == [2011]


def test_extract_missing_county_rows_excludes_census_dates(raw_new_format_df):
    # Act: 4/1/2010 census row must not be recovered.
    result = extract_missing_county_rows(raw_new_format_df, range(2010, 2020))

    # Assert
    assert 2010 not in result["Year"].tolist()


def test_extract_missing_county_rows_no_matches_returns_empty(raw_new_format_df):
    # Act
    result = extract_missing_county_rows(raw_new_format_df, range(2025, 2030))

    # Assert
    assert result.empty


def test_integrate_missing_county_rows_adds_only_absent_keys():
    # Arrange
    existing = pd.DataFrame(
        {
            "Geographic Level": ["County"],
            "Location": ["Alameda"],
            "Year": [2011],
            "Total Population": [1_310_000],
        }
    )
    recovered = pd.DataFrame(
        {
            "Geographic Level": ["County", "County"],
            "Location": ["Alameda", "Contra Costa"],
            "Year": [2011, 2011],
            "Total Population": [9_999_999, 1_000_000],
        }
    )

    # Act
    result = integrate_missing_county_rows(existing, recovered)

    # Assert: the existing Alameda row is preserved; only Contra Costa is added.
    assert len(result) == 2
    alameda = result.loc[result["Location"] == "Alameda"].iloc[0]
    assert alameda["Total Population"] == 1_310_000
    assert "Contra Costa" in result["Location"].tolist()


def test_integrate_missing_county_rows_empty_recovery_returns_existing():
    # Arrange
    existing = pd.DataFrame(
        {"Geographic Level": ["County"], "Location": ["Alameda"], "Year": [2011]}
    )

    # Act
    result = integrate_missing_county_rows(existing, pd.DataFrame())

    # Assert
    pd.testing.assert_frame_equal(result, existing)
