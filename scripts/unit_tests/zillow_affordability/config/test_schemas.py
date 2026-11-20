from scripts.zillow_affordability.config.schemas import get_schema_config

OUTPUT_COLUMNS = [
    "Release Date",
    "Geographic Level",
    "Location",
    "Date",
    "Housing Scenario",
    "Mortgage Payment",
    "Total Monthly Payment",
    "Income Needed",
    "Share of Income",
    "Affordable Home Price",
    "Years to Save",
]


def test_output_columns_match_the_specification_in_order():
    assert get_schema_config()["output_columns"] == OUTPUT_COLUMNS


def test_grain_and_measures_partition_the_columns():
    schema = get_schema_config()

    assert schema["grain_keys"] == ["Location", "Date", "Housing Scenario"]
    assert schema["measure_columns"] == OUTPUT_COLUMNS[5:]


def test_scenarios_and_geographic_levels_are_the_approved_vocabulary():
    schema = get_schema_config()

    assert schema["scenario_order"] == ["Buy (5% down)", "Buy (10% down)", "Buy (20% down)", "Rent"]
    assert schema["geographic_level_map"] == {"country": "Nation", "msa": "Metro"}
    assert schema["geographic_level_order"] == ["Nation", "Metro"]


def test_expected_locations_are_26_california_metros_plus_the_us():
    locations = get_schema_config()["expected_locations"]

    assert len(locations) == 27
    assert "United States" in locations
    assert {"Los Angeles", "Madera", "Fresno", "San Jose", "Napa"} <= set(locations)
    assert not any(name.endswith(", CA") for name in locations)


def test_applicable_measures_match_the_scenario_table():
    applicable = get_schema_config()["applicable_measures"]

    assert applicable["Buy (5% down)"] == ["Mortgage Payment", "Total Monthly Payment"]
    assert applicable["Buy (10% down)"] == ["Mortgage Payment", "Total Monthly Payment"]
    assert applicable["Buy (20% down)"] == OUTPUT_COLUMNS[5:]
    assert applicable["Rent"] == ["Income Needed", "Share of Income"]


def test_earliest_months_and_soft_tolerances_are_configured():
    schema = get_schema_config()

    assert schema["earliest_month"] == {
        "Buy (5% down)": "2012-01",
        "Buy (10% down)": "2012-01",
        "Buy (20% down)": "2012-01",
        "Rent": "2015-01",
    }
    assert schema["income_rule_share"] == 0.30
    assert 0 < schema["income_rule_tolerance"] < 0.05
