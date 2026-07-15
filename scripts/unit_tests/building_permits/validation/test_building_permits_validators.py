import pandas as pd

from scripts.building_permits.validation.building_permits_validators import (
    validate_building_permits_dataset,
    validate_cleaning_output,
)

MEASURE_COLUMNS = [
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]

CLEANING_COLUMNS = ["Location", "Date", *MEASURE_COLUMNS]

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    *MEASURE_COLUMNS,
]


def _cleaning_schema():
    return {
        "required_columns": list(CLEANING_COLUMNS),
        "date_column": "Date",
        "location_column": "Location",
        "measure_columns": list(MEASURE_COLUMNS),
        "state_names": ["California", "Texas"],
        "metro_names": ["Bakersfield", "San Francisco"],
        "cleaning_validation_config": {
            "required_columns": list(CLEANING_COLUMNS),
            "key_columns": ["Location", "Date"],
            "nonnegative_columns": list(MEASURE_COLUMNS),
        },
    }


def _cleaning_row(
    location="Bakersfield",
    date="2026-05",
    total=100,
):
    return {
        "Location": location,
        "Date": date,
        "Total": total,
        "1 Unit": 60,
        "2 Units": 5,
        "3 and 4 Units": 10,
        "5 Units or More": 25,
    }


def _row(
    date="2026-04",
    level="State",
    location="California",
    total=100,
):
    return {
        "Geographic Level": level,
        "Location": location,
        "Date": date,
        "Total": total,
        "1 Unit": 60,
        "2 Units": 5,
        "3 and 4 Units": 10,
        "5 Units or More": 25,
    }


def _final_frame():
    rows = []
    for date in ("2026-04", "2026-05"):
        rows.extend(
            [
                _row(date=date, level="State", location="California"),
                _row(date=date, level="State", location="Texas"),
                _row(date=date, level="Metro", location="Bakersfield"),
                _row(date=date, level="Metro", location="San Francisco"),
            ]
        )
    return pd.DataFrame(rows, columns=CONTRACT_COLUMNS)


def _final_validation_config(**overrides):
    config = {
        "required_columns": list(CONTRACT_COLUMNS),
        "expected_levels": ["State", "Metro"],
        "expected_states": ["California", "Texas"],
        "expected_metros": ["Bakersfield", "San Francisco"],
        "earliest_month": "2026-04",
        "min_rows": 1,
        "max_rows": 100,
        "measure_columns": list(MEASURE_COLUMNS),
        "duplicate_key_columns": [
            "Date",
            "Geographic Level",
            "Location",
        ],
    }
    config.update(overrides)
    return config


def test_validate_cleaning_output_accepts_valid_rows():
    source = pd.DataFrame(
        [
            _cleaning_row(location="Bakersfield"),
            _cleaning_row(location="California"),
        ],
        columns=CLEANING_COLUMNS,
    )

    is_valid, messages = validate_cleaning_output(
        source,
        _cleaning_schema(),
    )

    assert is_valid is True
    assert messages == []


def test_validate_cleaning_output_reports_missing_columns():
    source = pd.DataFrame([_cleaning_row()]).drop(columns=["2 Units"])

    is_valid, messages = validate_cleaning_output(
        source,
        _cleaning_schema(),
    )

    assert is_valid is False
    assert any("2 Units" in message for message in messages)


def test_validate_cleaning_output_reports_invalid_month_format():
    source = pd.DataFrame([_cleaning_row(date="2026-5")])

    is_valid, messages = validate_cleaning_output(
        source,
        _cleaning_schema(),
    )

    assert is_valid is False
    assert any("date" in message.lower() or "yyyy-mm" in message.lower() for message in messages)


def test_validate_cleaning_output_reports_null_key_values():
    source = pd.DataFrame([_cleaning_row(location=None)])

    is_valid, messages = validate_cleaning_output(
        source,
        _cleaning_schema(),
    )

    assert is_valid is False
    assert any("null" in message.lower() for message in messages)


def test_validate_cleaning_output_reports_negative_measure():
    source = pd.DataFrame([_cleaning_row(total=-1)])

    is_valid, messages = validate_cleaning_output(
        source,
        _cleaning_schema(),
    )

    assert is_valid is False
    assert any(
        "negative" in message.lower() or "total" in message.lower()
        for message in messages
    )


def test_validate_cleaning_output_reports_noninteger_measure():
    source = pd.DataFrame([_cleaning_row(total=1.5)])

    is_valid, messages = validate_cleaning_output(
        source,
        _cleaning_schema(),
    )

    assert is_valid is False
    assert any("integer" in message.lower() for message in messages)


def test_validate_cleaning_output_reports_unknown_location():
    source = pd.DataFrame([_cleaning_row(location="Changed Census Label")])

    is_valid, messages = validate_cleaning_output(
        source,
        _cleaning_schema(),
    )

    assert is_valid is False
    assert any("Changed Census Label" in message for message in messages)


def test_validate_building_permits_dataset_accepts_valid_dataset():
    is_valid, messages = validate_building_permits_dataset(
        _final_frame(),
        _final_validation_config(),
    )

    assert is_valid is True
    assert messages == []


def test_validate_building_permits_dataset_reports_missing_columns():
    source = _final_frame().drop(columns=["5 Units or More"])

    is_valid, messages = validate_building_permits_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("5 Units or More" in message for message in messages)


def test_validate_building_permits_dataset_reports_row_count_bounds():
    source = _final_frame()

    below_valid, below_messages = validate_building_permits_dataset(
        source,
        _final_validation_config(min_rows=9),
    )
    above_valid, above_messages = validate_building_permits_dataset(
        source,
        _final_validation_config(max_rows=7),
    )

    assert below_valid is False
    assert above_valid is False
    assert any("row" in message.lower() for message in below_messages)
    assert any("row" in message.lower() for message in above_messages)


def test_validate_building_permits_dataset_reports_missing_level():
    source = _final_frame()
    source = source[source["Geographic Level"].ne("Metro")]

    is_valid, messages = validate_building_permits_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("Metro" in message for message in messages)


def test_validate_building_permits_dataset_reports_missing_state_by_month():
    source = _final_frame()
    source = source[
        ~(
            source["Date"].eq("2026-05")
            & source["Geographic Level"].eq("State")
            & source["Location"].eq("Texas")
        )
    ]

    is_valid, messages = validate_building_permits_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any(
        "Texas" in message and "2026-05" in message
        for message in messages
    )


def test_validate_building_permits_dataset_reports_unknown_metro():
    source = _final_frame()
    metro_index = source[
        source["Location"].eq("San Francisco")
    ].index[0]
    source.loc[metro_index, "Location"] = "Changed Census Label"

    is_valid, messages = validate_building_permits_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("Changed Census Label" in message for message in messages)


def test_validate_building_permits_dataset_reports_month_gap():
    source = _final_frame()
    source.loc[source["Date"].eq("2026-05"), "Date"] = "2026-06"

    is_valid, messages = validate_building_permits_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("2026-05" in message for message in messages)


def test_validate_building_permits_dataset_reports_duplicate_keys():
    source = _final_frame()
    source = pd.concat([source, source.iloc[[0]]], ignore_index=True)

    is_valid, messages = validate_building_permits_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any("duplicate" in message.lower() for message in messages)


def test_validate_building_permits_dataset_reports_negative_measure():
    source = _final_frame()
    source.loc[source.index[0], "Total"] = -1

    is_valid, messages = validate_building_permits_dataset(
        source,
        _final_validation_config(),
    )

    assert is_valid is False
    assert any(
        "negative" in message.lower() or "total" in message.lower()
        for message in messages
    )
