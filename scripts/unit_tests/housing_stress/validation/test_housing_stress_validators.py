import pandas as pd

from scripts.housing_stress.validation.housing_stress_validators import (
    validate_cleaning_output,
    validate_housing_stress_dataset,
    validate_stratification_completeness,
)

CONTRACT_COLUMNS = [
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

TENURES = [
    "Total",
    "Rented",
    "Owned",
    "Owned With Mortgage",
    "Owned Without Mortgage",
]

RACES = [
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


def _schema_config(races=None):
    canonical_races = list(races or RACES)
    cleaning_validation = {
        "required_columns": list(CONTRACT_COLUMNS),
        "critical_columns": [
            "Year",
            "Geographic Level",
            "Location",
            "Race/Ethnicity",
            "Tenure",
        ],
        "nonnegative_columns": [
            "Number Over 30%",
            "Number Over 50%",
        ],
        "share_columns": [
            "Share Over 30%",
            "Share Over 50%",
        ],
        "canonical_tenures": list(TENURES),
        "canonical_race_groups": canonical_races,
    }
    return {
        "required_columns": list(CONTRACT_COLUMNS),
        "year_column": "Year",
        "level_column": "Geographic Level",
        "location_column": "Location",
        "race_column": "Race/Ethnicity",
        "tenure_column": "Tenure",
        "measure_columns": [
            "Number Over 30%",
            "Number Over 50%",
            "Share Over 30%",
            "Share Over 50%",
        ],
        "canonical_tenures": list(TENURES),
        "canonical_race_groups": canonical_races,
        "completeness_group_columns": [
            "Geographic Level",
            "Location",
            "Year",
        ],
        "cleaning_validation_config": cleaning_validation,
    }


def _row(
    year=2023,
    level="County",
    location="Alameda",
    race="All",
    tenure="Total",
    number_30=30,
    number_50=15,
    share_30=0.30,
    share_50=0.15,
):
    return {
        "Year": year,
        "Geographic Level": level,
        "Location": location,
        "Race/Ethnicity": race,
        "Tenure": tenure,
        "Number Over 30%": number_30,
        "Number Over 50%": number_50,
        "Share Over 30%": share_30,
        "Share Over 50%": share_50,
    }


def _matrix(
    *,
    level="County",
    location="Alameda",
    year=2023,
    races=("All", "White"),
    tenures=tuple(TENURES),
):
    return pd.DataFrame(
        [
            _row(
                level=level,
                location=location,
                year=year,
                race=race,
                tenure=tenure,
            )
            for race in races
            for tenure in tenures
        ],
        columns=CONTRACT_COLUMNS,
    )


def _final_validation_config(**overrides):
    config = {
        "required_columns": list(CONTRACT_COLUMNS),
        "expected_levels": ["State", "Region", "County"],
        "year_range": (2012, 2026),
        "excluded_years": {2020},
        "min_rows": 1,
        "max_rows": 100,
        "nonnegative_columns": [
            "Number Over 30%",
            "Number Over 50%",
        ],
        "share_columns": [
            "Share Over 30%",
            "Share Over 50%",
        ],
        "duplicate_key_columns": [
            "Year",
            "Geographic Level",
            "Location",
            "Race/Ethnicity",
            "Tenure",
        ],
    }
    config.update(overrides)
    return config


def _final_frame():
    return pd.DataFrame(
        [
            _row(level="State", location="CA"),
            _row(level="Region", location="Bay Area"),
            _row(level="County", location="Alameda"),
        ],
        columns=CONTRACT_COLUMNS,
    )


def test_validate_cleaning_output_accepts_valid_row():
    is_valid, messages = validate_cleaning_output(
        pd.DataFrame([_row()]),
        _schema_config(),
    )

    assert is_valid is True
    assert messages == []


def test_validate_cleaning_output_reports_noncanonical_tenure():
    source = pd.DataFrame([_row(tenure="Mortgaged")])

    is_valid, messages = validate_cleaning_output(
        source,
        _schema_config(),
    )

    assert is_valid is False
    assert any("tenure" in message.lower() for message in messages)


def test_validate_cleaning_output_reports_noncanonical_race():
    source = pd.DataFrame([_row(race="Unknown")])

    is_valid, messages = validate_cleaning_output(
        source,
        _schema_config(),
    )

    assert is_valid is False
    assert any("race" in message.lower() for message in messages)


def test_validate_cleaning_output_reports_negative_number():
    source = pd.DataFrame([_row(number_30=-1)])

    is_valid, messages = validate_cleaning_output(
        source,
        _schema_config(),
    )

    assert is_valid is False
    assert any(
        "negative" in message.lower()
        or "number over 30%" in message.lower()
        for message in messages
    )


def test_validate_cleaning_output_reports_shares_outside_unit_interval():
    source = pd.DataFrame(
        [
            _row(location="Alameda", share_30=-0.01),
            _row(location="Yuba", share_50=1.01),
        ]
    )

    is_valid, messages = validate_cleaning_output(
        source,
        _schema_config(),
    )

    assert is_valid is False
    assert any("share" in message.lower() for message in messages)


def test_validate_stratification_completeness_accepts_full_matrix():
    source = _matrix()

    is_valid, messages = validate_stratification_completeness(
        source,
        _schema_config(races=["All", "White"]),
    )

    assert is_valid is True
    assert messages == []


def test_validate_stratification_completeness_warns_for_missing_race():
    source = _matrix(races=("All",))

    is_valid, messages = validate_stratification_completeness(
        source,
        _schema_config(races=["All", "White"]),
    )

    assert is_valid is True
    assert any(
        "warning" in message.lower() and "white" in message.lower()
        for message in messages
    )


def test_validate_stratification_completeness_errors_for_missing_tenure():
    source = _matrix(tenures=tuple(TENURES[:-1]))

    is_valid, messages = validate_stratification_completeness(
        source,
        _schema_config(races=["All", "White"]),
    )

    assert is_valid is False
    assert any(
        "error" in message.lower()
        and "owned without mortgage" in message.lower()
        for message in messages
    )


def test_validate_stratification_completeness_never_pools_groups():
    alameda = _matrix(
        location="Alameda",
        races=("All",),
        tenures=tuple(TENURES[:-1]),
    )
    yuba = _matrix(
        location="Yuba",
        races=("All",),
        tenures=("Owned Without Mortgage",),
    )
    source = pd.concat([alameda, yuba], ignore_index=True)

    is_valid, messages = validate_stratification_completeness(
        source,
        _schema_config(races=["All"]),
    )

    assert is_valid is False
    assert any("Alameda" in message for message in messages)
    assert any("Yuba" in message for message in messages)


def test_validate_housing_stress_dataset_accepts_valid_dataset():
    is_valid, messages = validate_housing_stress_dataset(
        _final_frame(),
        _final_validation_config(),
    )

    assert is_valid is True
    assert messages == []


def test_validate_housing_stress_dataset_reports_negative_count():
    # A5: the final-stage non-negative check reads the same key the config supplies
    # (nonnegative_columns), so a negative count now actually fails final validation.
    source = _final_frame()
    source.loc[source.index[0], "Number Over 30%"] = -5

    is_valid, messages = validate_housing_stress_dataset(source, _final_validation_config())

    assert is_valid is False
    assert any("negative" in message.lower() for message in messages)


def test_validate_housing_stress_dataset_reports_missing_level():
    source = _final_frame()
    source = source[source["Geographic Level"].ne("Region")]

    is_valid, messages = validate_housing_stress_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("Region" in message for message in messages)


def test_validate_housing_stress_dataset_reports_row_count_bounds():
    source = _final_frame()

    below_valid, below_messages = validate_housing_stress_dataset(
        source,
        _final_validation_config(min_rows=4),
    )
    above_valid, above_messages = validate_housing_stress_dataset(
        source,
        _final_validation_config(max_rows=2),
    )

    assert below_valid is False
    assert above_valid is False
    assert any("row" in message.lower() for message in below_messages)
    assert any("row" in message.lower() for message in above_messages)


def test_validate_housing_stress_dataset_rejects_2020():
    source = _final_frame()
    source.loc[source.index[0], "Year"] = 2020

    is_valid, messages = validate_housing_stress_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("2020" in message for message in messages)


def test_validate_housing_stress_dataset_reports_duplicate_keys():
    source = _final_frame()
    source = pd.concat([source, source.iloc[[0]]], ignore_index=True)

    is_valid, messages = validate_housing_stress_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("duplicate" in message.lower() for message in messages)
