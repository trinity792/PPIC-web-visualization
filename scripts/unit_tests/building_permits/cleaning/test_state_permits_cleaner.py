import numpy as np
import pandas as pd
import pytest
from scripts.building_permits.cleaning.state_permits_cleaner import (
    clean_state_permits,
)

MEASURE_COLUMNS = [
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]

OUTPUT_COLUMNS = ["Location", "Date", *MEASURE_COLUMNS]


def _schema_config():
    return {
        "measure_columns": list(MEASURE_COLUMNS),
        "state_names": ["California", "Texas"],
    }


def _raw_state_frame():
    return pd.DataFrame(
        [
            [
                "New Privately Owned Housing Units Authorized",
                np.nan,
                np.nan,
                np.nan,
                np.nan,
                np.nan,
                np.nan,
            ],
            [np.nan] * 7,
            ["  California  ", "100", "60", "5", "10", "25", "999"],
            ["Texas", "200", "120", "10", "20", "50", "999"],
            ["District of Columbia", "30", "20", "1", "2", "7", "999"],
            ["Northeast Region", "400", "200", "20", "40", "140", "999"],
        ],
        columns=[
            "Area",
            "Current total",
            "Current 1-unit",
            "Current 2-unit",
            "Current 3-and-4-unit",
            "Current 5-or-more-unit",
            "Year-to-date total",
        ],
    )


def test_clean_state_permits_selects_and_renames_six_columns():
    result = clean_state_permits(
        _raw_state_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert list(result.columns) == OUTPUT_COLUMNS
    assert "Year-to-date total" not in result.columns


def test_clean_state_permits_filters_to_configured_state_names():
    result = clean_state_permits(
        _raw_state_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert result["Location"].tolist() == ["California", "Texas"]
    assert "District of Columbia" not in set(result["Location"])
    assert "Northeast Region" not in set(result["Location"])


def test_clean_state_permits_drops_all_nan_rows_and_trims_locations():
    result = clean_state_permits(
        _raw_state_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert len(result) == 2
    assert result.loc[0, "Location"] == "California"
    assert not result.isna().all(axis=1).any()


def test_clean_state_permits_casts_all_measures_to_integers():
    result = clean_state_permits(
        _raw_state_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert all(
        pd.api.types.is_integer_dtype(result[column])
        for column in MEASURE_COLUMNS
    )
    assert result.loc[result["Location"] == "Texas", "Total"].item() == 200


def test_clean_state_permits_stamps_zero_padded_date():
    result = clean_state_permits(
        _raw_state_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert result["Date"].tolist() == ["2026-05", "2026-05"]


def test_clean_state_permits_missing_expected_column_raises():
    raw = _raw_state_frame().iloc[:, :5]

    with pytest.raises(ValueError, match=r"(?i)expected.*6|missing"):
        clean_state_permits(raw, 2026, 5, _schema_config())


def test_clean_state_permits_invalid_measure_raises_value_error():
    raw = _raw_state_frame()
    raw.loc[2, "Current total"] = "not numeric"

    with pytest.raises(ValueError):
        clean_state_permits(raw, 2026, 5, _schema_config())


def test_clean_state_permits_does_not_mutate_input():
    raw = _raw_state_frame()
    original = raw.copy(deep=True)

    clean_state_permits(raw, 2026, 5, _schema_config())

    pd.testing.assert_frame_equal(raw, original)
