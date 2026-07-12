import json

import pandas as pd
import pytest

from scripts.pophousing.historical import build_baseline as bb


def _current_output(years):
    return pd.DataFrame(
        {
            "Year": years,
            "Location": ["Alameda"] * len(years),
            "Geographic Level": ["County"] * len(years),
            "Total Population": [1_500_000] * len(years),
        }
    )


"""
========================================================================================================================
Config Mapping
========================================================================================================================
"""


def test_map_historical_file_configs_adds_path_label_and_recovery():
    # Arrange
    config = {
        "E-8_90-00.xlsx": {"clean_func": "clean_1990_2000", "year_start": 1990, "year_end": 2000},
        "E-8_10-20.xlsx": {"clean_func": "clean_2010_2020", "year_start": 2010, "year_end": 2019},
    }

    # Act
    mapped = bb.map_historical_file_configs(config, "/downloads")

    # Assert
    old, modern = mapped
    assert old["path"].endswith("E-8_90-00.xlsx")
    assert old["label"] == "E-8 1990-2000"
    assert "recover_counties" not in old
    assert modern["recover_counties"] is True


def test_map_historical_file_configs_preserves_explicit_label():
    # Arrange
    config = {"x.xlsx": {"clean_func": "clean_1990_2000", "year_start": 1990, "year_end": 2000, "label": "custom"}}

    # Act
    mapped = bb.map_historical_file_configs(config, "/downloads")

    # Assert
    assert mapped[0]["label"] == "custom"


"""
========================================================================================================================
Seeding
========================================================================================================================
"""


def test_seed_baseline_from_current_filters_to_max_year(tmp_path):
    # Arrange
    current_path = tmp_path / "current.csv"
    _current_output([2019, 2020, 2021, 2025]).to_csv(current_path, index=False)

    # Act
    seeded = bb.seed_baseline_from_current(current_path)

    # Assert
    assert sorted(seeded["Year"]) == [2019, 2020]


def test_seed_baseline_from_current_relabels_source_e8(tmp_path):
    # A current output still carrying the old constant Source must be normalized
    # to E-8 in the committed baseline artifact.
    current_path = tmp_path / "current.csv"
    frame = _current_output([2018, 2020])
    frame["Source"] = "DoF"
    frame.to_csv(current_path, index=False)

    seeded = bb.seed_baseline_from_current(current_path)

    assert set(seeded["Source"]) == {"E-8"}


def test_seed_baseline_drops_subtotal_labels(tmp_path):
    # Stale DoF subtotal labels must not be carried into the committed baseline.
    current_path = tmp_path / "current.csv"
    frame = _current_output([2000, 2005])
    junk = pd.DataFrame(
        {
            "Year": [2000, 2005],
            "Location": ["Incorporated", "Unincorporated"],
            "Geographic Level": ["City", "City"],
            "Total Population": [1, 1],
        }
    )
    pd.concat([frame, junk], ignore_index=True).to_csv(current_path, index=False)

    seeded = bb.seed_baseline_from_current(current_path)

    assert not seeded["Location"].isin(["Incorporated", "Unincorporated"]).any()
    assert len(seeded) == 2


def test_seed_baseline_from_current_missing_file_raises(tmp_path):
    # Act / Assert
    with pytest.raises(FileNotFoundError, match="current output not found"):
        bb.seed_baseline_from_current(tmp_path / "absent.csv")


def test_build_from_workbooks_missing_files_raises(tmp_path):
    # Arrange
    config = {"absent.xlsx": {"clean_func": "clean_1990_2000", "year_start": 1990, "year_end": 2000}}

    # Act / Assert
    with pytest.raises(FileNotFoundError, match="Missing E-8 workbook"):
        bb.build_baseline_from_workbooks(config, tmp_path)


"""
========================================================================================================================
Validated Write
========================================================================================================================
"""


def test_write_validated_baseline_writes_file_and_sidecar(tmp_path, monkeypatch):
    # Arrange
    monkeypatch.setattr(bb, "validate_historical_housing_data", lambda *a, **k: (True, []))
    baseline_path = tmp_path / "baseline.csv"
    metadata_path = tmp_path / "baseline.meta.json"

    # Act
    metadata = bb.write_validated_baseline(
        _current_output([1991, 2020]), baseline_path, metadata_path, "seed", {}
    )

    # Assert
    assert baseline_path.is_file()
    assert not (tmp_path / "baseline.csv.tmp").exists()
    assert json.loads(metadata_path.read_text())["method"] == "seed"
    assert metadata["max_year"] == 2020


def test_write_validated_baseline_refuses_invalid(tmp_path, monkeypatch):
    # Arrange
    monkeypatch.setattr(bb, "validate_historical_housing_data", lambda *a, **k: (False, ["bad"]))
    baseline_path = tmp_path / "baseline.csv"

    # Act / Assert
    with pytest.raises(ValueError, match="failed validation"):
        bb.write_validated_baseline(
            _current_output([1991]), baseline_path, tmp_path / "m.json", "seed", {}
        )
    assert not baseline_path.exists()
    assert not (tmp_path / "baseline.csv.tmp").exists()


"""
========================================================================================================================
Driver
========================================================================================================================
"""


def test_build_baseline_from_current_end_to_end(tmp_path, monkeypatch):
    # Arrange
    current_path = tmp_path / "current.csv"
    _current_output([2018, 2020, 2023]).to_csv(current_path, index=False)
    paths = {
        "current_data_path": current_path,
        "historical_data_path": tmp_path / "baseline.csv",
        "historical_baseline_metadata_path": tmp_path / "baseline.meta.json",
        "download_directory": tmp_path / "downloads",
    }
    monkeypatch.setattr(bb, "get_paths", lambda: paths)
    monkeypatch.setattr(
        bb,
        "get_schema_config",
        lambda: {
            "historical_validation": {},
            "summary_keep_values": ["County Total", "State Total"],
            "summary_patterns": [r"^Incorporated\b", r"^Unincorporated\b"],
        },
    )
    monkeypatch.setattr(bb, "validate_historical_housing_data", lambda *a, **k: (True, []))

    # Act
    summary = bb.build_baseline(from_current=True)

    # Assert
    assert summary["method"] == "seed"
    assert summary["year_range"] == (2018, 2020)
    assert paths["historical_data_path"].is_file()
