import pandas as pd
import pytest

from scripts.building_permits.geography.geographic_levels import (
    tag_geographic_levels,
    validate_metro_names,
)

MEASURE_COLUMNS = [
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]


def _frame(rows):
    return pd.DataFrame(
        rows,
        columns=["Location", "Date", *MEASURE_COLUMNS],
    )


def _state_frame():
    return _frame(
        [
            ["Texas", "2026-05", 20, 10, 2, 3, 5],
            ["California", "2026-04", 10, 6, 1, 1, 2],
        ]
    )


def _metro_frame():
    return _frame(
        [
            ["San Francisco", "2026-05", 8, 3, 1, 1, 3],
            ["Bakersfield", "2026-04", 4, 2, 0, 1, 1],
        ]
    )


def _geography():
    return {
        "cbsa_metros": {
            "Bakersfield",
            "San Francisco",
            "Inland Empire",
        }
    }


def test_validate_metro_names_passes_canonical_metros_unchanged():
    metros = _metro_frame()

    result = validate_metro_names(metros, _geography())

    assert result is metros
    pd.testing.assert_frame_equal(result, metros)


def test_validate_metro_names_raises_for_unknown_metro():
    metros = _frame(
        [["Changed Census Label", "2026-05", 1, 1, 0, 0, 0]]
    )

    with pytest.raises(ValueError, match="Changed Census Label"):
        validate_metro_names(metros, _geography())


def test_validate_metro_names_accepts_empty_frame():
    metros = _frame([])

    result = validate_metro_names(metros, _geography())

    assert result.empty
    assert list(result.columns) == list(metros.columns)


def test_validate_metro_names_reports_all_unknown_names():
    metros = _frame(
        [
            ["Unknown One", "2026-05", 1, 1, 0, 0, 0],
            ["Bakersfield", "2026-05", 1, 1, 0, 0, 0],
            ["Unknown Two", "2026-05", 1, 1, 0, 0, 0],
        ]
    )

    with pytest.raises(ValueError) as exc_info:
        validate_metro_names(metros, _geography())

    assert "Unknown One" in str(exc_info.value)
    assert "Unknown Two" in str(exc_info.value)


def test_tag_geographic_levels_concatenates_and_tags_rows():
    result = tag_geographic_levels(_state_frame(), _metro_frame())

    assert len(result) == 4
    assert set(result.loc[result["Geographic Level"] == "State", "Location"]) == {
        "California",
        "Texas",
    }
    assert set(result.loc[result["Geographic Level"] == "Metro", "Location"]) == {
        "Bakersfield",
        "San Francisco",
    }


def test_tag_geographic_levels_returns_contract_column_order():
    result = tag_geographic_levels(_state_frame(), _metro_frame())

    assert list(result.columns) == [
        "Geographic Level",
        "Location",
        "Date",
        *MEASURE_COLUMNS,
    ]


def test_tag_geographic_levels_sorts_by_level_location_and_date():
    state_rows = pd.concat(
        [
            _state_frame(),
            _frame([["California", "2026-05", 11, 7, 1, 1, 2]]),
        ],
        ignore_index=True,
    )

    result = tag_geographic_levels(state_rows, _metro_frame())

    assert list(
        result[["Geographic Level", "Location", "Date"]].itertuples(
            index=False,
            name=None,
        )
    ) == [
        ("Metro", "Bakersfield", "2026-04"),
        ("Metro", "San Francisco", "2026-05"),
        ("State", "California", "2026-04"),
        ("State", "California", "2026-05"),
        ("State", "Texas", "2026-05"),
    ]


def test_tag_geographic_levels_handles_empty_state_frame():
    result = tag_geographic_levels(_frame([]), _metro_frame())

    assert set(result["Geographic Level"]) == {"Metro"}
    assert len(result) == 2


def test_tag_geographic_levels_handles_empty_metro_frame():
    result = tag_geographic_levels(_state_frame(), _frame([]))

    assert set(result["Geographic Level"]) == {"State"}
    assert len(result) == 2


def test_tag_geographic_levels_does_not_mutate_inputs():
    states = _state_frame()
    metros = _metro_frame()
    original_states = states.copy(deep=True)
    original_metros = metros.copy(deep=True)

    tag_geographic_levels(states, metros)

    pd.testing.assert_frame_equal(states, original_states)
    pd.testing.assert_frame_equal(metros, original_metros)

