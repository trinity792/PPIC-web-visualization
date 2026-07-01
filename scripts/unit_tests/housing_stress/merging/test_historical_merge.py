from unittest.mock import Mock

import pandas as pd
import pytest
from scripts.housing_stress.merging.historical_merge import (
    combine_with_historical,
    detect_new_data,
    load_canonical_dataset,
)

CONTRACT_COLUMNS = [
    "Year",
    "Geographic Level",
    "Location",
    "Race/Ethnicity",
    "Tenure",
    "Number Over 30%",
    "Number Over 50%",
    "Share Over 30%",
    "Share Over 50%",
]


def _row(
    year=2023,
    level="State",
    location="CA",
    race="All",
    tenure="Total",
    number_30=30,
):
    return {
        "Year": year,
        "Geographic Level": level,
        "Location": location,
        "Race/Ethnicity": race,
        "Tenure": tenure,
        "Number Over 30%": number_30,
        "Number Over 50%": 15,
        "Share Over 30%": 0.30,
        "Share Over 50%": 0.15,
    }


def _complete(_candidate):
    return True, []


def test_load_canonical_dataset_missing_file_returns_empty_contract(tmp_path):
    result = load_canonical_dataset(tmp_path / "missing.csv")

    assert result.empty
    assert result.columns.tolist() == CONTRACT_COLUMNS


def test_load_canonical_dataset_reads_saved_rows(tmp_path):
    path = tmp_path / "HousingStress_Current.csv"
    expected = pd.DataFrame([_row()])
    expected.to_csv(path, index=False)

    result = load_canonical_dataset(path)

    pd.testing.assert_frame_equal(result, expected)


def test_combine_with_historical_rejects_incomplete_vintage_before_mutation():
    historical = pd.DataFrame(
        [
            _row(race="All"),
            _row(race="White"),
        ]
    )
    incoming = pd.DataFrame([_row(race="All", number_30=35)])
    original_history = historical.copy(deep=True)
    original_incoming = incoming.copy(deep=True)
    validator = Mock(
        return_value=(False, ["2023 missing required tenure rows"])
    )

    with pytest.raises(ValueError, match="missing required tenure rows"):
        combine_with_historical(
            incoming,
            historical,
            "Year",
            validator,
        )

    validator.assert_called_once()
    pd.testing.assert_frame_equal(
        validator.call_args.args[0],
        original_incoming,
    )
    pd.testing.assert_frame_equal(historical, original_history)
    pd.testing.assert_frame_equal(incoming, original_incoming)


def test_combine_with_historical_preserves_non_overlapping_years():
    historical = pd.DataFrame(
        [
            _row(year=2021),
            _row(year=2022),
        ]
    )
    incoming = pd.DataFrame([_row(year=2023)])

    result = combine_with_historical(
        incoming,
        historical,
        "Year",
        _complete,
    )

    assert result["Year"].tolist() == [2021, 2022, 2023]


def test_combine_with_historical_replaces_overlapping_year_atomically():
    historical = pd.DataFrame(
        [
            _row(year=2022, race="All", number_30=20),
            _row(year=2023, race="All", number_30=30),
            _row(year=2023, race="White", number_30=10),
        ]
    )
    incoming = pd.DataFrame(
        [
            _row(year=2023, race="All", number_30=40),
            _row(year=2023, race="Black", number_30=12),
        ]
    )

    result = combine_with_historical(
        incoming,
        historical,
        "Year",
        _complete,
    )
    year_2023 = result.loc[result["Year"].eq(2023)]

    assert set(year_2023["Race/Ethnicity"]) == {"All", "Black"}
    assert year_2023.set_index("Race/Ethnicity")[
        "Number Over 30%"
    ].to_dict() == {"All": 40, "Black": 12}
    assert "White" not in set(year_2023["Race/Ethnicity"])
    assert result.loc[result["Year"].eq(2022), "Number Over 30%"].item() == 20


def test_combine_with_historical_replaces_each_incoming_year_as_a_whole():
    historical = pd.DataFrame(
        [
            _row(year=2022, race="White"),
            _row(year=2023, race="White"),
            _row(year=2024, race="White"),
        ]
    )
    incoming = pd.DataFrame(
        [
            _row(year=2022, race="All"),
            _row(year=2023, race="Black"),
        ]
    )

    result = combine_with_historical(
        incoming,
        historical,
        "Year",
        _complete,
    )

    assert result.groupby("Year")["Race/Ethnicity"].apply(set).to_dict() == {
        2022: {"All"},
        2023: {"Black"},
        2024: {"White"},
    }


def test_combine_with_historical_sorts_contract_grain():
    historical = pd.DataFrame(
        [
            _row(
                year=2022,
                level="State",
                location="OR",
                race="White",
                tenure="Rented",
            ),
            _row(
                year=2022,
                level="County",
                location="Yuba",
                race="All",
                tenure="Total",
            ),
        ]
    )
    incoming = pd.DataFrame(
        [
            _row(
                year=2023,
                level="Region",
                location="Bay Area",
                race="Black",
                tenure="Owned",
            )
        ]
    )

    result = combine_with_historical(
        incoming,
        historical,
        "Year",
        _complete,
    )
    expected = result.sort_values(
        [
            "Year",
            "Geographic Level",
            "Location",
            "Race/Ethnicity",
            "Tenure",
        ],
        ignore_index=True,
    )

    pd.testing.assert_frame_equal(result.reset_index(drop=True), expected)


def test_detect_new_data_returns_false_for_identical_data():
    historical = pd.DataFrame([_row(), _row(location="OR")])
    merged = historical.copy(deep=True)

    assert detect_new_data(merged, historical) is False


def test_detect_new_data_ignores_row_order_and_index():
    historical = pd.DataFrame([_row(), _row(location="OR")])
    merged = historical.iloc[::-1].copy()
    merged.index = [10, 20]

    assert detect_new_data(merged, historical) is False


def test_detect_new_data_returns_true_for_changed_value():
    historical = pd.DataFrame([_row(number_30=30)])
    merged = pd.DataFrame([_row(number_30=31)])

    assert detect_new_data(merged, historical) is True
