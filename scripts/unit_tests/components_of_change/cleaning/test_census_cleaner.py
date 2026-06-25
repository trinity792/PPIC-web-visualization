import pandas as pd
import pytest

from scripts.components_of_change.cleaning import census_cleaner
from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography

# Census wide columns: the first six are positional metadata; CTYNAME is index 6.
_LEADING_COLUMNS = ["SUMLEV", "STATE", "COUNTY", "STNAME", "REGION", "DIVISION", "CTYNAME"]


def _stat_columns(year):
    return {
        f"POPESTIMATE{year}": None,
        f"BIRTHS{year}": None,
        f"DEATHS{year}": None,
        f"NATURALCHG{year}": None,
        f"NETMIG{year}": None,
        f"DOMESTICMIG{year}": None,
        f"INTERNATIONALMIG{year}": None,
    }


def _raw_census_row(stname, ctyname, values_by_year):
    row = {column: None for column in _LEADING_COLUMNS}
    row["STNAME"] = stname
    row["CTYNAME"] = ctyname
    for year, values in values_by_year.items():
        row[f"POPESTIMATE{year}"] = values["pop"]
        row[f"BIRTHS{year}"] = values["births"]
        row[f"DEATHS{year}"] = values["deaths"]
        row[f"NATURALCHG{year}"] = values["births"] - values["deaths"]
        row[f"NETMIG{year}"] = values["net_mig"]
        row[f"DOMESTICMIG{year}"] = values["domestic"]
        row[f"INTERNATIONALMIG{year}"] = values["foreign"]
    return row


def _raw_census_frame():
    years = {
        2020: {"pop": 1_000_000, "births": 1_000, "deaths": 600, "net_mig": 50, "domestic": 30, "foreign": 20},
        2021: {"pop": 1_010_000, "births": 1_100, "deaths": 620, "net_mig": 55, "domestic": 33, "foreign": 22},
    }
    rows = [
        _raw_census_row("California", "California", years),
        _raw_census_row("California", "Alameda County", years),
        _raw_census_row("California", "Yuba County", years),
        _raw_census_row("Texas", "Texas", years),
    ]
    columns = _LEADING_COLUMNS + list(_stat_columns(2020)) + list(_stat_columns(2021))
    return pd.DataFrame(rows, columns=columns)


"""
========================================================================================================================
map_state_abbreviations
========================================================================================================================
"""


def test_map_state_abbreviations_maps_known_states():
    # Arrange
    frame = pd.DataFrame({"CTYNAME": ["Texas", "Alameda County"]})

    # Act
    result = census_cleaner.map_state_abbreviations(frame, {"Texas": "TX"})

    # Assert: known state names map; unmapped county names are preserved.
    assert result["CTYNAME"].tolist() == ["TX", "Alameda County"]


"""
========================================================================================================================
reshape_census_wide_to_long
========================================================================================================================
"""


def test_reshape_census_wide_to_long_pivots_and_renames():
    # Arrange
    raw = _raw_census_frame().head(2)  # California state total + Alameda County

    # Act
    result = census_cleaner.reshape_census_wide_to_long(raw, get_columns_config())

    # Assert
    assert {"Location", "Year", "Births", "Total Population"}.issubset(result.columns)
    assert set(result["Year"]) == {2020, 2021}
    assert "Alameda" in set(result["Location"])  # " County" suffix stripped
    # Original uppercase Census codes are dropped after rename.
    assert not any(isinstance(col, str) and col.isupper() for col in result.columns)


def test_reshape_census_wide_to_long_missing_ctyname_raises():
    # Arrange
    raw = pd.DataFrame({"STNAME": ["California"], "POPESTIMATE2021": [1]})

    # Act / Assert
    with pytest.raises(KeyError, match="CTYNAME"):
        census_cleaner.reshape_census_wide_to_long(raw, get_columns_config())


"""
========================================================================================================================
clean_census_components (orchestration)
========================================================================================================================
"""


def test_clean_census_components_comprehensive_end_to_end():
    # Arrange
    columns_config = get_columns_config()
    geography_config = get_components_geography()

    # Act
    result = census_cleaner.clean_census_components(_raw_census_frame(), columns_config, geography_config)

    # Assert: source labelled, 2020 dropped, national state abbreviated, rates + change added.
    assert (result["Source"] == "Census").all()
    assert 2020 not in set(result["Year"])
    assert "TX" in set(result["Location"])  # national state mapped to abbreviation
    assert {"Alameda", "Yuba"}.issubset(set(result["Location"]))
    assert {"Crude Birth Rate", "Percent Change in Population"}.issubset(result.columns)


def test_clean_census_components_filters_other_states():
    # Arrange: a non-national state row (Ontario, not in the U.S. mapping) is excluded.
    raw = _raw_census_frame()
    extra = raw.iloc[[3]].copy()
    extra["STNAME"] = "Ontario"
    extra["CTYNAME"] = "Ontario"
    raw = pd.concat([raw, extra], ignore_index=True)
    columns_config = get_columns_config()
    geography_config = get_components_geography()

    # Act
    result = census_cleaner.clean_census_components(raw, columns_config, geography_config)

    # Assert
    assert "Ontario" not in set(result["Location"])


def test_clean_census_components_missing_required_columns_raises():
    # Arrange
    raw = pd.DataFrame({"CTYNAME": ["Alameda County"], "POPESTIMATE2021": [1]})
    columns_config = get_columns_config()
    geography_config = get_components_geography()

    # Act / Assert
    with pytest.raises(KeyError, match="STNAME"):
        census_cleaner.clean_census_components(raw, columns_config, geography_config)
