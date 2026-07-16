from datetime import date

import pandas as pd
import pytest
from scripts.rhna_progress.enrichment.pace_metrics import (
    derive_pace_metrics,
    derive_time_elapsed,
)

from scripts.unit_tests.rhna_progress.helpers import long_frame, long_row, schema_config


def test_derive_time_elapsed_computes_days_and_percent_elapsed():
    source = long_frame(
        [
            long_row(
                planning_start=date(2021, 1, 1),
                planning_end=date(2029, 1, 1),
                snapshot_date=date(2025, 1, 1),
            )
        ]
    )

    result = derive_time_elapsed(source)

    assert result.loc[0, "Total Days"] == (
        date(2029, 1, 1) - date(2021, 1, 1)
    ).days
    assert result.loc[0, "Elapsed Days"] == (
        date(2025, 1, 1) - date(2021, 1, 1)
    ).days
    assert result.loc[0, "Percent Elapsed"] == pytest.approx(
        result.loc[0, "Elapsed Days"] / result.loc[0, "Total Days"]
    )


def test_derive_time_elapsed_keeps_true_elapsed_above_one_for_closed_period():
    source = long_frame(
        [
            long_row(
                planning_start=date(2015, 1, 1),
                planning_end=date(2023, 1, 1),
                snapshot_date=date(2026, 1, 1),
            )
        ]
    )

    result = derive_time_elapsed(source)

    assert result.loc[0, "Percent Elapsed"] > 1.0


def test_derive_pace_metrics_computes_worked_example():
    source = long_frame(
        [
            long_row(
                units=50,
                rhna=100,
                percent=0.50,
                percent_elapsed=0.50,
            )
        ]
    )

    result = derive_pace_metrics(source, schema_config())

    assert result.loc[0, "Projected Units"] == pytest.approx(100)
    assert result.loc[0, "On Track Score"] == pytest.approx(1.0)
    assert result.loc[0, "Status"] == "On Track"


@pytest.mark.parametrize(
    ("units", "rhna", "percent_elapsed", "snapshot_date", "planning_end", "expected"),
    [
        (0, 0, 0.50, date(2026, 7, 15), date(2029, 10, 15), "No Allocation"),
        (100, 100, 0.50, date(2026, 7, 15), date(2029, 10, 15), "Met"),
        (100, 100, 1.25, date(2026, 7, 15), date(2024, 10, 15), "Met"),
        (40, 100, 1.25, date(2026, 7, 15), date(2024, 10, 15), "Behind"),
        (50, 100, 0.50, date(2026, 7, 15), date(2029, 10, 15), "On Track"),
        (35, 100, 0.50, date(2026, 7, 15), date(2029, 10, 15), "Nearly On Track"),
        (25, 100, 0.50, date(2026, 7, 15), date(2029, 10, 15), "Somewhat Off Track"),
        (24, 100, 0.50, date(2026, 7, 15), date(2029, 10, 15), "Far Off Track"),
    ],
)
def test_derive_pace_metrics_status_four_quadrants_and_boundaries(
    units,
    rhna,
    percent_elapsed,
    snapshot_date,
    planning_end,
    expected,
):
    source = long_frame(
        [
            long_row(
                units=units,
                rhna=rhna,
                percent_elapsed=percent_elapsed,
                snapshot_date=snapshot_date,
                planning_end=planning_end,
            )
        ]
    )

    result = derive_pace_metrics(source, schema_config())

    assert result.loc[0, "Status"] == expected


def test_derive_pace_metrics_uses_ended_period_clamp_for_projection():
    source = long_frame(
        [
            long_row(
                units=50,
                rhna=100,
                percent=0.50,
                percent_elapsed=1.25,
                snapshot_date=date(2026, 7, 15),
                planning_end=date(2024, 10, 15),
            )
        ]
    )

    result = derive_pace_metrics(source, schema_config())

    assert result.loc[0, "Projected Units"] == pytest.approx(50)
    assert result.loc[0, "On Track Score"] == pytest.approx(0.50)
    assert result.loc[0, "Status"] == "Behind"


def test_derive_pace_metrics_null_safe_for_zero_denominators():
    source = long_frame(
        [
            long_row(income_level="Very Low", units=0, rhna=0, percent_elapsed=0.5),
            long_row(income_level="Low", units=10, rhna=100, percent_elapsed=0),
        ]
    )

    result = derive_pace_metrics(source, schema_config())

    assert pd.isna(result.loc[result["Income Level"].eq("Very Low"), "On Track Score"]).all()
    assert pd.isna(result.loc[result["Income Level"].eq("Low"), "Projected Units"]).all()
    assert pd.isna(result.loc[result["Income Level"].eq("Low"), "On Track Score"]).all()


def test_derive_pace_metrics_does_not_mutate_input():
    source = long_frame()
    original = source.copy(deep=True)

    derive_pace_metrics(source, schema_config())

    pd.testing.assert_frame_equal(source, original)
