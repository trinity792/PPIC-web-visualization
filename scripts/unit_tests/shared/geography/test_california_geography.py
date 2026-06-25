from scripts.shared.geography.california_geography import get_california_geography


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
