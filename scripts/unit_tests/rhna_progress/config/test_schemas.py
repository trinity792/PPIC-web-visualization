from scripts.rhna_progress.config.schemas import get_schema_config

from scripts.unit_tests.rhna_progress.helpers import (
    GRAIN_KEYS,
    INCOME_LEVELS,
    OUTPUT_COLUMNS,
    TIER_LEVELS,
)


def test_get_schema_config_has_required_keys_and_output_contract():
    config = get_schema_config()

    assert {
        "output_columns",
        "required_columns",
        "dtypes",
        "income_levels",
        "tier_income_levels",
        "income_tier_columns",
        "grain_keys",
        "status_thresholds",
        "status_labels",
        "cleaning_validation_config",
        "final_validation_config",
    } <= config.keys()
    assert config["output_columns"] == OUTPUT_COLUMNS
    assert config["required_columns"] == OUTPUT_COLUMNS


def test_get_schema_config_defines_long_income_grain():
    config = get_schema_config()

    assert config["income_levels"] == INCOME_LEVELS
    assert config["tier_income_levels"] == TIER_LEVELS
    assert config["grain_keys"] == GRAIN_KEYS
    assert "Total" not in config["tier_income_levels"]


def test_get_schema_config_maps_source_income_columns():
    config = get_schema_config()
    tier_columns = config["income_tier_columns"]

    assert set(tier_columns) == set(TIER_LEVELS)
    assert tier_columns["Very Low"]["source_units"] == "VLI UNITS"
    assert tier_columns["Very Low"]["source_rhna"] == "RHNA VLI"
    assert tier_columns["Very Low"]["source_percent"] == "VLI %"
    assert tier_columns["Above Moderate"]["source_units"] == "ABOVE MOD UNITS"
    assert tier_columns["Above Moderate"]["source_rhna"] == "RHNA ABOVE MOD"
    assert tier_columns["Above Moderate"]["source_percent"] == "ABOVE MOD %"


def test_get_schema_config_defines_status_thresholds_and_labels():
    config = get_schema_config()

    assert config["status_thresholds"] == {
        "on_track": 1.0,
        "nearly_on_track": 0.70,
        "somewhat_off_track": 0.50,
    }
    assert list(config["status_labels"].values()) == [
        "No Allocation",
        "Met",
        "Behind",
        "On Track",
        "Nearly On Track",
        "Somewhat Off Track",
        "Far Off Track",
    ]


def test_get_schema_config_validation_keys_use_contract_grain():
    config = get_schema_config()

    assert config["cleaning_validation_config"]["key_columns"] == GRAIN_KEYS
    assert config["final_validation_config"]["duplicate_key_columns"] == GRAIN_KEYS
    assert config["final_validation_config"]["income_levels"] == INCOME_LEVELS

