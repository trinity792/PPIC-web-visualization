import pandas as pd
from scripts.rhna_progress.cleaning.income_measures import (
    coerce_income_measures,
    stamp_provenance,
)

from scripts.unit_tests.rhna_progress.helpers import schema_config, wide_income_frame


def test_coerce_income_measures_casts_units_rhna_and_percents():
    source = wide_income_frame(
        **{
            "Very Low Units": "10",
            "Very Low RHNA": "20",
            "Very Low Percent": "0.50",
        }
    )

    result = coerce_income_measures(source, schema_config())

    assert pd.api.types.is_integer_dtype(result["Very Low Units"])
    assert pd.api.types.is_integer_dtype(result["Very Low RHNA"])
    assert pd.api.types.is_float_dtype(result["Very Low Percent"])
    assert result.loc[0, "Very Low Units"] == 10
    assert result.loc[0, "Very Low Percent"] == 0.50


def test_coerce_income_measures_replaces_percent_sentinels_with_null():
    source = wide_income_frame(
        **{
            "Very Low Percent": "Infinity",
            "Low Percent": "#DIV/0!",
        }
    )

    result = coerce_income_measures(source, schema_config())

    assert pd.isna(result.loc[0, "Very Low Percent"])
    assert pd.isna(result.loc[0, "Low Percent"])


def test_coerce_income_measures_coerces_single_bad_cell_without_raising():
    source = wide_income_frame(**{"Very Low Units": "not numeric"})

    result = coerce_income_measures(source, schema_config())

    assert pd.isna(result.loc[0, "Very Low Units"])
    assert pd.api.types.is_integer_dtype(result["Very Low Units"])


def test_coerce_income_measures_does_not_mutate_input():
    source = wide_income_frame()
    original = source.copy(deep=True)

    coerce_income_measures(source, schema_config())

    pd.testing.assert_frame_equal(source, original)


def test_stamp_provenance_attaches_snapshot_and_source_last_updated():
    source = wide_income_frame()

    result = stamp_provenance(
        source,
        "2026-07-15T00:00:00",
        "2026-07-15T12:30:00",
    )

    assert (result["Snapshot Date"] == pd.Timestamp("2026-07-15")).all()
    assert (
        result["Source Last Updated"]
        == pd.Timestamp("2026-07-15T12:30:00")
    ).all()
    assert "Snapshot Date" not in source.columns
