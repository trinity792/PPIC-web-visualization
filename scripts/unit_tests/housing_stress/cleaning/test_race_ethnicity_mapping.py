import pandas as pd
import pytest

from scripts.housing_stress.cleaning.race_ethnicity_mapping import (
    CANONICAL_RACE_GROUPS,
    RACE_ITERATION_MAP,
    get_canonical_race_groups,
    reconcile_race_label,
)

EXPECTED_ITERATION_MAP = {
    "b25140": "All",
    "b25140b": "Black",
    "b25140c": "AIAN",
    "b25140d": "Asian",
    "b25140e": "NHPI",
    "b25140f": "Other",
    "b25140g": "Multiracial",
    "b25140h": "White",
    "b25140i": "Hispanic",
}

EXPECTED_GROUPS = [
    "All",
    "White",
    "Black",
    "Asian",
    "NHPI",
    "AIAN",
    "Multiracial",
    "Hispanic",
    "Other",
]


def test_race_iteration_map_covers_all_nine_acs_tables():
    assert RACE_ITERATION_MAP == EXPECTED_ITERATION_MAP


def test_get_canonical_race_groups_returns_nine_ordered_unique_labels():
    groups = get_canonical_race_groups()

    assert groups == EXPECTED_GROUPS
    assert groups == CANONICAL_RACE_GROUPS
    assert len(groups) == len(set(groups)) == 9


def test_reconcile_race_label_maps_every_raw_label():
    reconciliation_map = {
        "All": "All",
        "Black": "Black",
        "American Indian/Alaskan Native": "AIAN",
        "Asian": "Asian",
        "Native Hawaiian/Pacific Islander": "NHPI",
        "Other": "Other",
        "Multiracial": "Multiracial",
        "White": "White",
        "Hispanic": "Hispanic",
    }
    source = pd.DataFrame(
        {"Race/Ethnicity": list(reconciliation_map)}
    )

    result = reconcile_race_label(
        source,
        "Race/Ethnicity",
        reconciliation_map,
    )

    assert result["Race/Ethnicity"].tolist() == list(
        reconciliation_map.values()
    )


def test_reconcile_race_label_keeps_all_and_other_distinct():
    source = pd.DataFrame({"Race/Ethnicity": ["All", "Other"]})

    result = reconcile_race_label(
        source,
        "Race/Ethnicity",
        {"All": "All", "Other": "Other"},
    )

    assert result["Race/Ethnicity"].tolist() == ["All", "Other"]


def test_reconcile_race_label_raises_for_every_unmapped_label():
    source = pd.DataFrame(
        {"Race/Ethnicity": ["White", "Unknown A", "Unknown B"]}
    )

    with pytest.raises(ValueError, match=r"Unknown A.*Unknown B|Unknown B.*Unknown A"):
        reconcile_race_label(
            source,
            "Race/Ethnicity",
            {"White": "White"},
        )


def test_reconcile_race_label_preserves_other_columns_and_input():
    source = pd.DataFrame(
        {
            "Location": ["California"],
            "Race/Ethnicity": ["American Indian/Alaskan Native"],
        }
    )

    result = reconcile_race_label(
        source,
        "Race/Ethnicity",
        {"American Indian/Alaskan Native": "AIAN"},
    )

    assert result.loc[0, "Location"] == "California"
    assert result.loc[0, "Race/Ethnicity"] == "AIAN"
    assert source.loc[0, "Race/Ethnicity"] == "American Indian/Alaskan Native"


def test_white_is_sourced_from_iteration_h_not_iteration_a():
    assert RACE_ITERATION_MAP["b25140h"] == "White"
    assert "b25140a" not in RACE_ITERATION_MAP
