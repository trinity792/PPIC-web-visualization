import pandas as pd
import pytest
from scripts.projections.merging.historical_merge import (
    combine_history_sources,
    combine_source_with_historical,
    detect_new_source_data,
    load_canonical_dataset,
    load_historical_baseline,
    merge_dof_and_census,
    reduce_to_base_strata,
)

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
    "Source",
]


def _row(
    location="Alameda",
    year=2025,
    age_group="0-4",
    sex="Female",
    race="Asian",
    population=100,
    source="DoF P-3",
):
    return {
        "Geographic Level": "County",
        "Location": location,
        "Year": year,
        "Age Group": age_group,
        "Sex": sex,
        "Race/Ethnicity": race,
        "Population": population,
        "Source": source,
    }


def _complete(_candidate):
    return True, []


# Canonical base-strata sets used by combine/detect to reduce enriched history to
# base rows (A1/A8). The _row fixture emits only canonical base values.
_SCHEMA = {
    "canonical_age_groups": [
        "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39",
        "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79",
        "80-84", "85+",
    ],
    "canonical_sexes": ["Male", "Female"],
    "canonical_race_groups": ["White", "Black", "Asian", "NHPI", "AIAN", "Multiracial", "Hispanic"],
}


"""
========================================================================================================================
Historical Data Access
========================================================================================================================
"""


def test_load_canonical_dataset_missing_file_returns_empty_contract(tmp_path):
    # Act
    result = load_canonical_dataset(tmp_path / "missing.csv")

    # Assert
    assert result.empty
    assert list(result.columns) == CONTRACT_COLUMNS


def test_load_canonical_dataset_reads_saved_rows(tmp_path):
    # Arrange
    current_path = tmp_path / "DemographicProjections_Current.csv"
    expected = pd.DataFrame([_row()])
    expected.to_csv(current_path, index=False)

    # Act
    result = load_canonical_dataset(current_path)

    # Assert
    pd.testing.assert_frame_equal(result, expected)


"""
========================================================================================================================
Source Merging
========================================================================================================================
"""


def test_combine_source_with_historical_keeps_years_absent_from_new_data():
    # Arrange
    historical = pd.DataFrame([_row(year=2023), _row(year=2024)])
    new = pd.DataFrame([_row(year=2025)]).drop(columns=["Source"])

    # Act
    result = combine_source_with_historical(
        new,
        historical,
        "DoF P-3",
        "Year",
        _complete,
        _SCHEMA,
    )

    # Assert
    assert result["Year"].tolist() == [2023, 2024, 2025]


def test_combine_source_with_historical_new_data_wins_on_overlap():
    # Arrange
    historical = pd.DataFrame([_row(year=2025, population=100)])
    new = pd.DataFrame([_row(year=2025, population=125)]).drop(
        columns=["Source"]
    )

    # Act
    result = combine_source_with_historical(
        new,
        historical,
        "DoF P-3",
        "Year",
        _complete,
        _SCHEMA,
    )

    # Assert
    assert len(result) == 1
    assert result.loc[0, "Population"] == 125


def test_combine_source_with_historical_rejects_incomplete_overlapping_year():
    # Arrange
    historical = pd.DataFrame(
        [
            _row(year=2025, race="White", population=100),
            _row(year=2025, race="Black", population=50),
        ]
    )
    new = pd.DataFrame(
        [_row(year=2025, race="White", population=125)]
    ).drop(columns=["Source"])

    original_historical = historical.copy(deep=True)
    validated_candidates = []

    def reject_incomplete(candidate):
        validated_candidates.append(candidate.copy(deep=True))
        return False, ["2025 is incomplete: missing Black rows"]

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)2025.*incomplete|incomplete.*2025"):
        combine_source_with_historical(
            new,
            historical,
            "DoF P-3",
            "Year",
            reject_incomplete,
            _SCHEMA,
        )
    pd.testing.assert_frame_equal(historical, original_historical)
    assert len(validated_candidates) == 1
    assert set(validated_candidates[0]["Source"]) == {"DoF P-3"}
    assert set(validated_candidates[0]["Year"]) == {2025}


