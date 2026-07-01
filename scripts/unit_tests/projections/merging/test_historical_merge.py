import pandas as pd
from scripts.projections.merging.historical_merge import (
    combine_source_with_historical,
    detect_new_source_data,
    load_canonical_dataset,
    merge_dof_and_census,
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
    )

    # Assert
    assert len(result) == 1
    assert result.loc[0, "Population"] == 125


def test_combine_source_with_historical_replaces_entire_overlapping_year():
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

    # Act
    result = combine_source_with_historical(
        new,
        historical,
        "DoF P-3",
        "Year",
    )

    # Assert
    assert len(result) == 1
    assert result["Race/Ethnicity"].tolist() == ["White"]
    assert result["Population"].tolist() == [125]


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
    combine_source_with_historical(new, historical, "DoF P-3", "Year")

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
    assert detect_new_source_data(new, historical, "DoF P-3", 2020) is True


def test_detect_new_source_data_returns_false_for_identical_rows():
    # Arrange
    historical = pd.DataFrame([_row(year=2024)])
    new = historical.drop(columns=["Source"]).copy()

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020) is False


def test_detect_new_source_data_ignores_changes_at_boundary_year():
    # Arrange
    historical = pd.DataFrame([_row(year=2020, population=100)])
    new = pd.DataFrame([_row(year=2020, population=999)]).drop(
        columns=["Source"]
    )

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020) is False


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
    assert detect_new_source_data(new, historical, "DoF P-3", 2020) is True


def test_detect_new_source_data_with_no_history_returns_true():
    # Arrange
    new = pd.DataFrame([_row(year=2025)]).drop(columns=["Source"])
    historical = pd.DataFrame(columns=CONTRACT_COLUMNS)

    # Act / Assert
    assert detect_new_source_data(new, historical, "DoF P-3", 2020) is True


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
