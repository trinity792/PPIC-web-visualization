import pandas as pd
import pytest
from scripts.rhna_progress.cleaning.reshape_income_levels import reshape_to_income_levels

from scripts.unit_tests.rhna_progress.helpers import (
    INCOME_LEVELS,
    schema_config,
    wide_income_frame,
)


def test_reshape_to_income_levels_emits_exactly_five_income_rows():
    result = reshape_to_income_levels(wide_income_frame(), schema_config())

    assert result["Income Level"].tolist() == INCOME_LEVELS
    assert len(result) == 5
    assert {"Units", "RHNA", "Percent"} <= set(result.columns)


def test_reshape_to_income_levels_derives_total_from_tier_sums():
    result = reshape_to_income_levels(wide_income_frame(), schema_config())
    total = result.loc[result["Income Level"].eq("Total")].iloc[0]

    assert total["Units"] == 53
    assert total["RHNA"] == 106
    assert total["Percent"] == pytest.approx(0.5)


def test_reshape_to_income_levels_preserves_jurisdiction_metadata_on_all_rows():
    result = reshape_to_income_levels(wide_income_frame(), schema_config())

    assert result["Jurisdiction"].nunique() == 1
    assert result["Cycle"].unique().tolist() == [5]
    assert result["Planning Period"].unique().tolist() == ["01/31/2015 - 01/31/2023"]


def test_reshape_to_income_levels_keeps_null_total_percent_when_total_rhna_zero():
    source = wide_income_frame(
        **{
            "Very Low RHNA": 0,
            "Low RHNA": 0,
            "Moderate RHNA": 0,
            "Above Moderate RHNA": 0,
        }
    )

    result = reshape_to_income_levels(source, schema_config())
    total = result.loc[result["Income Level"].eq("Total")].iloc[0]

    assert total["RHNA"] == 0
    assert pd.isna(total["Percent"])


def test_reshape_to_income_levels_does_not_mutate_input():
    source = wide_income_frame()
    original = source.copy(deep=True)

    reshape_to_income_levels(source, schema_config())

    pd.testing.assert_frame_equal(source, original)

