from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config


def test_source_config_lists_the_twelve_series_once_each():
    series = get_source_config()["series"]

    keys = [item["key"] for item in series]
    assert len(series) == 12
    assert len(set(keys)) == 12
    assert len({item["filename"] for item in series}) == 12


def test_every_series_url_is_a_fixed_zillow_public_csv_link():
    config = get_source_config()

    for item in config["series"]:
        assert item["url"] == f"{config['base_url']}/{item['folder']}/{item['filename']}"
        assert item["url"].startswith("https://files.zillowstatic.com/research/public_csvs/")
        assert item["filename"].startswith("Metro_") and item["filename"].endswith(".csv")


def test_every_series_maps_to_a_contract_column_and_scenario():
    schema = get_schema_config()

    for item in get_source_config()["series"]:
        assert item["column"] in schema["measure_columns"]
        assert item["scenario"] in schema["scenario_order"]
        assert item["column"] in schema["applicable_measures"][item["scenario"]]


def test_each_scenario_measure_pair_comes_from_exactly_one_series():
    pairs = [(item["column"], item["scenario"]) for item in get_source_config()["series"]]

    assert len(pairs) == len(set(pairs))


def test_http_settings_come_from_the_project_defaults():
    config = get_source_config()

    assert "User-Agent" in config["headers"]
    assert config["timeout_seconds"] > 0
