import numpy as np
import pandas as pd
import pytest

from scripts.building_permits.cleaning.metro_permits_cleaner import (
    clean_metro_permits,
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
        "cbsa_code_renames": {
            12540: "Bakersfield",
            41860: "San Francisco-Oakland-Berkeley",
            44700: "Stockton",
        },
        "metro_display_renames": {
            "Riverside-San Bernardino-Ontario": "Inland Empire",
            "San Francisco-Oakland-Berkeley": "San Francisco",
        },
        "micro_metro_code": 5,
    }


def _raw_metro_frame():
    header = [
        "CSA",
        "CBSA",
        "Name",
        "Metro /Micro Code",
        *MEASURE_COLUMNS,
        "Num of Structures With 5 Units or More",
        np.nan,
    ]
    rows = [
        ["New Privately Owned Housing Units Authorized", *([np.nan] * 10)],
        ["Unadjusted Units by CBSA", *([np.nan] * 10)],
        [np.nan] * 11,
        [202605, *([np.nan] * 10)],
        [np.nan] * 11,
        [np.nan, np.nan, np.nan, np.nan, "Current Month", *([np.nan] * 6)],
        header,
        [
            999,
            12540,
            "Unexpected source label, CA   ",
            2,
            "10",
            "6",
            "1",
            "1",
            "2",
            "1",
            np.nan,
        ],
        [
            999,
            40140,
            "Riverside-San Bernardino-Ontario, CA",
            2,
            "20",
            "8",
            "2",
            "4",
            "6",
            "1",
            np.nan,
        ],
        [
            999,
            99901,
            "California Micropolitan Area, CA",
            5,
            "3",
            "3",
            "0",
            "0",
            "0",
            "0",
            np.nan,
        ],
        [
            999,
            38900,
            "Portland-Vancouver-Hillsboro, OR",
            2,
            "30",
            "15",
            "3",
            "4",
            "8",
            "2",
            np.nan,
        ],
        [np.nan] * 11,
    ]
    return pd.DataFrame(rows)


def test_clean_metro_permits_reseats_header_and_drops_all_nan_axes():
    result = clean_metro_permits(
        _raw_metro_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert list(result.columns) == OUTPUT_COLUMNS
    assert len(result) == 2
    assert not result.isna().all(axis=1).any()
    assert not result.isna().all(axis=0).any()


def test_clean_metro_permits_keeps_only_california_rows():
    result = clean_metro_permits(
        _raw_metro_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert "Portland-Vancouver-Hillsboro" not in set(result["Location"])
    assert set(result["Location"]) == {"Bakersfield", "Inland Empire"}


def test_clean_metro_permits_drops_micropolitan_rows():
    result = clean_metro_permits(
        _raw_metro_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert "California Micropolitan Area" not in set(result["Location"])


def test_clean_metro_permits_applies_cbsa_and_display_rename_maps():
    raw = _raw_metro_frame()
    san_francisco = raw.iloc[[7]].copy()
    san_francisco.iloc[0, 1] = 41860
    raw = pd.concat([raw, san_francisco], ignore_index=True)

    result = clean_metro_permits(raw, 2026, 5, _schema_config())

    assert {"Bakersfield", "San Francisco", "Inland Empire"} <= set(
        result["Location"]
    )
    assert "Unexpected source label" not in set(result["Location"])
    assert "San Francisco-Oakland-Berkeley" not in set(result["Location"])


def test_clean_metro_permits_casts_all_measures_to_integers():
    result = clean_metro_permits(
        _raw_metro_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert all(
        pd.api.types.is_integer_dtype(result[column])
        for column in MEASURE_COLUMNS
    )
    assert result.loc[result["Location"] == "Bakersfield", "Total"].item() == 10


def test_clean_metro_permits_stamps_zero_padded_date():
    result = clean_metro_permits(
        _raw_metro_frame(),
        2026,
        5,
        _schema_config(),
    )

    assert result["Date"].tolist() == ["2026-05", "2026-05"]


def test_clean_metro_permits_missing_expected_column_raises():
    raw = _raw_metro_frame()
    raw.iloc[6, 6] = "Unexpected replacement"

    with pytest.raises(ValueError, match=r"(?i)missing.*2 Units|2 Units.*missing"):
        clean_metro_permits(raw, 2026, 5, _schema_config())


def test_clean_metro_permits_invalid_measure_raises_value_error():
    raw = _raw_metro_frame()
    raw.iloc[7, 4] = "not numeric"

    with pytest.raises(ValueError):
        clean_metro_permits(raw, 2026, 5, _schema_config())


def test_clean_metro_permits_renames_survive_float_typed_codes():
    # xlrd often reads numeric .xls cells as floats; the code-based rename and the
    # micropolitan filter must still fire when CBSA / Metro-Micro codes arrive as
    # floats (41860.0, 5.0) rather than ints (guide B2).
    raw = _raw_metro_frame()
    san_francisco = raw.iloc[[7]].copy()
    san_francisco.iloc[0, 1] = 41860
    raw = pd.concat([raw, san_francisco], ignore_index=True)
    # Force the code columns to float, as a float-typed .xls parse would.
    raw.iloc[7:, 1] = raw.iloc[7:, 1].astype(float)
    raw.iloc[7:, 3] = raw.iloc[7:, 3].astype(float)

    result = clean_metro_permits(raw, 2026, 5, _schema_config())

    assert "San Francisco" in set(result["Location"])
    assert "San Francisco-Oakland-Berkeley" not in set(result["Location"])
    # The micropolitan row (code 5.0) is still dropped.
    assert "California Micropolitan Area" not in set(result["Location"])


def test_clean_metro_permits_does_not_mutate_input():
    raw = _raw_metro_frame()
    original = raw.copy(deep=True)

    clean_metro_permits(raw, 2026, 5, _schema_config())

    pd.testing.assert_frame_equal(raw, original)
