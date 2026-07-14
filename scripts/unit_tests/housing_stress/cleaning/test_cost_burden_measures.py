import math

import pandas as pd
import pytest

from scripts.housing_stress.cleaning.cost_burden_measures import (
    compute_tenure_measures,
)

TENURE_FORMULAS = {
    "Total": {
        "num_30": ["E003", "E007", "E011"],
        "num_50": ["E004", "E008", "E012"],
        "denom": ["E001"],
    },
    "Rented": {
        "num_30": ["E011"],
        "num_50": ["E012"],
        "denom": ["E010"],
    },
    "Owned": {
        "num_30": ["E003", "E007"],
        "num_50": ["E004", "E008"],
        "denom": ["E002", "E006"],
    },
    "Owned With Mortgage": {
        "num_30": ["E003"],
        "num_50": ["E004"],
        "denom": ["E002"],
    },
    "Owned Without Mortgage": {
        "num_30": ["E007"],
        "num_50": ["E008"],
        "denom": ["E006"],
    },
}

SCHEMA_CONFIG = {
    "tenure_formulas": TENURE_FORMULAS,
    "tenure_column": "Tenure",
    "measure_columns": [
        "Number Over 30%",
        "Number Over 50%",
        "Share Over 30%",
        "Share Over 50%",
    ],
}


def _source_frame(**overrides):
    row = {f"E{number:03d}": 0 for number in range(1, 14)}
    row.update(
        {
            "Location": "California",
            "Race/Ethnicity": "All",
            "E001": 100,
            "E002": 50,
            "E003": 20,
            "E004": 10,
            "E006": 30,
            "E007": 9,
            "E008": 3,
            "E010": 40,
            "E011": 12,
            "E012": 6,
        }
    )
    row.update(overrides)
    return pd.DataFrame([row])


@pytest.mark.parametrize(
    ("tenure", "number_30", "number_50", "share_30", "share_50"),
    [
        ("Total", 41, 19, 0.41, 0.19),
        ("Rented", 12, 6, 0.30, 0.15),
        ("Owned", 29, 13, 0.3625, 0.1625),
        ("Owned With Mortgage", 20, 10, 0.40, 0.20),
        ("Owned Without Mortgage", 9, 3, 0.30, 0.10),
    ],
)
def test_compute_tenure_measures_reproduces_legacy_formulas(
    tenure,
    number_30,
    number_50,
    share_30,
    share_50,
):
    result = compute_tenure_measures(
        _source_frame(),
        ["Location", "Race/Ethnicity"],
        SCHEMA_CONFIG,
    )
    row = result.loc[result["Tenure"] == tenure].iloc[0]

    assert row["Number Over 30%"] == number_30
    assert row["Number Over 50%"] == number_50
    assert row["Share Over 30%"] == pytest.approx(share_30)
    assert row["Share Over 50%"] == pytest.approx(share_50)


def test_compute_tenure_measures_returns_contract_columns():
    result = compute_tenure_measures(
        _source_frame(),
        ["Location", "Race/Ethnicity"],
        SCHEMA_CONFIG,
    )

    assert result.columns.tolist() == [
        "Location",
        "Race/Ethnicity",
        "Tenure",
        "Number Over 30%",
        "Number Over 50%",
        "Share Over 30%",
        "Share Over 50%",
    ]


def test_compute_tenure_measures_zero_denominator_yields_na_not_infinity():
    result = compute_tenure_measures(
        _source_frame(E010=0),
        ["Location"],
        SCHEMA_CONFIG,
    )
    rented = result.loc[result["Tenure"] == "Rented"].iloc[0]

    assert pd.isna(rented["Share Over 30%"])
    assert pd.isna(rented["Share Over 50%"])
    assert not math.isinf(rented["Share Over 30%"])
    assert not math.isinf(rented["Share Over 50%"])


def test_compute_tenure_measures_expands_one_row_to_five_tenures():
    result = compute_tenure_measures(
        _source_frame(),
        ["Location"],
        SCHEMA_CONFIG,
    )

    assert len(result) == 5
    assert result["Tenure"].tolist() == list(TENURE_FORMULAS)


def test_compute_tenure_measures_expands_each_input_row():
    source = pd.concat(
        [
            _source_frame(Location="California"),
            _source_frame(Location="Oregon"),
        ],
        ignore_index=True,
    )

    result = compute_tenure_measures(source, ["Location"], SCHEMA_CONFIG)

    assert len(result) == 10
    assert result.groupby("Location").size().to_dict() == {
        "California": 5,
        "Oregon": 5,
    }


def test_compute_tenure_measures_carries_multiple_identifier_columns():
    result = compute_tenure_measures(
        _source_frame(),
        ["Location", "Race/Ethnicity"],
        SCHEMA_CONFIG,
    )

    assert result["Location"].eq("California").all()
    assert result["Race/Ethnicity"].eq("All").all()


def test_compute_tenure_measures_raises_for_formula_column_missing_from_data():
    source = _source_frame().drop(columns="E012")

    with pytest.raises(ValueError, match="E012"):
        compute_tenure_measures(source, ["Location"], SCHEMA_CONFIG)


def test_compute_tenure_measures_does_not_mutate_input():
    source = _source_frame()
    original = source.copy(deep=True)

    compute_tenure_measures(source, ["Location"], SCHEMA_CONFIG)

    pd.testing.assert_frame_equal(source, original)


def test_compute_tenure_measures_shares_are_finite_for_positive_denominators():
    result = compute_tenure_measures(
        _source_frame(),
        ["Location"],
        SCHEMA_CONFIG,
    )

    assert result["Share Over 30%"].map(math.isfinite).all()
    assert result["Share Over 50%"].map(math.isfinite).all()
