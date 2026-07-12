import json

import pandas as pd

from scripts.pophousing.historical.baseline_metadata import (
    check_baseline_freshness,
    read_baseline_metadata,
    summarize_baseline_coverage,
    write_baseline_metadata,
)


def _baseline_frame(years):
    return pd.DataFrame({"Year": years, "Location": ["X"] * len(years)})


def test_summarize_baseline_coverage_reports_span_and_count():
    # Act
    summary = summarize_baseline_coverage(_baseline_frame([1991, 2000, 2020]))

    # Assert
    assert summary == {"min_year": 1991, "max_year": 2020, "row_count": 3}


def test_summarize_baseline_coverage_handles_empty():
    # Act
    summary = summarize_baseline_coverage(_baseline_frame([]))

    # Assert
    assert summary == {"min_year": None, "max_year": None, "row_count": 0}


def test_write_and_read_metadata_roundtrip(tmp_path):
    # Arrange
    metadata_path = tmp_path / "baseline.meta.json"

    # Act
    written = write_baseline_metadata(metadata_path, _baseline_frame([1991, 2020]), "seed")
    read_back = read_baseline_metadata(metadata_path)

    # Assert
    assert written["max_year"] == 2020 and written["method"] == "seed"
    assert "built_at" in written
    assert read_back == written


def test_read_metadata_missing_returns_empty(tmp_path):
    # Act / Assert
    assert read_baseline_metadata(tmp_path / "absent.json") == {}


def test_read_metadata_corrupt_returns_empty(tmp_path):
    # Arrange
    metadata_path = tmp_path / "baseline.meta.json"
    metadata_path.write_text("{ not json")

    # Act / Assert
    assert read_baseline_metadata(metadata_path) == {}


def test_freshness_current_when_baseline_meets_configured_coverage(tmp_path):
    # Arrange: baseline covers through 2020, config only requires 2019.
    metadata_path = tmp_path / "baseline.meta.json"
    write_baseline_metadata(metadata_path, _baseline_frame([2020]), "seed")
    config = {"E-8_2010_2020": {"year_start": 2010, "year_end": 2019}}

    # Act
    is_current, message = check_baseline_freshness(tmp_path / "baseline.csv", metadata_path, config)

    # Assert
    assert is_current is True and message is None


def test_freshness_stale_when_new_era_configured(tmp_path):
    # Arrange: config wired for a 2020-2030 era the committed baseline predates.
    metadata_path = tmp_path / "baseline.meta.json"
    write_baseline_metadata(metadata_path, _baseline_frame([2020]), "seed")
    config = {"E-8_2020_2030": {"year_start": 2020, "year_end": 2029}}

    # Act
    is_current, message = check_baseline_freshness(tmp_path / "baseline.csv", metadata_path, config)

    # Assert
    assert is_current is False
    assert "2029" in message and "2020" in message


def test_freshness_reads_csv_when_sidecar_absent(tmp_path):
    # Arrange: no sidecar; freshness must fall back to the CSV's Year column.
    baseline_path = tmp_path / "baseline.csv"
    _baseline_frame([1991, 2020]).to_csv(baseline_path, index=False)
    config = {"E-8_2020_2030": {"year_start": 2020, "year_end": 2029}}

    # Act
    is_current, _ = check_baseline_freshness(baseline_path, tmp_path / "absent.json", config)

    # Assert
    assert is_current is False


def test_freshness_current_when_config_has_no_year_bounds(tmp_path):
    # Act / Assert: nothing to compare against -> treat as current.
    is_current, message = check_baseline_freshness(tmp_path / "baseline.csv", tmp_path / "m.json", {})
    assert is_current is True and message is None
