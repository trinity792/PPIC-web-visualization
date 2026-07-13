"""Tests for scripts/shared/data_cleaning/aggregation.py."""

import pandas as pd

from scripts.shared.data_cleaning.aggregation import aggregate_additive_columns, detect_additive_columns


def test_detect_additive_columns_excludes_non_numeric_and_configured():
    frame = pd.DataFrame(
        {
            "Year": [2020, 2020],
            "Location": ["A", "B"],
            "Births": [1, 2],
            "Label": ["x", "y"],
        }
    )
    detected = detect_additive_columns(frame, "Year", {"Location"})
    assert detected == ["Births"]


def test_aggregate_additive_columns_sums_by_group():
    frame = pd.DataFrame(
        {
            "Year": [2020, 2020, 2021],
            "Location": ["A", "B", "A"],
            "Births": [1, 2, 5],
        }
    )
    aggregated = aggregate_additive_columns(frame, "Year", {"Location"})
    assert aggregated.set_index("Year")["Births"].to_dict() == {2020: 3, 2021: 5}


def test_aggregate_additive_columns_reuses_supplied_columns():
    frame = pd.DataFrame({"Year": [2020, 2020], "Births": [1, 2], "Deaths": [3, 4]})
    aggregated = aggregate_additive_columns(frame, "Year", set(), additive_columns=["Births"])
    assert list(aggregated.columns) == ["Year", "Births"]
    assert aggregated.loc[0, "Births"] == 3


def test_aggregate_additive_columns_empty_frame_returns_group_only():
    frame = pd.DataFrame(columns=["Year", "Births"])
    aggregated = aggregate_additive_columns(frame, "Year", set())
    assert list(aggregated.columns) == ["Year"]
    assert aggregated.empty
