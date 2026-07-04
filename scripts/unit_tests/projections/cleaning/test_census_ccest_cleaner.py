import pandas as pd
import pytest

from scripts.projections.cleaning.census_ccest_cleaner import (
    aggregate_ccest_counties_to_states,
    clean_census_estimates,
    parse_ccest_csv,
    rename_ccest_columns,
    reshape_ccest_to_long,
)

IDENTIFIER_COLUMNS = [
    "SUMLEV",
    "STATE",
    "COUNTY",
    "STNAME",
    "CTYNAME",
    "YEAR",
    "AGEGRP",
]

POPULATION_COLUMNS = [
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

CCEST_RAW_COLUMNS = [*IDENTIFIER_COLUMNS, *POPULATION_COLUMNS]

CANONICAL_AGE_GROUPS = [
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


def _schema_config(state_names=("California",)):
    return {
        "ccest_raw_columns": CCEST_RAW_COLUMNS,
        "census_rename_map": {
            "STNAME": "Location",
            "YEAR": "Year",
            "AGEGRP": "Age Group",
        },
        "census_state_names": list(state_names),
        "census_race_code_map": {
            "NHWA": "White",
            "NHBA": "Black",
            "NHIA": "AIAN",
            "NHAA": "Asian",
            "NHNA": "NHPI",
            "NHTOM": "Multiracial",
            "H": "Hispanic",
        },
        "census_year_code_map": {
            2: 2020,
            3: 2021,
            4: 2022,
            5: 2023,
            6: 2024,
            7: 2025,
        },
        "census_age_group_code_map": {
            code: label
            for code, label in enumerate(CANONICAL_AGE_GROUPS, start=1)
        },
        "sex_label_map": {"MALE": "Male", "FEMALE": "Female"},
        "population_column": "Population",
        "canonical_age_groups": CANONICAL_AGE_GROUPS,
        "canonical_sexes": ["Male", "Female"],
        "canonical_race_groups": [
            "White",
            "Black",
            "Asian",
            "NHPI",
            "AIAN",
            "Multiracial",
            "Hispanic",
        ],
        "cleaning_validation_config": {},
    }


def _raw_row(
    year_code=7,
    age_group_code=1,
    state_code=6,
    state_name="California",
    county_code=1,
    county_name="Alameda County",
    summary_level=50,
    **population_overrides,
):
    row = {
        "SUMLEV": summary_level,
        "STATE": state_code,
        "COUNTY": county_code,
        "STNAME": state_name,
        "CTYNAME": county_name,
        "YEAR": year_code,
        "AGEGRP": age_group_code,
        **dict.fromkeys(POPULATION_COLUMNS, 0),
    }
    row.update({"NHWA_MALE": 10, "NHWA_FEMALE": 12})
    row.update(population_overrides)
    return row


def _renamed_row(year_code=7, age_group_code=1, **population_overrides):
    raw = _raw_row(
        year_code=year_code,
        age_group_code=age_group_code,
        **population_overrides,
    )
    return {
        "Location": raw["STNAME"],
        "Year": raw["YEAR"],
        "Age Group": raw["AGEGRP"],
        **{column: raw[column] for column in POPULATION_COLUMNS},
    }


def test_parse_ccest_csv_reads_official_wide_schema_and_extras(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    source = pd.DataFrame([_raw_row()])
    source["TOT_POP"] = 22
    source.to_csv(csv_path, index=False)

    # Act
    result = parse_ccest_csv(csv_path, _schema_config())

    # Assert
    assert len(result) == 1
    assert set(CCEST_RAW_COLUMNS) <= set(result.columns)
    assert result.loc[0, "YEAR"] == 7
    assert "TOT_POP" in result.columns


def test_parse_ccest_csv_reads_latin1_encoded_file(tmp_path):
    # Arrange — Census PEP files are Latin-1 encoded; accented county names such
    # as "Doña Ana County" contain bytes that are invalid UTF-8.
    csv_path = tmp_path / "cc-est-latin1.csv"
    source = pd.DataFrame([_raw_row()])
    source["CTYNAME"] = "Doña Ana County"
    source.to_csv(csv_path, index=False, encoding="latin-1")

    # Act
    result = parse_ccest_csv(csv_path, _schema_config())

    # Assert
    assert result.loc[0, "CTYNAME"] == "Doña Ana County"


def test_parse_ccest_csv_reports_missing_required_population_header(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    pd.DataFrame([_raw_row()]).drop(columns=["H_FEMALE"]).to_csv(
        csv_path,
        index=False,
    )

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)missing.*H_FEMALE"):
        parse_ccest_csv(csv_path, _schema_config())


def test_rename_ccest_columns_uses_configured_header_map():
    # Arrange
    source = pd.DataFrame(
        {
            "STNAME": ["California"],
            "YEAR": [7],
            "AGEGRP": [1],
        }
    )

    # Act
    result = rename_ccest_columns(source, _schema_config())

    # Assert
    assert list(result.columns) == ["Location", "Year", "Age Group"]
    assert source.columns.tolist() == ["STNAME", "YEAR", "AGEGRP"]


def test_aggregate_ccest_counties_to_states_sums_counties_and_filters_geography():
    # Arrange
    source = pd.DataFrame(
        [
            _raw_row(county_code=1, county_name="Alameda County"),
            _raw_row(
                county_code=75,
                county_name="San Francisco County",
                NHWA_MALE=20,
            ),
            _raw_row(summary_level=40, county_code=0, NHWA_MALE=9_000),
            _raw_row(
                state_code=11,
                state_name="District of Columbia",
                county_code=1,
                county_name="District of Columbia",
                NHWA_MALE=8_000,
            ),
            _raw_row(
                state_code=72,
                state_name="Puerto Rico",
                county_code=1,
                county_name="Adjuntas Municipio",
                NHWA_MALE=7_000,
            ),
        ]
    )

    # Act
    result = aggregate_ccest_counties_to_states(source, _schema_config())

    # Assert
    assert len(result) == 1
    assert result.loc[0, "STNAME"] == "California"
    assert result.loc[0, "NHWA_MALE"] == 30
    assert result.loc[0, "NHWA_FEMALE"] == 24
    assert "CTYNAME" not in result.columns


def test_aggregate_ccest_counties_to_states_rejects_missing_state():
    # Arrange
    source = pd.DataFrame([_raw_row()])

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)missing.*Texas|Texas.*missing"):
        aggregate_ccest_counties_to_states(
            source,
            _schema_config(state_names=("California", "Texas")),
        )


def test_reshape_ccest_to_long_decodes_wide_race_sex_and_code_columns():
    # Arrange
    source = pd.DataFrame([_renamed_row()])

    # Act
    result = reshape_ccest_to_long(source, _schema_config())

    # Assert
    assert list(result.columns) == [
        "Location",
        "Year",
        "Age Group",
        "Sex",
        "Race/Ethnicity",
        "Population",
    ]
    assert len(result) == 14
    assert set(result["Year"]) == {2025}
    assert set(result["Age Group"]) == {"0-4"}
    assert set(result["Sex"]) == {"Male", "Female"}
    assert set(result["Race/Ethnicity"]) == {
        "White",
        "Black",
        "AIAN",
        "Asian",
        "NHPI",
        "Multiracial",
        "Hispanic",
    }
    assert result["Population"].sum() == 22


def test_rename_ccest_columns_reports_missing_configured_header():
    # Arrange
    source = pd.DataFrame(
        {
            "STNAME": ["California"],
            "YEAR": [7],
        }
    )

    # Act / Assert
    with pytest.raises(ValueError, match="AGEGRP"):
        rename_ccest_columns(source, _schema_config())


def test_reshape_ccest_to_long_ignores_total_population_columns():
    # Arrange
    source = pd.DataFrame([_renamed_row()])
    source["TOT_POP"] = 1_000
    source["TOT_MALE"] = 490

    # Act
    result = reshape_ccest_to_long(source, _schema_config())

    # Assert
    assert len(result) == 14
    assert result["Population"].sum() == 22


def test_reshape_ccest_to_long_does_not_modify_input():
    # Arrange
    source = pd.DataFrame([_renamed_row()])
    original = source.copy(deep=True)

    # Act
    reshape_ccest_to_long(source, _schema_config())

    # Assert
    pd.testing.assert_frame_equal(source, original)


def test_clean_census_estimates_produces_canonical_rows(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    pd.DataFrame([_raw_row()]).to_csv(csv_path, index=False)

    # Act
    result = clean_census_estimates(csv_path, _schema_config())

    # Assert
    assert list(result.columns) == [
        "Geographic Level",
        "Location",
        "Year",
        "Age Group",
        "Sex",
        "Race/Ethnicity",
        "Population",
    ]
    assert len(result) == 14
    assert set(result["Geographic Level"]) == {"US State"}
    assert set(result["Year"]) == {2025}
    assert set(result["Age Group"]) == {"0-4"}
    assert set(result["Sex"]) == {"Male", "Female"}
    assert len(set(result["Race/Ethnicity"])) == 7
    assert result["Population"].sum() == 22


def test_reshape_ccest_to_long_reports_unmapped_race_code():
    # Arrange
    source = pd.DataFrame(
        {
            "Location": ["California"],
            "Year": [7],
            "Age Group": [1],
            "UNKNOWN_MALE": [10],
        }
    )

    # Act / Assert
    with pytest.raises(ValueError, match="UNKNOWN"):
        reshape_ccest_to_long(source, _schema_config())


def test_parse_ccest_csv_accepts_header_only_file(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-empty.csv"
    pd.DataFrame(columns=CCEST_RAW_COLUMNS).to_csv(csv_path, index=False)

    # Act
    result = parse_ccest_csv(csv_path, _schema_config())

    # Assert
    assert result.empty
    assert list(result.columns) == CCEST_RAW_COLUMNS


def test_reshape_ccest_to_long_decodes_year_and_age_codes():
    # Arrange
    source = pd.DataFrame(
        [
            _renamed_row(year_code=6, age_group_code=1),
            _renamed_row(year_code=7, age_group_code=2),
        ]
    )

    # Act
    result = reshape_ccest_to_long(source, _schema_config())

    # Assert
    assert result.groupby(["Year", "Age Group"])["Population"].sum().to_dict() == {
        (2024, "0-4"): 22,
        (2025, "5-9"): 22,
    }


def test_clean_census_estimates_aggregates_exactly_50_states(tmp_path):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    rows = [
        _raw_row(
            state_code=state_code,
            state_name=state_name,
            county_name=f"{state_name} County",
        )
        for state_code, state_name in enumerate(sorted(US_STATE_NAMES), start=1)
    ]
    rows.extend(
        [
            _raw_row(
                state_code=11,
                state_name="District of Columbia",
                county_name="District of Columbia",
                NHWA_MALE=1_000,
            ),
            _raw_row(
                state_code=72,
                state_name="Puerto Rico",
                county_name="Adjuntas Municipio",
                NHWA_MALE=2_000,
            ),
        ]
    )
    pd.DataFrame(rows).to_csv(csv_path, index=False)

    # Act
    result = clean_census_estimates(
        csv_path,
        _schema_config(state_names=US_STATE_NAMES),
    )

    # Assert
    assert set(result["Location"]) == US_STATE_NAMES
    assert set(result["Geographic Level"]) == {"US State"}
    assert result["Location"].nunique() == 50
    assert "District of Columbia" not in set(result["Location"])
    assert "Puerto Rico" not in set(result["Location"])
    assert len(result) == 50 * 2 * 7


def test_clean_census_estimates_excludes_base_year_and_total_age_rows(
    tmp_path,
):
    # Arrange
    csv_path = tmp_path / "cc-est-fixture.csv"
    pd.DataFrame(
        [
            _raw_row(year_code=1, age_group_code=1, NHWA_MALE=1_000),
            _raw_row(year_code=7, age_group_code=0, NHWA_MALE=2_000),
            _raw_row(year_code=7, age_group_code=1),
        ]
    ).to_csv(csv_path, index=False)

    # Act
    result = clean_census_estimates(csv_path, _schema_config())

    # Assert
    assert set(result["Year"]) == {2025}
    assert set(result["Age Group"]) == {"0-4"}
    assert result["Population"].sum() == 22


def test_reshape_ccest_to_long_reports_unknown_year_code():
    # Arrange
    source = pd.DataFrame([_renamed_row(year_code=8)])

    # Act / Assert
    with pytest.raises(ValueError, match=r"8|YEAR"):
        reshape_ccest_to_long(source, _schema_config())
