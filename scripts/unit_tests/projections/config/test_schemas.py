from scripts.projections.config.schemas import get_schema_config

CCEST_RAW_COLUMNS = [
    "SUMLEV",
    "STATE",
    "COUNTY",
    "STNAME",
    "CTYNAME",
    "YEAR",
    "AGEGRP",
    "NHWA_MALE",
    "NHWA_FEMALE",
    "NHBA_MALE",
    "NHBA_FEMALE",
    "NHIA_MALE",
    "NHIA_FEMALE",
    "NHAA_MALE",
    "NHAA_FEMALE",
    "NHNA_MALE",
    "NHNA_FEMALE",
    "NHTOM_MALE",
    "NHTOM_FEMALE",
    "H_MALE",
    "H_FEMALE",
]

US_STATE_NAMES = {
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
}


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
        "p3_year_range",
        "p3_age_range",
        "fips_to_county_map",
        "p3_race7_code_map",
        "ccest_raw_columns",
        "census_race_code_map",
        "census_year_code_map",
        "census_age_group_code_map",
        "census_state_names",
        "completeness_group_columns",
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


def test_get_schema_config_defines_p3_semantic_ranges():
    # Act
    config = get_schema_config()

    # Assert
    assert tuple(config["p3_year_range"]) == (2020, 2070)
    assert tuple(config["p3_age_range"]) == (0, 110)


def test_get_schema_config_defines_completeness_grouping_grain():
    # Act
    group_columns = get_schema_config()["completeness_group_columns"]

    # Assert
    assert group_columns == [
        "Geographic Level",
        "Location",
        "Year",
        "Source",
    ]


def test_get_schema_config_defines_ccest_raw_schema_and_code_maps():
    # Act
    config = get_schema_config()

    # Assert
    assert config["ccest_raw_columns"] == CCEST_RAW_COLUMNS
    assert config["census_year_code_map"] == {
        2: 2020,
        3: 2021,
        4: 2022,
        5: 2023,
        6: 2024,
        7: 2025,
    }
    assert config["census_age_group_code_map"] == {
        code: label
        for code, label in enumerate(config["canonical_age_groups"], start=1)
    }


def test_get_schema_config_defines_exactly_50_census_states():
    # Act
    state_names = get_schema_config()["census_state_names"]

    # Assert
    assert set(state_names) == US_STATE_NAMES
    assert len(state_names) == len(US_STATE_NAMES)
