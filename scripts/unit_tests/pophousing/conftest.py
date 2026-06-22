import pandas as pd
import pytest


@pytest.fixture
def historical_validation_config():
    return {
        "required_columns": [
            "Location",
            "Geographic Level",
            "Year",
            "Total Population",
            "Total Housing Units",
            "Single Family Units",
        ],
        "expected_years": [1991, 2005, 2020],
        "expected_levels": ["State", "County", "City"],
        "minimum_state_records": 3,
        "minimum_population_year": 2020,
        "minimum_state_population": 30_000_000,
        "maximum_state_population": 50_000_000,
        "maximum_null_count": 0,
        "duplicate_key_columns": ["Location", "Geographic Level", "Year"],
    }


@pytest.fixture
def valid_historical_dataframe():
    rows = []
    for year, state_population in ((1991, 30_000_000), (2005, 35_000_000), (2020, 39_000_000)):
        rows.extend(
            [
                ["California", "State", year, state_population, 12_000_000, 8_000_000],
                ["Alameda", "County", year, 1_500_000, 600_000, 400_000],
                ["Oakland", "City", year, 400_000, 170_000, 100_000],
            ]
        )
    return pd.DataFrame(
        rows,
        columns=[
            "Location",
            "Geographic Level",
            "Year",
            "Total Population",
            "Total Housing Units",
            "Single Family Units",
        ],
    )


@pytest.fixture
def valid_historical_csv(tmp_path, valid_historical_dataframe):
    file_path = tmp_path / "PopHousing_Historical.csv"
    valid_historical_dataframe.to_csv(file_path, index=False)
    return file_path
