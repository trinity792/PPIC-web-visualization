from datetime import date

import pandas as pd
import pytest
from scripts.rhna_progress.enrichment.overall_progress import (
    derive_overall_progress,
    mark_most_recent,
)

from scripts.unit_tests.rhna_progress.helpers import (
    INCOME_LEVELS,
    TIER_LEVELS,
    long_row,
    schema_config,
)


def _tier_rows(
    *,
    jurisdiction="Alameda",
    units_by_level=None,
    rhna_by_level=None,
    scores_by_level=None,
    snapshot_date=date(2026, 7, 15),
    planning_end=date(2029, 10, 15),
):
    units_by_level = units_by_level or {
        "Very Low": 300,
        "Low": 50,
        "Moderate": 0,
        "Above Moderate": 20,
    }
    rhna_by_level = rhna_by_level or {
        "Very Low": 100,
        "Low": 100,
        "Moderate": 0,
        "Above Moderate": 100,
    }
    scores_by_level = scores_by_level or {
        "Very Low": 3.0,
        "Low": 0.8,
        "Moderate": pd.NA,
        "Above Moderate": 0.4,
    }
    rows = []
    for level in TIER_LEVELS:
        row = long_row(
            jurisdiction=jurisdiction,
            income_level=level,
            units=units_by_level[level],
            rhna=rhna_by_level[level],
            snapshot_date=snapshot_date,
            planning_end=planning_end,
        )
        row["On Track Score"] = scores_by_level[level]
        rows.append(row)
    total = long_row(
        jurisdiction=jurisdiction,
        income_level="Total",
        units=sum(units_by_level.values()),
        rhna=sum(rhna_by_level.values()),
        snapshot_date=snapshot_date,
        planning_end=planning_end,
    )
    total["On Track Score"] = 1.2
    rows.append(total)
    return rows


def test_derive_overall_progress_caps_overbuilt_tiers_before_averaging():
    result = derive_overall_progress(
        pd.DataFrame(_tier_rows()),
        schema_config(),
    )

    assert set(result["Tiers With Goal"]) == {3}
    assert set(result["Tiers Met"]) == {1}
    assert result["Overall Progress"].nunique() == 1
    assert result["Overall Progress"].iloc[0] == pytest.approx(0.566667)
    assert result["Overall On Track Score"].nunique() == 1
    assert result["Overall On Track Score"].iloc[0] == pytest.approx(0.733333)
    assert set(result["Overall Category"]) == {"Nearly On Track"}


def test_derive_overall_progress_ignores_total_row_in_tier_rollup():
    rows = _tier_rows()
    rows[-1]["Units"] = 10_000
    rows[-1]["RHNA"] = 1
    rows[-1]["On Track Score"] = 10_000

    result = derive_overall_progress(pd.DataFrame(rows), schema_config())

    assert result["Overall Progress"].iloc[0] == pytest.approx(0.566667)
    assert result["Overall On Track Score"].iloc[0] == pytest.approx(0.733333)


def test_derive_overall_progress_reports_met_when_every_tier_with_goal_is_met():
    result = derive_overall_progress(
        pd.DataFrame(
            _tier_rows(
                units_by_level={
                    "Very Low": 100,
                    "Low": 100,
                    "Moderate": 0,
                    "Above Moderate": 100,
                },
                rhna_by_level={
                    "Very Low": 100,
                    "Low": 100,
                    "Moderate": 0,
                    "Above Moderate": 100,
                },
                scores_by_level={
                    "Very Low": 1.0,
                    "Low": 1.0,
                    "Moderate": pd.NA,
                    "Above Moderate": 1.0,
                },
            )
        ),
        schema_config(),
    )

    assert set(result["Tiers With Goal"]) == {3}
    assert set(result["Tiers Met"]) == {3}
    assert set(result["Overall Category"]) == {"Met"}


def test_derive_overall_progress_reports_behind_after_deadline_when_not_all_met():
    result = derive_overall_progress(
        pd.DataFrame(_tier_rows(planning_end=date(2024, 10, 15))),
        schema_config(),
    )

    assert set(result["Overall Category"]) == {"Behind"}


def test_derive_overall_progress_reports_no_allocation_when_no_tier_has_goal():
    zero_goals = {level: 0 for level in TIER_LEVELS}
    result = derive_overall_progress(
        pd.DataFrame(
            _tier_rows(
                units_by_level=zero_goals,
                rhna_by_level=zero_goals,
                scores_by_level={level: pd.NA for level in TIER_LEVELS},
            )
        ),
        schema_config(),
    )

    assert set(result["Tiers With Goal"]) == {0}
    assert result["Overall Progress"].isna().all()
    assert set(result["Overall Category"]) == {"No Allocation"}


def test_mark_most_recent_flags_all_rows_at_latest_snapshot_per_jurisdiction_cycle():
    rows = []
    for snapshot_date in (date(2026, 7, 1), date(2026, 7, 15)):
        for income_level in INCOME_LEVELS:
            rows.append(
                long_row(
                    jurisdiction="Alameda",
                    income_level=income_level,
                    snapshot_date=snapshot_date,
                    most_recent=False,
                )
            )
    rows.append(
        long_row(
            jurisdiction="Berkeley",
            income_level="Total",
            snapshot_date=date(2026, 6, 1),
            most_recent=False,
        )
    )

    result = mark_most_recent(pd.DataFrame(rows))

    latest_alameda = result[
        result["Jurisdiction"].eq("Alameda")
        & result["Snapshot Date"].eq(pd.Timestamp("2026-07-15"))
    ]
    older_alameda = result[
        result["Jurisdiction"].eq("Alameda")
        & result["Snapshot Date"].eq(pd.Timestamp("2026-07-01"))
    ]
    berkeley = result[result["Jurisdiction"].eq("Berkeley")]
    assert latest_alameda["Most Recent"].all()
    assert not older_alameda["Most Recent"].any()
    assert berkeley["Most Recent"].all()


def test_derive_overall_progress_broadcasts_same_values_to_all_income_rows():
    result = derive_overall_progress(pd.DataFrame(_tier_rows()), schema_config())

    assert len(result) == 5
    assert result["Overall Progress"].nunique() == 1
    assert result["Overall Category"].nunique() == 1
