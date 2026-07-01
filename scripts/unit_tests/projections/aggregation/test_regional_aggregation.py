import pandas as pd
from scripts.projections.aggregation.regional_aggregation import (
    add_regional_data,
    add_state_total,
)

GROUPBY_DIMENSIONS = [
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Source",
]


def _county_row(
    location,
    population=100,
    year=2025,
    age_group="0-4",
    sex="Female",
    race="Asian",
    source="DoF P-3",
):
    return {
        "Geographic Level": "County",
        "Location": location,
        "Year": year,
        "Age Group": age_group,
        "Sex": sex,
        "Race/Ethnicity": race,
        "Population": population,
        "Source": source,
    }


def test_add_regional_data_produces_nine_regions_per_stratification():
    # Arrange
    regions = {
        f"Region {number}": [f"County {number}"]
        for number in range(1, 10)
    }
    source = pd.DataFrame(
        [
            _county_row(f"County {number}", population=number)
            for number in range(1, 10)
        ]
    )

    # Act
    result = add_regional_data(source, regions, GROUPBY_DIMENSIONS)

    # Assert
    region_rows = result[result["Geographic Level"].eq("Region")]
    assert len(region_rows) == 9
    assert set(region_rows["Location"]) == set(regions)


def test_add_regional_data_sums_constituent_county_populations():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100),
            _county_row("Contra Costa", population=250),
        ]
    )
    regions = {"Bay Area": ["Alameda", "Contra Costa"]}

    # Act
    result = add_regional_data(source, regions, GROUPBY_DIMENSIONS)

    # Assert
    region = result[result["Location"].eq("Bay Area")].iloc[0]
    assert region["Population"] == 350


def test_add_regional_data_sets_region_geographic_level():
    # Arrange
    source = pd.DataFrame([_county_row("Alameda")])

    # Act
    result = add_regional_data(
        source,
        {"Bay Area": ["Alameda"]},
        GROUPBY_DIMENSIONS,
    )

    # Assert
    region = result[result["Location"].eq("Bay Area")].iloc[0]
    assert region["Geographic Level"] == "Region"


def test_add_regional_data_preserves_original_rows_and_input():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100),
            _county_row("Contra Costa", population=250),
        ]
    )
    original = source.copy(deep=True)

    # Act
    result = add_regional_data(
        source,
        {"Bay Area": ["Alameda", "Contra Costa"]},
        GROUPBY_DIMENSIONS,
    )

    # Assert
    pd.testing.assert_frame_equal(source, original)
    pd.testing.assert_frame_equal(
        result[result["Geographic Level"].eq("County")].reset_index(drop=True),
        original,
    )


def test_add_regional_data_keeps_stratifications_separate():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100, sex="Female"),
            _county_row("Alameda", population=80, sex="Male"),
        ]
    )

    # Act
    result = add_regional_data(
        source,
        {"Bay Area": ["Alameda"]},
        GROUPBY_DIMENSIONS,
    )

    # Assert
    region_rows = result[result["Location"].eq("Bay Area")]
    assert len(region_rows) == 2
    assert region_rows.set_index("Sex")["Population"].to_dict() == {
        "Female": 100,
        "Male": 80,
    }


"""
========================================================================================================================
State Aggregation
========================================================================================================================
"""


def test_add_state_total_sums_county_populations():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100),
            _county_row("Yuba", population=40),
        ]
    )

    # Act
    result = add_state_total(
        source,
        ["Alameda", "Yuba"],
        GROUPBY_DIMENSIONS,
    )

    # Assert
    state = result[result["Location"].eq("California")].iloc[0]
    assert state["Population"] == 140


def test_add_state_total_sets_state_geographic_level():
    # Arrange
    source = pd.DataFrame([_county_row("Alameda")])

    # Act
    result = add_state_total(source, ["Alameda"], GROUPBY_DIMENSIONS)

    # Assert
    state = result[result["Location"].eq("California")].iloc[0]
    assert state["Geographic Level"] == "State"


def test_add_state_total_skips_existing_state_for_same_source_and_dimensions():
    # Arrange
    existing_state = _county_row("California", population=999)
    existing_state["Geographic Level"] = "State"
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100),
            existing_state,
        ]
    )

    # Act
    result = add_state_total(source, ["Alameda"], GROUPBY_DIMENSIONS)

    # Assert
    state_rows = result[result["Location"].eq("California")]
    assert len(state_rows) == 1
    assert state_rows.iloc[0]["Population"] == 999


