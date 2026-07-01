import pandas as pd
import pytest
from scripts.projections.cleaning.age_group_standardizer import (
    assign_age_group_from_single_year,
    get_age_bin_edges,
    get_canonical_age_groups,
    standardize_age_group_labels,
    validate_age_group_completeness,
)

EXPECTED_AGE_GROUPS = [
    "0-4",
    "5-9",
    "10-14",
    "15-19",
    "20-24",
    "25-29",
    "30-34",
    "35-39",
    "40-44",
    "45-49",
    "50-54",
    "55-59",
    "60-64",
    "65-69",
    "70-74",
    "75-79",
    "80-84",
    "85+",
]


def test_get_canonical_age_groups_returns_eighteen_ordered_labels():
    # Act
    groups = get_canonical_age_groups()

    # Assert
    assert groups == EXPECTED_AGE_GROUPS
    assert len(groups) == 18


def test_get_age_bin_edges_returns_eighteen_edges():
    # Act
    edges = get_age_bin_edges()

    # Assert
    assert edges == list(range(0, 90, 5))
    assert len(edges) == 18


def test_assign_age_group_from_single_year_maps_age_zero():
    # Arrange
    source = pd.DataFrame({"Age": [0]})

    # Act
    result = assign_age_group_from_single_year(source, "Age")

    # Assert
    assert result.loc[0, "Age Group"] == "0-4"
    assert result.loc[0, "Age"] == 0


def test_assign_age_group_from_single_year_maps_age_84():
    # Arrange
    source = pd.DataFrame({"Age": [84]})

    # Act
    result = assign_age_group_from_single_year(source, "Age")

    # Assert
    assert result.loc[0, "Age Group"] == "80-84"


def test_assign_age_group_from_single_year_maps_age_110():
    # Arrange
    source = pd.DataFrame({"Age": [110]})

    # Act
    result = assign_age_group_from_single_year(source, "Age")

    # Assert
    assert result.loc[0, "Age Group"] == "85+"


def test_standardize_age_group_labels_normalizes_common_variants():
    # Arrange
    source = pd.DataFrame(
        {"AGE_LABEL": ["Under 5", "5 to 9", "85 and over"]}
    )
    label_map = {
        "Under 5": "0-4",
        "5 to 9": "5-9",
        "85 and over": "85+",
    }

    # Act
    result = standardize_age_group_labels(source, "AGE_LABEL", label_map)

    # Assert
    assert result["Age Group"].tolist() == ["0-4", "5-9", "85+"]
    assert "AGE_LABEL" not in result.columns


def test_standardize_age_group_labels_reports_unmapped_labels():
    # Arrange
    source = pd.DataFrame({"AGE_LABEL": ["Under 5", "Unknown age"]})

    # Act / Assert
    with pytest.raises(ValueError, match="Unknown age"):
        standardize_age_group_labels(
            source,
            "AGE_LABEL",
            {"Under 5": "0-4"},
        )


def test_validate_age_group_completeness_accepts_canonical_labels():
    # Arrange
    source = pd.DataFrame({"Age Group": EXPECTED_AGE_GROUPS})

    # Act
    is_valid, messages = validate_age_group_completeness(source, "Age Group")

    # Assert
    assert is_valid is True
    assert messages == []


def test_validate_age_group_completeness_rejects_null_and_raw_values():
    # Arrange
    source = pd.DataFrame({"Age Group": ["0-4", None, 85, "Under 5"]})

    # Act
    is_valid, messages = validate_age_group_completeness(source, "Age Group")

    # Assert
    assert is_valid is False
    assert messages
    assert any("null" in message.lower() for message in messages)
    assert any(
        "raw" in message.lower() or "canonical" in message.lower()
        for message in messages
    )


def test_assign_age_group_from_single_year_maps_age_five():
    # Arrange
    source = pd.DataFrame({"Age": [5]})

    # Act
    result = assign_age_group_from_single_year(source, "Age")

    # Assert
    assert result.loc[0, "Age Group"] == "5-9"


def test_assign_age_group_from_single_year_maps_age_85():
    # Arrange
    source = pd.DataFrame({"Age": [85]})

    # Act
    result = assign_age_group_from_single_year(source, "Age")

    # Assert
    assert result.loc[0, "Age Group"] == "85+"


def test_assign_age_group_from_single_year_rejects_negative_age():
    # Arrange
    source = pd.DataFrame({"Age": [-1]})

    # Act / Assert
    with pytest.raises(ValueError, match=r"-1|0"):
        assign_age_group_from_single_year(source, "Age")


def test_assign_age_group_from_single_year_rejects_age_above_110():
    # Arrange
    source = pd.DataFrame({"Age": [111]})

    # Act / Assert
    with pytest.raises(ValueError, match=r"111|110"):
        assign_age_group_from_single_year(source, "Age")


def test_assign_age_group_from_single_year_does_not_modify_input():
    # Arrange
    source = pd.DataFrame({"Age": [0, 85]})
    original = source.copy(deep=True)

    # Act
    assign_age_group_from_single_year(source, "Age")

    # Assert
    pd.testing.assert_frame_equal(source, original)
