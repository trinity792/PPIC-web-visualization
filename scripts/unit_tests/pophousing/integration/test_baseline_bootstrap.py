"""
Bootstrap smoke test (B8): prove a machine with no history can stand up the
historical E-8 baseline and pass the real Phase 1 acceptance gate.

Unlike the orchestrator unit tests (which mock every phase), this exercise runs
the actual Phase 0 seed path against the real schema config and the real
historical-data validator, so a regression in the shared validation contract or
the seed logic surfaces here.
"""

import pandas as pd

from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.historical import build_baseline as bb
from scripts.pophousing.historical.baseline_metadata import check_baseline_freshness
from scripts.pophousing.validation.historical_data_validator import (
    validate_historical_housing_data,
)
from lib.pophousing_config import HISTORICAL_FILE_CONFIG


def _fixture_current_output():
    """A minimal but gate-valid current output spanning 1991-2025."""
    rows = []
    for year in range(1991, 2026):
        rows.append(
            {
                "Location": "California",
                "Geographic Level": "State",
                "Year": year,
                "Total Population": 39_000_000,
                "Total Housing Units": 14_000_000,
                "Single Family Units": 9_000_000,
            }
        )
    for year in (2000, 2020):
        rows.append(
            {
                "Location": "Alameda",
                "Geographic Level": "County",
                "Year": year,
                "Total Population": 1_600_000,
                "Total Housing Units": 600_000,
                "Single Family Units": 350_000,
            }
        )
        rows.append(
            {
                "Location": "Oakland",
                "Geographic Level": "City",
                "Year": year,
                "Total Population": 440_000,
                "Total Housing Units": 170_000,
                "Single Family Units": 90_000,
            }
        )
    return pd.DataFrame(rows)


def test_seed_baseline_from_clean_state_passes_real_gate(tmp_path, monkeypatch):
    # Arrange: a clean machine with only a prior current output, no baseline.
    current_path = tmp_path / "PopHousing_Current.csv"
    baseline_path = tmp_path / "PopHousing_Historical_E8.csv"
    metadata_path = tmp_path / "PopHousing_Historical_E8.meta.json"
    _fixture_current_output().to_csv(current_path, index=False)

    monkeypatch.setattr(
        bb,
        "get_paths",
        lambda: {
            "current_data_path": current_path,
            "historical_data_path": baseline_path,
            "historical_baseline_metadata_path": metadata_path,
            "download_directory": tmp_path / "downloads",
        },
    )

    # Act: run the real Phase 0 seed with the real schema + real validator.
    summary = bb.build_baseline(from_current=True)

    # Assert: baseline exists, is bounded at 2020, and clears the real gate.
    assert baseline_path.is_file()
    assert summary["year_range"] == (1991, 2020)

    is_valid, messages = validate_historical_housing_data(
        baseline_path, get_schema_config()["historical_validation"]
    )
    assert is_valid, messages

    is_current, message = check_baseline_freshness(
        baseline_path, metadata_path, HISTORICAL_FILE_CONFIG
    )
    assert is_current, message
