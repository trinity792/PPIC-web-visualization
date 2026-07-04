from scripts.building_permits.config.schemas import get_schema_config

EXPECTED_MEASURE_COLUMNS = [
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]

EXPECTED_OUTPUT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    *EXPECTED_MEASURE_COLUMNS,
]


def test_get_schema_config_has_required_keys_and_output_contract():
    config = get_schema_config()

    assert {
        "output_columns",
        "required_columns",
        "date_column",
        "location_column",
        "level_column",
        "measure_columns",
        "cbsa_code_renames",
        "metro_display_renames",
        "state_names",
        "micro_metro_code",
        "geographic_levels",
        "completeness_group_columns",
        "cleaning_validation_config",
        "final_validation_config",
    } <= config.keys()
    assert config["output_columns"] == EXPECTED_OUTPUT_COLUMNS
    assert config["required_columns"] == EXPECTED_OUTPUT_COLUMNS


def test_get_schema_config_defines_five_raw_measures():
    config = get_schema_config()

    assert config["measure_columns"] == EXPECTED_MEASURE_COLUMNS
    assert "2+ Units" not in config["measure_columns"]


def test_get_schema_config_defines_exactly_fifty_states():
    state_names = get_schema_config()["state_names"]

    assert len(state_names) == 50
    assert len(set(state_names)) == 50
    assert "California" in state_names
    assert "District of Columbia" not in state_names
    assert "Puerto Rico" not in state_names


def test_get_schema_config_defines_non_overlapping_metro_rename_maps():
    config = get_schema_config()
    cbsa_code_renames = config["cbsa_code_renames"]
    metro_display_renames = config["metro_display_renames"]

    assert cbsa_code_renames
    assert metro_display_renames
    assert set(cbsa_code_renames).isdisjoint(metro_display_renames)
    assert cbsa_code_renames[12540] == "Bakersfield"
    assert (
        metro_display_renames["Riverside-San Bernardino-Ontario"]
        == "Inland Empire"
    )


def test_get_schema_config_defines_geographic_classification():
    config = get_schema_config()

    assert config["micro_metro_code"] == 5
    assert config["geographic_levels"] == ["State", "Metro"]
    assert config["completeness_group_columns"] == [
        "Geographic Level",
        "Date",
    ]
