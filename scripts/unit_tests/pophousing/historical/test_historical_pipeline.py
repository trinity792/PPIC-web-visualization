import pandas as pd
import pytest

from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.historical.historical_pipeline import (
    build_historical_housing_dataset,
)


def _old_format_county_frame(county, rows):
    """Build a single-county old-format frame: header row + County Total data rows."""
    data = [[county, None, None, None, None, None, None, None, None, None, None, None]]
    for year, population in rows:
        data.append(
            ["County Total", year, population, population - 50_000, 50_000, 500_000, 300_000, 180_000, 20_000, 470_000, 0.06, 2.6]
        )
    return pd.DataFrame(data)


@pytest.fixture
def overlapping_file_configs():
    frame_early = _old_format_county_frame("Alameda", [("1/1/1991", 1_100_000), ("1/1/2000", 1_200_000)])
    frame_late = _old_format_county_frame("Alameda", [("1/1/2000", 1_300_000), ("1/1/2009", 1_400_000)])
    return {
        "1990-2000": {
            "clean_func": "clean_1990_2000",
            "dataframe": frame_early,
            "year_start": 1990,
            "year_end": 2000,
        },
        "2000-2010": {
            "clean_func": "clean_2000_2010",
            "dataframe": frame_late,
            "year_start": 2000,
            "year_end": 2010,
        },
    }


def test_build_historical_housing_dataset_uses_output_schema(overlapping_file_configs):
    # Act
    result = build_historical_housing_dataset(overlapping_file_configs)

    # Assert
    assert result.columns.tolist() == get_schema_config()["output_columns"]
    assert set(result["Source"]) == {"E-8"}


def test_build_historical_housing_dataset_resolves_boundary_year(overlapping_file_configs):
    # Act: the 2000-2010 workbook wins the shared 2000 boundary year.
    result = build_historical_housing_dataset(overlapping_file_configs)

    # Assert
    alameda_2000 = result.loc[(result["Location"] == "Alameda") & (result["Year"] == 2000)]
    assert len(alameda_2000) == 1
    assert alameda_2000.iloc[0]["Total Population"] == 1_300_000


def test_build_historical_housing_dataset_is_sorted(overlapping_file_configs):
    # Act
    result = build_historical_housing_dataset(overlapping_file_configs)

    # Assert
    expected = result.sort_values(["Geographic Level", "Location", "Year"]).reset_index(drop=True)
    pd.testing.assert_frame_equal(result, expected)


def test_build_historical_housing_dataset_leaves_unavailable_columns_null(overlapping_file_configs):
    # Act
    result = build_historical_housing_dataset(overlapping_file_configs)

    # Assert: old-format rows lack the detailed unit breakdown.
    assert result["Single Family Detached Units"].isna().all()


def test_build_historical_housing_dataset_accepts_list_configs():
    # Arrange
    frame = _old_format_county_frame("Alameda", [("1/1/1995", 1_150_000)])
    configs = [
        {
            "label": "1990-2000",
            "clean_func": "clean_1990_2000",
            "dataframe": frame,
            "year_start": 1990,
            "year_end": 2000,
        }
    ]

    # Act
    result = build_historical_housing_dataset(configs)

    # Assert
    assert result.loc[result["Location"] == "Alameda", "Year"].tolist() == [1995]


def test_build_historical_housing_dataset_empty_configs_raises():
    # Act / Assert
    with pytest.raises(ValueError, match="No historical file configs"):
        build_historical_housing_dataset([])


def test_build_historical_housing_dataset_missing_keys_raises():
    # Act / Assert
    with pytest.raises(ValueError, match="missing keys"):
        build_historical_housing_dataset({"1990-2000": {"clean_func": "clean_1990_2000"}})


def test_build_historical_housing_dataset_unknown_clean_func_raises():
    # Arrange
    configs = {
        "bad": {
            "clean_func": "clean_2222_2333",
            "dataframe": pd.DataFrame({"a": [1]}),
            "year_start": 1990,
            "year_end": 2000,
        }
    }

    # Act / Assert
    with pytest.raises(ValueError, match="Unknown historical clean function"):
        build_historical_housing_dataset(configs)


def test_build_historical_housing_dataset_without_source_raises():
    # Arrange: neither an in-memory frame nor a workbook path is provided.
    configs = {
        "1990-2000": {
            "clean_func": "clean_1990_2000",
            "year_start": 1990,
            "year_end": 2000,
        }
    }

    # Act / Assert
    with pytest.raises(ValueError, match="neither 'dataframe' nor 'path'"):
        build_historical_housing_dataset(configs)
