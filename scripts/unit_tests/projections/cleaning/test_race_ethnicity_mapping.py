import pandas as pd
import pytest
from scripts.projections.cleaning.race_ethnicity_mapping import (
    P3_RACE7_CODE_MAP,
    get_canonical_race_groups,
    map_race_ethnicity,
    validate_race_mapping_completeness,
)

EXPECTED_RACE_GROUPS = {
    "White",
    "Black",
    "AIAN",
    "Asian",
    "NHPI",
    "Multiracial",
    "Hispanic",
}


def test_p3_race7_code_map_maps_all_seven_codes():
    # Assert
    assert P3_RACE7_CODE_MAP == {
        1: "White",
        2: "Black",
        3: "AIAN",
        4: "Asian",
        5: "NHPI",
        6: "Multiracial",
        7: "Hispanic",
    }


def test_get_canonical_race_groups_returns_seven_unique_groups():
    # Act
    groups = get_canonical_race_groups()

    # Assert
    assert len(groups) == 7
    assert set(groups) == EXPECTED_RACE_GROUPS


def test_map_race_ethnicity_maps_codes_and_renames_column():
    # Arrange
    source = pd.DataFrame({"race7": list(range(1, 8))})

    # Act
    result = map_race_ethnicity(source, "race7", P3_RACE7_CODE_MAP)

    # Assert
    assert set(result["Race/Ethnicity"]) == EXPECTED_RACE_GROUPS
    assert "race7" not in result.columns
    assert source.columns.tolist() == ["race7"]


def test_map_race_ethnicity_reports_every_unmapped_code():
    # Arrange
    source = pd.DataFrame({"RACE": [1, 98, 99]})

    # Act / Assert
    with pytest.raises(ValueError, match=r"98.*99|99.*98"):
        map_race_ethnicity(source, "RACE", {1: "White"})


def test_validate_race_mapping_completeness_rejects_null_and_raw_values():
    # Arrange
    source = pd.DataFrame(
        {"Race/Ethnicity": ["White", None, 4, "not-canonical"]}
    )

    # Act
    is_valid, messages = validate_race_mapping_completeness(
        source,
        "Race/Ethnicity",
    )

    # Assert
    assert is_valid is False
    assert messages
    assert any("null" in message.lower() for message in messages)
    assert any(
        "raw" in message.lower() or "canonical" in message.lower()
        for message in messages
    )


def test_map_race_ethnicity_maps_all_seven_census_codes():
    # Arrange
    census_code_map = {
        "NHWA": "White",
        "NHBA": "Black",
        "NHIA": "AIAN",
        "NHAA": "Asian",
        "NHNA": "NHPI",
        "NHTOM": "Multiracial",
        "H": "Hispanic",
    }
    source = pd.DataFrame({"RACE": list(census_code_map)})

    # Act
    result = map_race_ethnicity(source, "RACE", census_code_map)

    # Assert
    assert set(result["Race/Ethnicity"]) == EXPECTED_RACE_GROUPS


def test_validate_race_mapping_completeness_accepts_canonical_values():
    # Arrange
    source = pd.DataFrame({"Race/Ethnicity": sorted(EXPECTED_RACE_GROUPS)})

    # Act
    is_valid, messages = validate_race_mapping_completeness(
        source,
        "Race/Ethnicity",
    )

    # Assert
    assert is_valid is True
    assert messages == []


def test_map_race_ethnicity_supports_string_codes():
    # Arrange
    source = pd.DataFrame({"RACE": ["1", "2"]})

    # Act
    result = map_race_ethnicity(
        source,
        "RACE",
        {"1": "White", "2": "Black"},
    )

    # Assert
    assert result["Race/Ethnicity"].tolist() == ["White", "Black"]


def test_map_race_ethnicity_preserves_other_columns():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["Alameda"],
            "RACE": [1],
            "Population": [100],
        }
    )

    # Act
    result = map_race_ethnicity(source, "RACE", {1: "White"})

    # Assert
    assert result.loc[0, "Location"] == "Alameda"
    assert result.loc[0, "Population"] == 100
