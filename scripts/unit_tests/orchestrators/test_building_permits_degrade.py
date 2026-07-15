"""
Regression test for the Building Permits clean-degrade property (guide B4).

When the live source fails outright, the run must finish on the existing history —
unchanged, no write, no crash — rather than emitting an empty or truncated dataset.
Unlike the heavily-mocked orchestrator test, this drives the *real* cleaning, merge,
validation, and output helpers end-to-end and only forces the live downloads to fail.
"""

from unittest.mock import Mock

import pandas as pd

from scripts.building_permits.config.schemas import get_schema_config
from scripts.orchestrators import building_permits_pipeline as pipeline
from scripts.shared.geography.california_geography import get_california_geography

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]


def _valid_dataset():
    """Build a minimal dataset that passes final validation: both levels, all 50 states
    each month, one canonical metro, and a contiguous two-month range."""
    schema = get_schema_config()
    geography = get_california_geography()
    states = schema["state_names"]
    metro = sorted(geography["cbsa_metros"])[0]
    rows = []
    for month in ("2010-01", "2010-02"):
        for state in states:
            rows.append({
                "Geographic Level": "State", "Location": state, "Date": month,
                "Total": 10, "1 Unit": 6, "2 Units": 1, "3 and 4 Units": 1, "5 Units or More": 2,
            })
        rows.append({
            "Geographic Level": "Metro", "Location": metro, "Date": month,
            "Total": 20, "1 Unit": 10, "2 Units": 2, "3 and 4 Units": 3, "5 Units or More": 5,
        })
    return pd.DataFrame(rows)[CONTRACT_COLUMNS]


def test_live_failure_degrades_to_unchanged_history(monkeypatch, tmp_path):
    dataset = _valid_dataset()
    current_path = tmp_path / "BuildingPermits_Current.csv"
    historical_path = tmp_path / "BuildingPermits_Historical.csv"
    dataset.to_csv(current_path, index=False)
    dataset.to_csv(historical_path, index=False)  # the immutable deep-history seed
    original_bytes = current_path.read_bytes()

    paths = {
        "current_data_path": current_path,
        "historical_data_path": historical_path,
        "archive_directory": tmp_path / "archive",
        "logs_directory": tmp_path / "logs",
    }
    monkeypatch.setattr(pipeline, "get_paths", Mock(return_value=paths))
    # The latest-month probe resolves to a month after the stored history (no prefetch),
    # so acquisition tries to download it — and the live download fails outright.
    monkeypatch.setattr(pipeline, "resolve_latest_month", Mock(return_value=(2010, 3, {})))
    monkeypatch.setattr(
        pipeline, "download_cbsa_month", Mock(side_effect=RuntimeError("network down"))
    )
    monkeypatch.setattr(
        pipeline, "download_state_month", Mock(side_effect=RuntimeError("network down"))
    )

    result = pipeline.build_building_permits_dataset()

    # Degraded, but finished on the existing history with no write and no crash.
    assert result["source_failed"] is True
    assert result["new_data"] is False
    assert result["output_path"] is None
    assert result["row_count"] == len(dataset)
    assert current_path.read_bytes() == original_bytes


def test_live_failure_recovers_deep_history_from_seed_when_current_lost(monkeypatch, tmp_path):
    # If Current.csv is lost, the committed seed alone must restore the deep history —
    # the whole point of the immutable-seed design (guide A1/A2).
    dataset = _valid_dataset()
    current_path = tmp_path / "BuildingPermits_Current.csv"  # intentionally absent
    historical_path = tmp_path / "BuildingPermits_Historical.csv"
    dataset.to_csv(historical_path, index=False)

    paths = {
        "current_data_path": current_path,
        "historical_data_path": historical_path,
        "archive_directory": tmp_path / "archive",
        "logs_directory": tmp_path / "logs",
    }
    monkeypatch.setattr(pipeline, "get_paths", Mock(return_value=paths))
    monkeypatch.setattr(pipeline, "resolve_latest_month", Mock(return_value=(2010, 3, {})))
    monkeypatch.setattr(
        pipeline, "download_cbsa_month", Mock(side_effect=RuntimeError("network down"))
    )
    monkeypatch.setattr(
        pipeline, "download_state_month", Mock(side_effect=RuntimeError("network down"))
    )

    result = pipeline.build_building_permits_dataset()

    # The seed's deep history is rebuilt and written out (Current.csv was missing).
    assert set(result["dataset"]["Date"]) == {"2010-01", "2010-02"}
    assert result["new_data"] is True
    assert current_path.is_file()
