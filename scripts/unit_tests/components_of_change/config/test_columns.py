from scripts.components_of_change.config.columns import get_columns_config


def test_columns_config_contains_legacy_parameters():
    config = get_columns_config()

    assert "Total Population" in config["valid_parameters"]
    assert "Crude Foreign Migration Rate" in config["valid_parameters"]
    assert config["crude_rate_component_map"]["Crude Birth Rate"] == "Births"


def test_columns_config_returns_independent_values():
    first_config = get_columns_config()
    first_config["valid_parameters"].append("Unexpected")

    second_config = get_columns_config()

    assert "Unexpected" not in second_config["valid_parameters"]
