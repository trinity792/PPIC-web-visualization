"""
baseline_metadata.py — reads, writes, and freshness-checks the E-8 baseline sidecar.

The historical E-8 baseline is an immutable, committed artifact (see refactor
guide A1). This module records its coverage/provenance in a JSON sidecar and
provides a network-free freshness check the main pipeline runs each Phase 1: it
warns when the committed baseline covers fewer years than the currently
configured E-8 coverage (i.e. a new E-8 decade was added but the baseline was
never rebuilt).

Data sources:
    - {baseline_path}.csv — the committed historical E-8 baseline
    - {metadata_path}.json — sidecar recording max/min year, row count, provenance
    - HISTORICAL_FILE_CONFIG — configured per-era E-8 coverage (year bounds)

Outputs:
    - {metadata_path}.json — written whenever the baseline is (re)built or seeded
    - tuple — freshness flag and an actionable message when the baseline is stale

Usage:
    python scripts/pophousing/historical/baseline_metadata.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

"""
========================================================================================================================
Baseline Metadata Sidecar
========================================================================================================================
"""


def summarize_baseline_coverage(baseline_df, year_column="Year"):
    """Return the min year, max year, and row count of a baseline frame. Test file: scripts/unit_tests/pophousing/historical/test_baseline_metadata.py"""
    numeric_years = pd.to_numeric(baseline_df.get(year_column), errors="coerce").dropna()
    min_year = int(numeric_years.min()) if not numeric_years.empty else None
    max_year = int(numeric_years.max()) if not numeric_years.empty else None
    return {"min_year": min_year, "max_year": max_year, "row_count": int(len(baseline_df))}


def write_baseline_metadata(metadata_path, baseline_df, method, year_column="Year"):
    """Write the baseline coverage/provenance sidecar next to the baseline CSV. Test file: scripts/unit_tests/pophousing/historical/test_baseline_metadata.py"""
    metadata_path = Path(metadata_path)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata = summarize_baseline_coverage(baseline_df, year_column)
    metadata["method"] = method
    metadata["built_at"] = datetime.now(timezone.utc).isoformat()
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def read_baseline_metadata(metadata_path):
    """Return the parsed baseline sidecar, or an empty dict when absent/unreadable. Test file: scripts/unit_tests/pophousing/historical/test_baseline_metadata.py"""
    metadata_path = Path(metadata_path)
    if not metadata_path.is_file():
        return {}
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


"""
========================================================================================================================
Freshness Check
========================================================================================================================
"""


def _configured_max_e8_year(historical_file_config):
    """Return the newest year_end across the configured E-8 eras, or None. Test file: scripts/unit_tests/pophousing/historical/test_baseline_metadata.py"""
    year_ends = [
        config["year_end"]
        for config in historical_file_config.values()
        if isinstance(config, dict) and "year_end" in config
    ]
    return max(year_ends) if year_ends else None


def check_baseline_freshness(baseline_path, metadata_path, historical_file_config):
    """
    Warn (without a network call) when the committed baseline is behind configured E-8 coverage.

    The baseline's newest year is taken from its sidecar when present, otherwise
    read from the CSV. It is compared against the newest ``year_end`` in
    ``HISTORICAL_FILE_CONFIG``; a baseline older than the configured coverage
    means a new E-8 era was wired up but the baseline was never rebuilt.

    Args:
        baseline_path: Path to the committed historical E-8 baseline CSV.
        metadata_path: Path to the baseline sidecar JSON.
        historical_file_config: The HISTORICAL_FILE_CONFIG mapping.

    Returns:
        A ``(is_current, message)`` tuple. ``message`` is ``None`` when current.

    Test file:
        scripts/unit_tests/pophousing/historical/test_baseline_metadata.py
    """
    expected_max_year = _configured_max_e8_year(historical_file_config)
    if expected_max_year is None:
        return True, None

    baseline_max_year = read_baseline_metadata(metadata_path).get("max_year")
    if baseline_max_year is None:
        baseline_path = Path(baseline_path)
        if not baseline_path.is_file():
            return True, None
        try:
            baseline_df = pd.read_csv(baseline_path, usecols=["Year"])
        except (OSError, ValueError, pd.errors.ParserError):
            return True, None
        baseline_max_year = summarize_baseline_coverage(baseline_df)["max_year"]

    if baseline_max_year is None or baseline_max_year >= expected_max_year:
        return True, None
    return False, (
        f"Historical E-8 baseline covers through {baseline_max_year}, but configured E-8 "
        f"coverage extends to {expected_max_year}. Rebuild the baseline with the Phase 0 "
        "builder: python -m scripts.pophousing.historical.build_baseline"
    )