def test_combine_source_with_historical_replaces_complete_year_atomically():
    # Arrange
    historical = pd.DataFrame(
        [
            _row(year=2025, race="White", population=100),
            _row(year=2025, race="Black", population=50),
        ]
    )
    new = pd.DataFrame(
        [
            _row(year=2025, race="White", population=125),
            _row(year=2025, race="Asian", population=75),
        ]
    ).drop(columns=["Source"])

    # Act
    result = combine_source_with_historical(
        new,
        historical,
        "DoF P-3",
        "Year",
        _complete,
        _SCHEMA,
    )

    # Assert
    assert set(result["Race/Ethnicity"]) == {"White", "Asian"}
    assert result.set_index("Race/Ethnicity")["Population"].to_dict() == {
        "White": 125,
        "Asian": 75,
    }
    assert "Black" not in set(result["Race/Ethnicity"])


def test_combine_source_with_historical_rejects_incomplete_new_year():
    # Arrange
    historical = pd.DataFrame([_row(year=2024)])
    new = pd.DataFrame([_row(year=2025)]).drop(columns=["Source"])

    # Act / Assert
    with pytest.raises(ValueError, match=r"(?i)2025.*incomplete|incomplete.*2025"):
        combine_source_with_historical(
            new,
            historical,
            "DoF P-3",
            "Year",
            lambda _candidate: (False, ["2025 is incomplete"]),
            _SCHEMA,
        )


def test_combine_source_with_historical_filters_to_requested_source():
    # Arrange
    historical = pd.DataFrame(
        [
            _row(year=2024, source="DoF P-3"),
            _row(year=2024, source="Census cc-est"),
        ]
    )
    new = pd.DataFrame([_row(year=2025)]).drop(columns=["Source"])

    # Act
    result = combine_source_with_historical(
        new,
        historical,
        "DoF P-3",
        "Year",
        _complete,
        _SCHEMA,
    )

    # Assert
    assert set(result["Source"]) == {"DoF P-3"}
    assert result["Year"].tolist() == [2024, 2025]


def test_combine_source_with_historical_does_not_modify_inputs():
    # Arrange
    historical = pd.DataFrame([_row(year=2024)])
    new = pd.DataFrame([_row(year=2025)]).drop(columns=["Source"])
    original_historical = historical.copy(deep=True)
    original_new = new.copy(deep=True)

    # Act
    combine_source_with_historical(
        new,
        historical,
        "DoF P-3",
        "Year",
        _complete,
        _SCHEMA,
    )

    # Assert
    pd.testing.assert_frame_equal(historical, original_historical)
    pd.testing.assert_frame_equal(new, original_new)


"""
========================================================================================================================
Change Detection
========================================================================================================================
"""


def test_detect_new_source_data_returns_true_for_new_year():
    # Arrange
    historical = pd.DataFrame([_row(year=2024)])
    new = pd.DataFrame([_row(year=2024), _row(year=2025)]).drop(
        columns=["Source"]
    )

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020, _SCHEMA) is True


def test_detect_new_source_data_returns_false_for_identical_rows():
    # Arrange
    historical = pd.DataFrame([_row(year=2024)])
    new = historical.drop(columns=["Source"]).copy()

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020, _SCHEMA) is False


def test_detect_new_source_data_ignores_changes_at_boundary_year():
    # Arrange
    historical = pd.DataFrame([_row(year=2020, population=100)])
    new = pd.DataFrame([_row(year=2020, population=999)]).drop(
        columns=["Source"]
    )

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020, _SCHEMA) is False


def test_detect_new_source_data_returns_true_for_additional_rows():
    # Arrange
    historical = pd.DataFrame([_row(year=2025, race="White")])
    new = pd.DataFrame(
        [
            _row(year=2025, race="White"),
            _row(year=2025, race="Black"),
        ]
    ).drop(columns=["Source"])

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020, _SCHEMA) is True


def test_detect_new_source_data_with_no_history_returns_true():
    # Arrange
    new = pd.DataFrame([_row(year=2025)]).drop(columns=["Source"])
    historical = pd.DataFrame(columns=CONTRACT_COLUMNS)

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020, _SCHEMA) is True