def test_add_state_total_adds_dof_state_when_census_state_exists():
    # Arrange
    census_state = _county_row(
        "California",
        population=500,
        source="Census cc-est",
    )
    census_state["Geographic Level"] = "US State"
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100, source="DoF P-3"),
            census_state,
        ]
    )

    # Act
    result = add_state_total(source, ["Alameda"], GROUPBY_DIMENSIONS)

    # Assert
    state_rows = result[result["Location"].eq("California")]
    assert state_rows.set_index("Source")["Population"].to_dict() == {
        "Census cc-est": 500,
        "DoF P-3": 100,
    }
    assert state_rows.set_index("Source")["Geographic Level"].to_dict() == {
        "Census cc-est": "US State",
        "DoF P-3": "State",
    }


def test_add_state_total_keeps_stratifications_separate():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100, sex="Female"),
            _county_row("Alameda", population=80, sex="Male"),
        ]
    )

    # Act
    result = add_state_total(source, ["Alameda"], GROUPBY_DIMENSIONS)

    # Assert
    state_rows = result[result["Location"].eq("California")]
    assert state_rows.set_index("Sex")["Population"].to_dict() == {
        "Female": 100,
        "Male": 80,
    }


def test_add_state_total_supports_custom_state_name():
    # Arrange
    source = pd.DataFrame([_county_row("Alameda", population=100)])

    # Act
    result = add_state_total(
        source,
        ["Alameda"],
        GROUPBY_DIMENSIONS,
        state_name="CA",
    )

    # Assert
    assert "CA" in set(result["Location"])
    assert "California" not in set(result["Location"])


def test_add_state_total_with_no_matching_counties_returns_original_rows():
    # Arrange
    source = pd.DataFrame([_county_row("Nevada County", population=100)])
    original = source.copy(deep=True)

    # Act
    result = add_state_total(source, ["Alameda"], GROUPBY_DIMENSIONS)

    # Assert
    pd.testing.assert_frame_equal(result.reset_index(drop=True), original)
    pd.testing.assert_frame_equal(source, original)


def test_add_regional_data_with_no_matching_counties_returns_original_rows():
    # Arrange
    source = pd.DataFrame([_county_row("Yuba")])
    original = source.copy(deep=True)

    # Act
    result = add_regional_data(
        source,
        {"Bay Area": ["Alameda"]},
        GROUPBY_DIMENSIONS,
    )

    # Assert
    pd.testing.assert_frame_equal(result.reset_index(drop=True), original)


def test_add_regional_data_aggregates_only_county_level_rows():
    # Arrange
    county = _county_row("Alameda", population=100)
    state = _county_row("Alameda", population=900)
    state["Geographic Level"] = "State"
    source = pd.DataFrame([county, state])

    # Act
    result = add_regional_data(
        source,
        {"Bay Area": ["Alameda"]},
        GROUPBY_DIMENSIONS,
    )

    # Assert
    region = result[result["Location"].eq("Bay Area")].iloc[0]
    assert region["Population"] == 100


def test_add_state_total_aggregates_only_county_level_rows():
    # Arrange
    county = _county_row("Alameda", population=100)
    region = _county_row("Alameda", population=900)
    region["Geographic Level"] = "Region"
    source = pd.DataFrame([county, region])

    # Act
    result = add_state_total(source, ["Alameda"], GROUPBY_DIMENSIONS)

    # Assert
    state = result[result["Location"].eq("California")].iloc[0]
    assert state["Population"] == 100


def test_add_regional_data_keeps_sources_separate():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100, source="DoF P-3"),
            _county_row(
                "Alameda",
                population=80,
                source="Census cc-est",
            ),
        ]
    )

    # Act
    result = add_regional_data(
        source,
        {"Bay Area": ["Alameda"]},
        GROUPBY_DIMENSIONS,
    )

    # Assert
    region_rows = result[result["Location"].eq("Bay Area")]
    assert region_rows.set_index("Source")["Population"].to_dict() == {
        "Census cc-est": 80,
        "DoF P-3": 100,
    }


def test_add_regional_data_excludes_nonmember_counties_from_total():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100),
            _county_row("Yuba", population=900),
        ]
    )

    # Act
    result = add_regional_data(
        source,
        {"Bay Area": ["Alameda"]},
        GROUPBY_DIMENSIONS,
    )

    # Assert
    region = result[result["Location"].eq("Bay Area")].iloc[0]
    assert region["Population"] == 100
    assert "Yuba" in set(result["Location"])


def test_add_state_total_does_not_modify_input_when_state_is_added():
    # Arrange
    source = pd.DataFrame(
        [
            _county_row("Alameda", population=100),
            _county_row("Yuba", population=40),
        ]
    )
    original = source.copy(deep=True)

    # Act
    add_state_total(
        source,
        ["Alameda", "Yuba"],
        GROUPBY_DIMENSIONS,
    )

    # Assert
    pd.testing.assert_frame_equal(source, original)
