import numpy as np
import pandas as pd
import pytest

from scripts.components_of_change.cleaning import e6_cleaner
from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography

CANONICAL = get_columns_config()["canonical_columns"]


def _raw_row(location, year, population, births=100, deaths=40, net_mig=5, foreign=3, domestic=2):
    # Raw E-6 carries percent / numeric change and Natural Increase per row.
    natural = births - deaths
    return [location, year, population, 1.0, 1000.0, births, deaths, natural, net_mig, foreign, domestic]


"""
========================================================================================================================
normalize_e6_columns
========================================================================================================================
"""


def test_normalize_e6_columns_trims_and_renames():
    # Arrange: a junk header row precedes the first real (Alameda) data row.
    raw = pd.DataFrame(
        [
            ["Table E-6 header"] + [np.nan] * 10,
            _raw_row("Alameda", 2020, 1_500_000),
        ]
    )

    # Act
    result = e6_cleaner.normalize_e6_columns(raw, CANONICAL)

    # Assert
    assert list(result.columns) == CANONICAL
    assert result.loc[0, "Location"] == "Alameda"
    assert len(result) == 1


def test_normalize_e6_columns_drops_all_nan_columns():
    # Arrange: an extra all-NaN column must be dropped before the count check.
    raw = pd.DataFrame([_raw_row("California", 2020, 39_000_000) + [np.nan]])

    # Act
    result = e6_cleaner.normalize_e6_columns(raw, CANONICAL)

    # Assert
    assert list(result.columns) == CANONICAL


def test_normalize_e6_columns_drops_census_quarter_rows():
    # Arrange
    raw = pd.DataFrame(
        [
            _raw_row("Alameda", "Apr-Jun 2020", 1_500_000),
            _raw_row("Alameda", 2021, 1_510_000),
        ]
    )

    # Act
    result = e6_cleaner.normalize_e6_columns(raw, CANONICAL)

    # Assert
    assert "Apr-Jun 2020" not in result["Year"].tolist()
    assert result.iloc[0]["Year"] == 2021


def test_normalize_e6_columns_wrong_column_count_raises():
    # Arrange
    raw = pd.DataFrame([["Alameda", 2020, 1]])

    # Act / Assert
    with pytest.raises(ValueError, match="Expected 11 E-6 columns"):
        e6_cleaner.normalize_e6_columns(raw, CANONICAL)


def test_normalize_e6_columns_no_anchor_row_raises():
    # Arrange: no California / Alameda anchor row exists.
    raw = pd.DataFrame([_raw_row("Sacramento", 2020, 1_500_000)])

    # Act / Assert
    with pytest.raises(ValueError, match="first E-6 data row"):
        e6_cleaner.normalize_e6_columns(raw, CANONICAL)


"""
========================================================================================================================
repair_truncated_county_names
========================================================================================================================
"""


def test_repair_truncated_county_names_basic_mapping():
    # Arrange
    frame = pd.DataFrame({"Location": ["Contra ", "Los", "San Luis"]})

    # Act
    result = e6_cleaner.repair_truncated_county_names(frame)

    # Assert
    assert result["Location"].tolist() == ["Contra Costa", "Los Angeles", "San Luis Obispo"]


def test_repair_truncated_county_names_positional_san_and_santa():
    # Arrange: the two "San" rows and two "Santa" rows resolve positionally.
    frame = pd.DataFrame({"Location": ["San", "Santa", "San", "Santa"]})

    # Act
    result = e6_cleaner.repair_truncated_county_names(frame)

    # Assert
    assert result["Location"].tolist() == ["San Francisco", "Santa Barbara", "San Joaquin", "Santa Clara"]


def test_repair_truncated_county_names_custom_override():
    # Arrange
    frame = pd.DataFrame({"Location": ["Contra "]})

    # Act
    result = e6_cleaner.repair_truncated_county_names(frame, {"Contra ": "Contra Costa County"})

    # Assert
    assert result.loc[0, "Location"] == "Contra Costa County"


def test_repair_truncated_county_names_does_not_mutate_input():
    # Arrange
    frame = pd.DataFrame({"Location": ["Los"]})

    # Act
    e6_cleaner.repair_truncated_county_names(frame)

    # Assert
    assert frame.loc[0, "Location"] == "Los"


def test_repair_truncated_county_names_unexpected_san_count_raises():
    # Arrange: only one bare "San" stub instead of the expected two — a layout shift.
    frame = pd.DataFrame({"Location": ["San", "Santa", "Santa"]})

    # Act / Assert
    with pytest.raises(ValueError, match="truncated 'San' county rows"):
        e6_cleaner.repair_truncated_county_names(frame)


"""
========================================================================================================================
forward_fill_locations_by_year_block
========================================================================================================================
"""


def test_forward_fill_locations_by_year_block_fills_blanks():
    # Arrange: each location name appears once, followed by blank year rows.
    frame = pd.DataFrame(
        {
            "Location": ["Alameda", np.nan, "Yuba", np.nan],
            "Year": [2020, 2021, 2020, 2021],
        }
    )

    # Act
    result = e6_cleaner.forward_fill_locations_by_year_block(frame, "Location", "Year")

    # Assert
    assert result["Location"].tolist() == ["Alameda", "Alameda", "Yuba", "Yuba"]


