from scripts.pophousing.config.schemas import get_schema_config


def test_get_schema_config_e5_column_count():
    config = get_schema_config()

    assert len(config["e5_column_names"]) == 15


def test_get_schema_config_raw_column_mapping():
    config = get_schema_config()

    assert config["raw_column_mapping"] == {"Region": "County", "City": "Location"}


def test_get_schema_config_numeric_columns():
    config = get_schema_config()

    assert "Total Population" in config["numeric_columns"]
    assert "Vacancy Rate (%)" in config["numeric_columns"]


def test_get_schema_config_output_columns():
    config = get_schema_config()

    assert config["output_columns"][:3] == ["Geographic Level", "Location", "Year"]


def test_get_schema_config_returns_independent_values():
    first_config = get_schema_config()
    first_config["e5_column_names"].append("Unexpected")

    second_config = get_schema_config()

    assert "Unexpected" not in second_config["e5_column_names"]


def test_get_schema_config_final_validation():
    config = get_schema_config()["final_validation"]

    assert config["required_columns"] == get_schema_config()["output_columns"]
