from scripts.housing_stress.config.schemas import get_schema_config

EXPECTED_OUTPUT_COLUMNS = [
    "Year",
    "Geographic Level",
    "Location",
    "Race/Ethnicity",
    "Tenure",
    "Number Over 30%",
    "Number Over 50%",
    "Share Over 30%",
    "Share Over 50%",
]

EXPECTED_TENURE_FORMULAS = {
    "Total": {
        "num_30": ["E003", "E007", "E011"],
        "num_50": ["E004", "E008", "E012"],
        "denom": ["E001"],
    },
    "Rented": {
        "num_30": ["E011"],
        "num_50": ["E012"],
        "denom": ["E010"],
    },
    "Owned": {
        "num_30": ["E003", "E007"],
        "num_50": ["E004", "E008"],
        "denom": ["E002", "E006"],
    },
    "Owned With Mortgage": {
        "num_30": ["E003"],
        "num_50": ["E004"],
        "denom": ["E002"],
    },
    "Owned Without Mortgage": {
        "num_30": ["E007"],
        "num_50": ["E008"],
        "denom": ["E006"],
    },
}


def test_get_schema_config_has_required_keys_and_output_contract():
    config = get_schema_config()

    assert {
        "output_columns",
        "required_columns",
        "year_column",
        "location_column",
        "level_column",
        "race_column",
        "tenure_column",
        "measure_columns",
        "estimate_columns",
        "tenure_formulas",
        "canonical_tenures",
        "race_iteration_map",
        "race_reconciliation_map",
        "canonical_race_groups",
        "state_abbreviations",
        "excluded_state_areas",
        "completeness_group_columns",
        "cleaning_validation_config",
        "final_validation_config",
    } <= config.keys()
    assert config["output_columns"] == EXPECTED_OUTPUT_COLUMNS
    assert config["required_columns"] == EXPECTED_OUTPUT_COLUMNS


def test_get_schema_config_defines_canonical_tenures_and_legacy_formulas():
    config = get_schema_config()

    assert config["canonical_tenures"] == list(EXPECTED_TENURE_FORMULAS)
    assert config["tenure_formulas"] == EXPECTED_TENURE_FORMULAS


def test_get_schema_config_formulas_reference_only_estimate_columns():
    config = get_schema_config()
    formula_columns = {
        column
        for formula in config["tenure_formulas"].values()
        for key in ("num_30", "num_50", "denom")
        for column in formula[key]
    }

    assert config["estimate_columns"] == [
        f"E{number:03d}" for number in range(1, 14)
    ]
    assert formula_columns <= set(config["estimate_columns"])


def test_get_schema_config_defines_nine_canonical_race_groups():
    config = get_schema_config()

    assert config["canonical_race_groups"] == [
        "All",
        "White",
        "Black",
        "Asian",
        "NHPI",
        "AIAN",
        "Multiracial",
        "Hispanic",
        "Other",
    ]


def test_get_schema_config_sources_white_from_iteration_h():
    config = get_schema_config()

    assert config["race_iteration_map"]["b25140h"] == "White"
    assert "b25140a" not in config["race_iteration_map"]
    assert config["race_reconciliation_map"]["White"] == "White"


def test_get_schema_config_defines_state_and_completeness_scope():
    config = get_schema_config()

    assert len(config["state_abbreviations"]) == 50
    assert "CA" in config["state_abbreviations"]
    assert set(config["state_abbreviations"]).isdisjoint(
        config["excluded_state_areas"]
    )
    assert set(config["excluded_state_areas"]) == {"DC", "PR"}
    assert config["completeness_group_columns"] == [
        "Geographic Level",
        "Location",
        "Year",
    ]
