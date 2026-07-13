import numpy as np
import pandas as pd

from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography
from scripts.components_of_change.validation.dataset_validator import validate_components_dataset

COLUMNS_CONFIG = get_columns_config()
GEOGRAPHY_CONFIG = get_components_geography()


def _valid_dataset():
    base = {column: 0 for column in COLUMNS_CONFIG["output_columns"]}
    rows = []
    for index, (location, year, source) in enumerate(
        [("Alameda", 2021, "DoF"), ("Alameda", 2021, "Census"), ("Yuba", 2021, "DoF")]
    ):
        row = dict(base)
        row.update({"Geographic Level": "County", "Location": location, "Year": year, "Source": source, "Total Population": 1_000 + index})
        rows.append(row)
    return pd.DataFrame(rows, columns=COLUMNS_CONFIG["output_columns"])


def test_validate_components_dataset_accepts_valid_dataset():
    # Act
    is_valid, messages, warnings = validate_components_dataset(_valid_dataset(), COLUMNS_CONFIG)

    # Assert
    assert is_valid is True
    assert messages == []
    assert warnings == []


def test_validate_components_dataset_reports_missing_columns():
    # Arrange
    dataframe = _valid_dataset().drop(columns=["Births", "Source"])

    # Act
    is_valid, messages, _warnings = validate_components_dataset(dataframe, COLUMNS_CONFIG)

    # Assert
    assert is_valid is False
    assert any("Missing required columns" in message for message in messages)


def test_validate_components_dataset_reports_empty_dataset():
    # Arrange
    empty = pd.DataFrame(columns=COLUMNS_CONFIG["output_columns"])

    # Act
    is_valid, messages, _warnings = validate_components_dataset(empty, COLUMNS_CONFIG)

    # Assert
    assert is_valid is False
    assert any("empty" in message for message in messages)


def test_validate_components_dataset_reports_duplicate_rows():
    # Arrange: two rows share Location/Year/Source.
    dataframe = _valid_dataset()
    duplicate = dataframe.iloc[[0]].copy()
    dataframe = pd.concat([dataframe, duplicate], ignore_index=True)

    # Act
    is_valid, messages, _warnings = validate_components_dataset(dataframe, COLUMNS_CONFIG)

    # Assert
    assert is_valid is False
    assert any("duplicate Components rows" in message for message in messages)


def test_validate_components_dataset_skips_duplicate_check_when_columns_missing():
    # Arrange: duplicate-key columns are absent, so only the column error is reported.
    dataframe = _valid_dataset().drop(columns=["Source"])

    # Act
    is_valid, messages, _warnings = validate_components_dataset(dataframe, COLUMNS_CONFIG)

    # Assert
    assert is_valid is False
    assert any("Missing required columns" in message for message in messages)
    assert not any("duplicate" in message for message in messages)


def test_validate_components_dataset_blocks_on_missing_source():
    # Arrange: only DoF rows present — a failed Census pull that "succeeded" via fallback.
    dataframe = _valid_dataset()
    dataframe["Source"] = "DoF"

    # Act
    is_valid, messages, _warnings = validate_components_dataset(dataframe, COLUMNS_CONFIG)

    # Assert
    assert is_valid is False
    assert any("Missing Census source rows" in message for message in messages)


def test_validate_components_dataset_blocks_on_missing_level_with_geography():
    # Arrange: County-only frame is missing State and Region levels.
    dataframe = _valid_dataset()

    # Act
    is_valid, messages, _warnings = validate_components_dataset(dataframe, COLUMNS_CONFIG, GEOGRAPHY_CONFIG)

    # Assert
    assert is_valid is False
    assert any("Missing State geographic level" in message for message in messages)


def test_validate_components_dataset_warns_but_does_not_block_on_negative_population():
    # Arrange: a negative population is a soft anomaly, not a save-blocker.
    dataframe = _valid_dataset()
    dataframe.loc[0, "Total Population"] = -5

    # Act
    is_valid, messages, warnings = validate_components_dataset(dataframe, COLUMNS_CONFIG)

    # Assert
    assert is_valid is True
    assert messages == []
    assert any("Total Population contains" in warning for warning in warnings)


def test_validate_components_dataset_warns_on_non_finite_rate():
    # Arrange
    dataframe = _valid_dataset()
    dataframe["Crude Birth Rate"] = dataframe["Crude Birth Rate"].astype(float)
    dataframe.loc[0, "Crude Birth Rate"] = np.inf

    # Act
    is_valid, messages, warnings = validate_components_dataset(dataframe, COLUMNS_CONFIG)

    # Assert
    assert is_valid is True
    assert any("Crude Birth Rate contains non-finite" in warning for warning in warnings)
