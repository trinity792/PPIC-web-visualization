import pandas as pd
import pytest

from scripts.housing_stress.cleaning.column_normalization import (
    drop_margin_of_error_columns,
    rename_geography_columns,
    strip_table_prefix,
)


def _prefixed_frame(prefix="B25140"):
    values = {
        f"{prefix}_E{number:03d}": [number]
        for number in range(1, 14)
    }
    values.update(
        {
            f"{prefix}_M001": [101],
            "NAME": ["California"],
            "STUSAB": ["CA"],
        }
    )
    return pd.DataFrame(values)


def test_strip_table_prefix_yields_bare_estimate_columns():
    result = strip_table_prefix(_prefixed_frame())

    assert {f"E{number:03d}" for number in range(1, 14)} <= set(result.columns)
    assert "M001" in result.columns
    assert "B25140_E001" not in result.columns


def test_strip_table_prefix_handles_race_iteration_prefix():
    result = strip_table_prefix(_prefixed_frame("B25140H"))

    assert result.loc[0, "E001"] == 1
    assert result.loc[0, "E013"] == 13


def test_strip_table_prefix_raises_when_estimate_column_is_missing():
    source = _prefixed_frame().drop(columns="B25140_E013")

    with pytest.raises(ValueError, match="E013"):
        strip_table_prefix(source)


def test_strip_table_prefix_raises_when_stripping_creates_duplicate_column():
    source = _prefixed_frame()
    source["B25140H_E001"] = 999

    with pytest.raises(ValueError, match="E001"):
        strip_table_prefix(source)


def test_strip_table_prefix_preserves_geography_and_does_not_mutate_input():
    source = _prefixed_frame()

    result = strip_table_prefix(source)

    assert result[["NAME", "STUSAB"]].iloc[0].tolist() == ["California", "CA"]
    assert "B25140_E001" in source.columns


def test_drop_margin_of_error_columns_drops_only_exact_moe_columns():
    source = pd.DataFrame(
        {
            "E001": [100],
            "M001": [5],
            "M013": [8],
            "MARGIN_NOTE": ["keep"],
            "NAME": ["California"],
        }
    )

    result = drop_margin_of_error_columns(source)

    assert result.columns.tolist() == ["E001", "MARGIN_NOTE", "NAME"]


def test_drop_margin_of_error_columns_does_not_mutate_input():
    source = pd.DataFrame({"E001": [100], "M001": [5]})

    drop_margin_of_error_columns(source)

    assert source.columns.tolist() == ["E001", "M001"]


def test_rename_geography_columns_maps_name_and_state_abbreviation():
    source = pd.DataFrame(
        {
            "NAME": ["California"],
            "STUSAB": ["CA"],
            "E001": [100],
        }
    )

    result = rename_geography_columns(
        source,
        {"location_column": "Location", "state_column": "State"},
    )

    assert result.columns.tolist() == ["Location", "State", "E001"]
    assert result.loc[0, "Location"] == "California"
    assert result.loc[0, "State"] == "CA"
