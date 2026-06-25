import pandas as pd
import pytest

from scripts.pophousing.historical.boundary_year_resolution import (
    resolve_boundary_year_overlaps,
)


def _overlap_frame():
    return pd.DataFrame(
        {
            "Location": ["Alameda", "Alameda", "Oakland"],
            "Geographic Level": ["County", "County", "City"],
            "Year": [2000, 2000, 2000],
            "Total Population": [1_200_000, 1_300_000, 370_000],
            "Dataset Source": ["1990-2000", "2000-2010", "1990-2000"],
        }
    )


def test_resolve_boundary_year_overlaps_prefers_priority_source():
    # Act: the 2000-2010 workbook wins the 2000 boundary.
    result = resolve_boundary_year_overlaps(
        _overlap_frame(), ["2000-2010", "1990-2000"]
    )

    # Assert
    alameda = result.loc[result["Location"] == "Alameda"]
    assert len(alameda) == 1
    assert alameda.iloc[0]["Total Population"] == 1_300_000


def test_resolve_boundary_year_overlaps_keeps_unique_rows():
    # Act
    result = resolve_boundary_year_overlaps(
        _overlap_frame(), ["2000-2010", "1990-2000"]
    )

    # Assert: the non-duplicated Oakland row survives.
    assert (result["Location"] == "Oakland").sum() == 1


def test_resolve_boundary_year_overlaps_unknown_source_raises():
    # Act / Assert
    with pytest.raises(ValueError, match="does not include sources: 1990-2000"):
        resolve_boundary_year_overlaps(_overlap_frame(), ["2000-2010"])


def test_resolve_boundary_year_overlaps_duplicate_priority_raises():
    # Act / Assert
    with pytest.raises(ValueError, match="contains duplicates"):
        resolve_boundary_year_overlaps(_overlap_frame(), ["2000-2010", "2000-2010"])


def test_resolve_boundary_year_overlaps_missing_columns_raises():
    # Arrange
    dataframe = pd.DataFrame({"Location": ["Alameda"], "Year": [2000]})

    # Act / Assert
    with pytest.raises(KeyError, match="missing columns"):
        resolve_boundary_year_overlaps(dataframe, ["1990-2000"])
