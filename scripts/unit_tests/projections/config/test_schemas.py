from scripts.projections.config.schemas import get_schema_config


def test_get_schema_config_has_required_keys_and_output_contract():
    # Arrange
    expected_output_columns = [
        "Geographic Level",
        "Location",
        "Year",
        "Age Group",
        "Sex",
        "Race/Ethnicity",
        "Population",
        "Source",
    ]

    # Act
    config = get_schema_config()

    # Assert
    assert {
        "output_columns",
        "required_columns",
        "population_column",
        "year_column",
        "location_column",
        "level_column",
        "source_column",
        "age_group_column",
        "sex_column",
        "race_column",
        "p3_raw_columns",
        "fips_to_county_map",
        "p3_race7_code_map",
        "census_race_code_map",
        "age_bin_edges",
        "canonical_age_groups",
        "canonical_sexes",
        "canonical_race_groups",
        "sex_label_map",
        "cleaning_validation_config",
        "final_validation_config",
    } <= config.keys()
    assert config["output_columns"] == expected_output_columns
    assert config["required_columns"] == expected_output_columns


def test_get_schema_config_has_seven_canonical_race_groups():
    # Act
    race_groups = get_schema_config()["canonical_race_groups"]

    # Assert
    assert race_groups == [
        "White",
        "Black",
        "Asian",
        "NHPI",
        "AIAN",
        "Multiracial",
        "Hispanic",
    ]


def test_get_schema_config_has_eighteen_canonical_age_groups():
    # Arrange
    expected_age_groups = [
        "0-4",
        "5-9",
        "10-14",
        "15-19",
        "20-24",
        "25-29",
        "30-34",
        "35-39",
        "40-44",
        "45-49",
        "50-54",
        "55-59",
        "60-64",
        "65-69",
        "70-74",
        "75-79",
        "80-84",
        "85+",
    ]

    # Act
    age_groups = get_schema_config()["canonical_age_groups"]

    # Assert
    assert age_groups == expected_age_groups


def test_get_schema_config_maps_all_58_california_counties():
    # Act
    fips_to_county = get_schema_config()["fips_to_county_map"]

    # Assert
    assert len(fips_to_county) == 58
    assert set(fips_to_county) == set(range(6001, 6116, 2))
    assert len(set(fips_to_county.values())) == 58
    assert fips_to_county[6001] == "Alameda"
    assert fips_to_county[6115] == "Yuba"
