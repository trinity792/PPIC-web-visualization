from scripts.shared.geography.california_geography import get_california_geography

EXPECTED_CBSA_METROS = {
    "Bakersfield",
    "Chico",
    "El Centro",
    "Fresno",
    "Hanford",
    "Inland Empire",
    "Los Angeles",
    "Madera",
    "Merced",
    "Modesto",
    "Napa",
    "Redding",
    "Sacramento",
    "Salinas",
    "San Diego",
    "San Francisco",
    "San Jose",
    "San Luis Obispo",
    "Santa Barbara",
    "Santa Cruz",
    "Santa Rosa",
    "Stockton",
    "Vallejo",
    "Ventura",
    "Visalia",
    "Yuba City",
}


def test_get_california_geography_counties_include_san_francisco():
    # Act
    config = get_california_geography()

    # Assert: 57 base counties plus San Francisco treated as a county.
    assert len(config["county_names"]) == 58
    assert "San Francisco" in config["county_names"]
    assert "Alameda" in config["county_names"]


def test_get_california_geography_regions():
    # Act
    config = get_california_geography()

    # Assert
    assert len(config["regions_mapping"]) == 9
    assert "Bay Area" in config["region_names"]
    assert "Alameda" in config["regions_mapping"]["Bay Area"]


def test_get_california_geography_state_name():
    # Act
    config = get_california_geography()

    # Assert
    assert config["state_name"] == "California"


def test_get_california_geography_returns_independent_values():
    # Arrange
    first_config = get_california_geography()
    first_config["county_names"].add("Unexpected")
    first_config["regions_mapping"]["Bay Area"].append("Unexpected")

    # Act
    second_config = get_california_geography()

    # Assert: mutating one result must not leak into the next.
    assert "Unexpected" not in second_config["county_names"]
    assert "Unexpected" not in second_config["regions_mapping"]["Bay Area"]


def test_get_california_geography_includes_cbsa_metro_reference_data():
    config = get_california_geography()

    assert {
        "cbsa_metros",
        "metro_to_county_mapping",
        "metro_to_region_mapping",
    } <= config.keys()
    assert set(config["cbsa_metros"]) == EXPECTED_CBSA_METROS


def test_get_california_geography_has_26_legacy_cbsa_metros():
    config = get_california_geography()

    assert len(config["cbsa_metros"]) == 26


def test_every_cbsa_metro_has_county_and_region_mappings():
    config = get_california_geography()
    metros = set(config["cbsa_metros"])

    assert set(config["metro_to_county_mapping"]) == metros
    assert set(config["metro_to_region_mapping"]) == metros


def test_every_cbsa_metro_maps_to_nonempty_known_counties():
    config = get_california_geography()

    for counties in config["metro_to_county_mapping"].values():
        assert counties
        assert set(counties) <= config["county_names"]


def test_no_cbsa_metro_spans_multiple_shared_regions():
    config = get_california_geography()

    for metro, counties in config["metro_to_county_mapping"].items():
        containing_regions = {
            region
            for region, region_counties in config["regions_mapping"].items()
            if set(counties) <= set(region_counties)
        }
        assert len(containing_regions) == 1, metro


def test_metro_to_region_mapping_matches_county_composition():
    config = get_california_geography()

    for metro, counties in config["metro_to_county_mapping"].items():
        expected_region = next(
            region
            for region, region_counties in config["regions_mapping"].items()
            if set(counties) <= set(region_counties)
        )
        assert config["metro_to_region_mapping"][metro] == expected_region


def test_bay_area_region_contains_expected_metros():
    config = get_california_geography()
    bay_area_metros = {
        metro
        for metro, region in config["metro_to_region_mapping"].items()
        if region == "Bay Area"
    }

    assert bay_area_metros == {
        "San Francisco",
        "San Jose",
        "Santa Rosa",
        "Vallejo",
        "Napa",
    }


def test_get_california_geography_returns_independent_metro_mappings():
    first_config = get_california_geography()
    first_config["cbsa_metros"].add("Unexpected")
    first_config["metro_to_county_mapping"]["Bakersfield"].append("Unexpected")
    first_config["metro_to_region_mapping"]["Bakersfield"] = "Unexpected"

    second_config = get_california_geography()

    assert "Unexpected" not in second_config["cbsa_metros"]
    assert "Unexpected" not in second_config["metro_to_county_mapping"]["Bakersfield"]
    assert (
        second_config["metro_to_region_mapping"]["Bakersfield"]
        == "South San Joaquin Valley"
    )
