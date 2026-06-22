from scripts.pophousing.config.geography import get_geography_config


def test_get_geography_config_california_counties():
    config = get_geography_config()

    assert len(config["county_names"]) == 58
    assert "Alameda" in config["county_names"]


def test_get_geography_config_regions():
    config = get_geography_config()

    assert len(config["regions_mapping"]) == 9
    assert "Bay Area" in config["region_names"]


def test_get_geography_config_towns():
    config = get_geography_config()

    assert "Atherton" in config["town_names"]


def test_get_geography_config_valid_levels():
    config = get_geography_config()

    assert config["valid_levels"] == {"City", "County", "State", "Region", "Town"}


def test_get_geography_config_returns_independent_values():
    first_config = get_geography_config()
    first_config["county_names"].add("Unexpected")

    second_config = get_geography_config()

    assert "Unexpected" not in second_config["county_names"]