def test_detect_new_source_data_false_when_incoming_matches_enriched_history():
    # A1 core fix: history is fully enriched (base rows + derived Region/State +
    # "All Ages"/"Both Sexes"/"All" marginals) while incoming is base-only. Both
    # sides are reduced to base strata before comparison, so an unchanged source
    # correctly reports no new data instead of always True.
    # Arrange
    base = _row(year=2025)
    enriched_history = pd.DataFrame(
        [
            base,
            {**base, "Geographic Level": "Region", "Location": "Bay Area"},
            {**base, "Geographic Level": "State", "Location": "California"},
            {**base, "Age Group": "All Ages"},
            {**base, "Sex": "Both Sexes"},
            {**base, "Race/Ethnicity": "All"},
        ]
    )
    incoming = pd.DataFrame([base]).drop(columns=["Source"])

    # Act / Assert
    assert detect_new_source_data(incoming, enriched_history, "DoF P-3", 2020, _SCHEMA) is False


def test_combine_source_with_historical_reduces_retained_history_to_base():
    # A8: a retained year absent from the incoming release is reduced to base
    # strata before concatenation, so pre-computed Region/State/marginal rows can
    # never be re-fed into aggregation and double-counted.
    # Arrange
    retained_year = _row(year=2023)
    enriched_history = pd.DataFrame(
        [
            retained_year,
            {**retained_year, "Geographic Level": "Region", "Location": "Bay Area"},
            {**retained_year, "Age Group": "All Ages"},
        ]
    )
    new = pd.DataFrame([_row(year=2025)]).drop(columns=["Source"])

    # Act
    result = combine_source_with_historical(new, enriched_history, "DoF P-3", "Year", _complete, _SCHEMA)

    # Assert — only base rows carried forward (one 2023 base + one 2025 incoming).
    assert set(result["Geographic Level"]) == {"County"}
    assert "All Ages" not in set(result["Age Group"])
    assert sorted(result["Year"]) == [2023, 2025]


def test_load_historical_baseline_missing_returns_empty(tmp_path):
    # A5/B5: the immutable seed is optional; its absence cold-starts cleanly.
    result = load_historical_baseline(tmp_path / "no-seed.csv")
    assert result.empty


def test_combine_history_sources_cold_start_returns_empty_contract():
    # B5: no seed and no current output -> empty contract frame, so the pipeline
    # cold-starts on live data alone rather than crashing.
    result = combine_history_sources(
        pd.DataFrame(columns=CONTRACT_COLUMNS),
        pd.DataFrame(columns=CONTRACT_COLUMNS),
    )
    assert result.empty
    assert list(result.columns) == CONTRACT_COLUMNS


def test_combine_history_sources_prefers_current_over_seed():
    # A5: the seed supplies deep years; the current output wins on any overlap.
    # Arrange
    seed = pd.DataFrame([_row(year=2020, population=1), _row(year=2021, population=2)])
    current = pd.DataFrame([_row(year=2021, population=999)])

    # Act
    result = combine_history_sources(seed, current)

    # Assert — 2020 from seed survives; 2021 taken from current.
    by_year = result.set_index("Year")["Population"].to_dict()
    assert by_year == {2020: 1, 2021: 999}


"""
========================================================================================================================
Cross-Source Merge
========================================================================================================================
"""


def test_merge_dof_and_census_concatenates_sorts_and_coerces_year():
    # Arrange
    dof = pd.DataFrame(
        [_row(location="Yuba", year="2026", source="DoF P-3")]
    )
    census = pd.DataFrame(
        [_row(location="Alameda", year="2024", source="Census cc-est")]
    )

    # Act
    result = merge_dof_and_census(dof, census)

    # Assert
    assert result["Location"].tolist() == ["Alameda", "Yuba"]
    assert result["Year"].tolist() == [2024, 2026]
    assert pd.api.types.is_integer_dtype(result["Year"])


def test_merge_dof_and_census_accepts_empty_source_frame():
    # Arrange
    dof = pd.DataFrame([_row(source="DoF P-3")])
    census = pd.DataFrame(columns=CONTRACT_COLUMNS)

    # Act
    result = merge_dof_and_census(dof, census)

    # Assert
    pd.testing.assert_frame_equal(result.reset_index(drop=True), dof)


def test_merge_dof_and_census_does_not_modify_inputs():
    # Arrange
    dof = pd.DataFrame([_row(source="DoF P-3")])
    census = pd.DataFrame(
        [_row(location="California", source="Census cc-est")]
    )
    original_dof = dof.copy(deep=True)
    original_census = census.copy(deep=True)

    # Act
    merge_dof_and_census(dof, census)

    # Assert
    pd.testing.assert_frame_equal(dof, original_dof)
    pd.testing.assert_frame_equal(census, original_census)