def test_forward_fill_locations_strips_census_prefix_and_coerces_year():
    # Arrange
    frame = pd.DataFrame({"Location": ["Alameda", np.nan], "Year": ["Census 2020", "2021"]})

    # Act
    result = e6_cleaner.forward_fill_locations_by_year_block(frame, "Location", "Year")

    # Assert
    assert result["Year"].tolist() == [2020.0, 2021.0]


def test_forward_fill_locations_no_valid_years_raises():
    # Arrange
    frame = pd.DataFrame({"Location": ["Alameda"], "Year": ["not-a-year"]})

    # Act / Assert
    with pytest.raises(ValueError, match="does not contain valid years"):
        e6_cleaner.forward_fill_locations_by_year_block(frame, "Location", "Year")


def test_forward_fill_locations_handles_uneven_block_lengths():
    # Arrange: Alameda has three years, Yuba only two — the old fixed-span fill would
    # over-run Alameda into Yuba's block.
    frame = pd.DataFrame(
        {
            "Location": ["Alameda", np.nan, np.nan, "Yuba", np.nan],
            "Year": [2019, 2020, 2021, 2020, 2021],
        }
    )

    # Act
    result = e6_cleaner.forward_fill_locations_by_year_block(frame, "Location", "Year")

    # Assert: each block keeps its own name; no over-run.
    assert result["Location"].tolist() == ["Alameda", "Alameda", "Alameda", "Yuba", "Yuba"]


def test_forward_fill_locations_overlapping_blocks_raises():
    # Arrange: a missing name row would merge two blocks under one location, producing
    # a duplicate (location, year).
    frame = pd.DataFrame(
        {
            "Location": ["Alameda", np.nan, np.nan],
            "Year": [2020, 2021, 2020],
        }
    )

    # Act / Assert
    with pytest.raises(ValueError, match="year blocks overlap"):
        e6_cleaner.forward_fill_locations_by_year_block(frame, "Location", "Year")


"""
========================================================================================================================
clean_e6 (orchestration)
========================================================================================================================
"""


def _full_raw_e6():
    rows = [
        ["Components of Change Table E-6"] + [np.nan] * 10,
        _raw_row("California", 2020, 39_000_000, births=400_000, deaths=300_000),
        [np.nan, 2021, 39_200_000, 0.5, 200_000.0, 410_000, 305_000, 105_000, 9_000, 6_000, 3_000],
        _raw_row("Alameda", 2020, 1_500_000),
        [np.nan, 2021, 1_510_000, 0.7, 10_000.0, 110, 45, 65, 6, 4, 2],
        _raw_row("Yuba", 2020, 80_000),
        [np.nan, 2021, 81_000, 1.2, 1_000.0, 90, 35, 55, 4, 3, 1],
    ]
    return pd.DataFrame(rows)


def test_clean_e6_comprehensive_end_to_end():
    # Arrange
    columns_config = get_columns_config()
    geography_config = get_components_geography()

    # Act
    result = e6_cleaner.clean_e6(_full_raw_e6(), columns_config, geography_config)

    # Assert: source labelled, California abbreviated, min year dropped, rates added.
    assert (result["Source"] == "DoF").all()
    assert "CA" in result["Location"].tolist()
    assert "California" not in result["Location"].tolist()
    assert result["Year"].tolist() == [2021] * len(result)
    assert pd.api.types.is_integer_dtype(result["Year"])
    assert "Crude Birth Rate" in result.columns
    # Counties present plus their rebuilt regional aggregates.
    assert {"Alameda", "Yuba"}.issubset(set(result["Location"]))
    assert {"Bay Area", "Far North"}.issubset(set(result["Location"]))


def test_clean_e6_keeps_county_year_with_one_missing_component():
    # Arrange: blank out Alameda 2021's Births only; the row must survive with Births
    # null rather than being dropped wholesale (guide B2).
    raw = _full_raw_e6()
    raw.iloc[4, 5] = np.nan  # Alameda 2021, Births column
    columns_config = get_columns_config()
    geography_config = get_components_geography()

    # Act
    result = e6_cleaner.clean_e6(raw, columns_config, geography_config)

    # Assert
    alameda = result.loc[result["Location"].eq("Alameda")]
    assert not alameda.empty
    assert alameda["Births"].isna().all()


def test_clean_e6_drops_earliest_year_per_location():
    # Arrange: Yuba starts a year earlier than the others; only its own earliest year
    # should be dropped, not every location's, and not Yuba's later years (guide A7).
    raw = _full_raw_e6()
    columns_config = get_columns_config()
    geography_config = get_components_geography()

    # Act
    result = e6_cleaner.clean_e6(raw, columns_config, geography_config)

    # Assert: the shared earliest year (2020) is gone, 2021 remains for every county.
    assert 2020 not in set(result["Year"])
    assert {"Alameda", "Yuba"}.issubset(set(result.loc[result["Year"].eq(2021), "Location"]))


def test_clean_e6_missing_yuba_terminator_raises():
    # Arrange: drop the Yuba block so the terminal-row anchor is missing.
    raw = _full_raw_e6().iloc[:5]
    columns_config = get_columns_config()
    geography_config = get_components_geography()

    # Act / Assert
    with pytest.raises(ValueError, match="final Yuba row"):
        e6_cleaner.clean_e6(raw, columns_config, geography_config)
