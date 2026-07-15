import numpy as np
import pandas as pd
import pytest

from scripts.building_permits.cleaning.measure_coercion import coerce_measures_to_int

MEASURE_COLUMNS = ["Total", "1 Unit"]


def _frame(total, one_unit):
    return pd.DataFrame(
        {
            "Location": ["Bakersfield"],
            "Date": ["2026-05"],
            "Total": [total],
            "1 Unit": [one_unit],
        }
    )


def test_coerce_measures_to_int_casts_numeric_strings():
    result = coerce_measures_to_int(_frame("10", "6"), MEASURE_COLUMNS)

    assert all(pd.api.types.is_integer_dtype(result[column]) for column in MEASURE_COLUMNS)
    assert result.loc[0, "Total"] == 10


def test_coerce_measures_to_int_reports_offending_cell():
    with pytest.raises(ValueError, match=r"2026-05.*Bakersfield.*Total"):
        coerce_measures_to_int(_frame("not numeric", "6"), MEASURE_COLUMNS)


def test_coerce_measures_to_int_rejects_blank_cell():
    with pytest.raises(ValueError, match="1 Unit"):
        coerce_measures_to_int(_frame("10", np.nan), MEASURE_COLUMNS)


def test_coerce_measures_to_int_does_not_mutate_input():
    source = _frame("10", "6")
    original = source.copy(deep=True)

    coerce_measures_to_int(source, MEASURE_COLUMNS)

    pd.testing.assert_frame_equal(source, original)
