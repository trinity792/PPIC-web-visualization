from scripts.components_of_change.config.geography import get_components_geography


def test_components_geography_reuses_california_regions():
    config = get_components_geography()

    assert len(config["regions_mapping"]) == 9
    assert "Bay Area" in config["region_names"]
    assert "Alameda" in config["regions_mapping"]["Bay Area"]


def test_components_geography_includes_national_states():
    config = get_components_geography()

    assert "CA" in config["state_abbreviations"]
    assert config["state_to_abbreviation"]["California"] == "CA"
    assert config["abbreviation_to_state"]["NY"] == "New York"


def test_components_geography_returns_independent_values():
    first_config = get_components_geography()
    first_config["county_names"].add("Unexpected")

    second_config = get_components_geography()

    assert "Unexpected" not in second_config["county_names"]
