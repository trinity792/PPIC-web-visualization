import pandas as pd
from scripts.projections.aggregation import precomputed_totals
from scripts.projections.aggregation.precomputed_totals import (
    add_all_ages_totals,
    add_all_races_totals,
    add_both_sexes_totals,
    build_precomputed_totals,
)


def _row(
    age_group="0-4",
    sex="Female",
    race="White",
    population=10,
    location="Alameda",
    source="DoF P-3",
):
    return {
        "Geographic Level": "County",
        "Location": location,
        "Year": 2025,
        "Age Group": age_group,
        "Sex": sex,
        "Race/Ethnicity": race,
        "Population": population,
        "Source": source,
    }


def _base_cube(location="Alameda", source="DoF P-3"):
    return pd.DataFrame(
        [
            _row(age, sex, race, location=location, source=source)
            for age in ("0-4", "5-9")
            for sex in ("Female", "Male")
            for race in ("White", "Black")
        ]
    )


def _schema_config():
    return {
        "age_group_column": "Age Group",
        "sex_column": "Sex",
        "race_column": "Race/Ethnicity",
        "population_column": "Population",
    }


"""
========================================================================================================================
Individual Aggregators
========================================================================================================================
"""


def test_add_all_ages_totals_sums_age_groups():
    # Arrange
    source = pd.DataFrame(
        [
            _row(age_group="0-4", population=10),
            _row(age_group="5-9", population=20),
        ]
    )

    # Act
    result = add_all_ages_totals(
        source,
        "Age Group",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Sex",
            "Race/Ethnicity",
            "Source",
        ],
    )

    # Assert
    total = result[result["Age Group"].eq("All Ages")].iloc[0]
    assert total["Population"] == 30


def test_add_all_ages_totals_keeps_sexes_separate():
    # Arrange
    source = pd.DataFrame(
        [
            _row(age_group="0-4", sex="Female", population=10),
            _row(age_group="5-9", sex="Female", population=20),
            _row(age_group="0-4", sex="Male", population=30),
            _row(age_group="5-9", sex="Male", population=40),
        ]
    )

    # Act
    result = add_all_ages_totals(
        source,
        "Age Group",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Sex",
            "Race/Ethnicity",
            "Source",
        ],
    )

    # Assert
    totals = result[result["Age Group"].eq("All Ages")]
    assert totals.set_index("Sex")["Population"].to_dict() == {
        "Female": 30,
        "Male": 70,
    }


def test_add_all_ages_totals_preserves_input_and_base_rows():
    # Arrange
    source = pd.DataFrame([_row(age_group="0-4")])
    original = source.copy(deep=True)

    # Act
    result = add_all_ages_totals(
        source,
        "Age Group",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Sex",
            "Race/Ethnicity",
            "Source",
        ],
    )

    # Assert
    pd.testing.assert_frame_equal(source, original)
    pd.testing.assert_frame_equal(result.iloc[[0]].reset_index(drop=True), original)


def test_add_both_sexes_totals_sums_male_and_female():
    # Arrange
    source = pd.DataFrame(
        [
            _row(sex="Female", population=10),
            _row(sex="Male", population=15),
        ]
    )

    # Act
    result = add_both_sexes_totals(
        source,
        "Sex",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Race/Ethnicity",
            "Source",
        ],
    )

    # Assert
    total = result[result["Sex"].eq("Both Sexes")].iloc[0]
    assert total["Population"] == 25


def test_add_both_sexes_totals_keeps_age_groups_separate():
    # Arrange
    source = pd.DataFrame(
        [
            _row(age_group="0-4", sex="Female", population=10),
            _row(age_group="0-4", sex="Male", population=15),
            _row(age_group="5-9", sex="Female", population=20),
            _row(age_group="5-9", sex="Male", population=25),
        ]
    )

    # Act
    result = add_both_sexes_totals(
        source,
        "Sex",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Race/Ethnicity",
            "Source",
        ],
    )

    # Assert
    totals = result[result["Sex"].eq("Both Sexes")]
    assert totals.set_index("Age Group")["Population"].to_dict() == {
        "0-4": 25,
        "5-9": 45,
    }


def test_add_both_sexes_totals_preserves_input_and_base_rows():
    # Arrange
    source = pd.DataFrame([_row(sex="Female"), _row(sex="Male")])
    original = source.copy(deep=True)

    # Act
    result = add_both_sexes_totals(
        source,
        "Sex",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Race/Ethnicity",
            "Source",
        ],
    )

    # Assert
    pd.testing.assert_frame_equal(source, original)
    pd.testing.assert_frame_equal(
        result[result["Sex"].ne("Both Sexes")].reset_index(drop=True),
        original,
    )


def test_add_all_races_totals_sums_race_groups():
    # Arrange
    source = pd.DataFrame(
        [
            _row(race="White", population=10),
            _row(race="Black", population=20),
        ]
    )

    # Act
    result = add_all_races_totals(
        source,
        "Race/Ethnicity",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Sex",
            "Source",
        ],
    )

    # Assert
    total = result[result["Race/Ethnicity"].eq("All")].iloc[0]
    assert total["Population"] == 30


def test_add_all_races_totals_keeps_sexes_separate():
    # Arrange
    source = pd.DataFrame(
        [
            _row(sex="Female", race="White", population=10),
            _row(sex="Female", race="Black", population=20),
            _row(sex="Male", race="White", population=30),
            _row(sex="Male", race="Black", population=40),
        ]
    )

    # Act
    result = add_all_races_totals(
        source,
        "Race/Ethnicity",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Sex",
            "Source",
        ],
    )

    # Assert
    totals = result[result["Race/Ethnicity"].eq("All")]
    assert totals.set_index("Sex")["Population"].to_dict() == {
        "Female": 30,
        "Male": 70,
    }


def test_add_all_races_totals_preserves_input_and_base_rows():
    # Arrange
    source = pd.DataFrame([_row(race="White"), _row(race="Black")])
    original = source.copy(deep=True)

    # Act
    result = add_all_races_totals(
        source,
        "Race/Ethnicity",
        "Population",
        [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Sex",
            "Source",
        ],
    )

    # Assert
    pd.testing.assert_frame_equal(source, original)
    pd.testing.assert_frame_equal(
        result[result["Race/Ethnicity"].ne("All")].reset_index(drop=True),
        original,
    )


"""
========================================================================================================================
Orchestrator
========================================================================================================================
"""


def test_build_precomputed_totals_builds_complete_aggregation_cube():
    # Act
    result = build_precomputed_totals(_base_cube(), _schema_config())

    # Assert
    assert len(result) == 27
    assert set(result["Age Group"]) == {"0-4", "5-9", "All Ages"}
    assert set(result["Sex"]) == {"Female", "Male", "Both Sexes"}
    assert set(result["Race/Ethnicity"]) == {"White", "Black", "All"}


def test_build_precomputed_totals_grand_total_equals_base_population():
    # Arrange
    source = _base_cube()

    # Act
    result = build_precomputed_totals(source, _schema_config())

    # Assert
    grand_total = result[
        result["Age Group"].eq("All Ages")
        & result["Sex"].eq("Both Sexes")
        & result["Race/Ethnicity"].eq("All")
    ]
    assert len(grand_total) == 1
    assert grand_total.iloc[0]["Population"] == source["Population"].sum()


def test_build_precomputed_totals_keeps_sources_separate():
    # Arrange
    source = pd.concat(
        [
            _base_cube(source="DoF P-3"),
            _base_cube(source="Census cc-est"),
        ],
        ignore_index=True,
    )

    # Act
    result = build_precomputed_totals(source, _schema_config())

    # Assert
    grand_totals = result[
        result["Age Group"].eq("All Ages")
        & result["Sex"].eq("Both Sexes")
        & result["Race/Ethnicity"].eq("All")
    ]
    assert len(grand_totals) == 2
    assert set(grand_totals["Source"]) == {"DoF P-3", "Census cc-est"}
    assert set(grand_totals["Population"]) == {80}


def test_build_precomputed_totals_has_no_duplicate_contract_keys():
    # Act
    result = build_precomputed_totals(_base_cube(), _schema_config())

    # Assert
    key_columns = [
        "Geographic Level",
        "Location",
        "Year",
        "Age Group",
        "Sex",
        "Race/Ethnicity",
        "Source",
    ]
    assert not result.duplicated(subset=key_columns).any()


def test_build_precomputed_totals_keeps_locations_separate():
    # Arrange
    source = pd.concat(
        [
            _base_cube(location="Alameda"),
            _base_cube(location="Yuba"),
        ],
        ignore_index=True,
    )

    # Act
    result = build_precomputed_totals(source, _schema_config())

    # Assert
    grand_totals = result[
        result["Age Group"].eq("All Ages")
        & result["Sex"].eq("Both Sexes")
        & result["Race/Ethnicity"].eq("All")
    ]
    assert grand_totals.set_index("Location")["Population"].to_dict() == {
        "Alameda": 80,
        "Yuba": 80,
    }


def test_build_precomputed_totals_preserves_input_dataframe():
    # Arrange
    source = _base_cube()
    original = source.copy(deep=True)

    # Act
    build_precomputed_totals(source, _schema_config())

    # Assert
    pd.testing.assert_frame_equal(source, original)


def test_build_precomputed_totals_runs_aggregators_in_required_order(
    monkeypatch,
):
    # Arrange
    calls = []

    def add_ages(dataframe, *args, **kwargs):
        calls.append("ages")
        result = dataframe.copy()
        result["stage"] = "ages"
        return result

    def add_sexes(dataframe, *args, **kwargs):
        assert set(dataframe["stage"]) == {"ages"}
        calls.append("sexes")
        result = dataframe.copy()
        result["stage"] = "sexes"
        return result

    def add_races(dataframe, *args, **kwargs):
        assert set(dataframe["stage"]) == {"sexes"}
        calls.append("races")
        result = dataframe.copy()
        result["stage"] = "races"
        return result

    monkeypatch.setattr(
        precomputed_totals,
        "add_all_ages_totals",
        add_ages,
    )
    monkeypatch.setattr(
        precomputed_totals,
        "add_both_sexes_totals",
        add_sexes,
    )
    monkeypatch.setattr(
        precomputed_totals,
        "add_all_races_totals",
        add_races,
    )

    # Act
    result = precomputed_totals.build_precomputed_totals(
        _base_cube(),
        _schema_config(),
    )

    # Assert
    assert calls == ["ages", "sexes", "races"]
    assert set(result["stage"]) == {"races"}


def test_build_precomputed_totals_keeps_geographic_levels_separate():
    # Arrange
    county_rows = _base_cube(location="Alameda")
    state_rows = _base_cube(location="California")
    state_rows["Geographic Level"] = "State"
    source = pd.concat([county_rows, state_rows], ignore_index=True)

    # Act
    result = build_precomputed_totals(source, _schema_config())

    # Assert
    grand_totals = result[
        result["Age Group"].eq("All Ages")
        & result["Sex"].eq("Both Sexes")
        & result["Race/Ethnicity"].eq("All")
    ]
    assert grand_totals.set_index("Geographic Level")["Population"].to_dict() == {
        "County": 80,
        "State": 80,
    }
