"""
build_baseline.py — Phase 0 builder for the immutable historical E-8 baseline.

The main Population & Housing pipeline reads a committed, read-only pre-2020
baseline (PopHousing_Historical_E8.csv) and never writes it (see refactor guide
A1/A2). This driver is the only writer of that file. It runs in two modes:

    --from-current   Seed the baseline once by copying the current pipeline
                     output's <= 2020 rows. Use this to migrate an existing
                     deployment onto the split-baseline layout. Requires no
                     E-8 workbooks and reproduces today's exact pre-2020 input.

    (default)        Rebuild the baseline from the DoF E-8 decade workbooks
                     already present in the download directory, mapping
                     HISTORICAL_FILE_CONFIG into the builder's expected shape.
                     Pass --download to fetch the workbooks from DoF first.

Every mode validates the result against the shared historical-validation gate
before writing, writes atomically, and refreshes the coverage sidecar.

Data sources:
    - data/data-cleaned/housing-population/PopHousing_Current.csv — seed source (--from-current)
    - data/data-raw/housing-population/E-8*.xlsx — DoF E-8 decade workbooks (rebuild)
    - lib/pophousing_config.py — HISTORICAL_FILE_CONFIG per-era cleaning settings

Outputs:
    - data/data-cleaned/housing-population/PopHousing_Historical_E8.csv — committed baseline
    - data/data-cleaned/housing-population/PopHousing_Historical_E8.meta.json — coverage sidecar

Usage:
    python -m scripts.pophousing.historical.build_baseline --from-current   # one-time seed
    python -m scripts.pophousing.historical.build_baseline                  # rebuild from local workbooks
    python -m scripts.pophousing.historical.build_baseline --download       # fetch E-8 workbooks, then rebuild

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

import sys
from pathlib import Path

import pandas as pd

from lib.pophousing_config import HISTORICAL_FILE_CONFIG
from scripts.pophousing.acquisition.dof_historical_downloader import (
    download_historical_e8_files,
)
from scripts.pophousing.config.paths import get_paths
from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.config.sources import get_source_settings
from scripts.pophousing.historical.baseline_metadata import write_baseline_metadata
from scripts.pophousing.historical.historical_pipeline import (
    build_historical_housing_dataset,
)
from scripts.pophousing.validation.historical_data_validator import (
    validate_historical_housing_data,
)
from scripts.shared.data_cleaning.row_filters import remove_summary_rows

# ── Constants ─────────────────────────────────────────────────────────────────

_BASELINE_MAX_YEAR = 2020
_HISTORICAL_SOURCE_NAME = "E-8"

"""
========================================================================================================================
Config Mapping
========================================================================================================================
"""


def map_historical_file_configs(historical_file_config, download_dir):
    """
    Map HISTORICAL_FILE_CONFIG into the shape build_historical_housing_dataset expects.

    The raw config is keyed by workbook filename and carries no ``path``,
    ``label``, or ``recover_counties`` — so it cannot be handed to the builder
    as-is. This joins each filename to its full path under ``download_dir``,
    derives an era ``label`` from the year bounds, and enables county recovery
    on the modern-layout (2010-2020) era.

    Args:
        historical_file_config: The HISTORICAL_FILE_CONFIG mapping (filename -> settings).
        download_dir: Directory holding the E-8 decade workbooks.

    Returns:
        A list of builder config dicts, one per era.

    Test file:
        scripts/unit_tests/pophousing/historical/test_build_baseline.py
    """
    download_dir = Path(download_dir)
    file_configs = []
    for filename, config in historical_file_config.items():
        entry = dict(config)
        entry["path"] = str(download_dir / filename)
        entry["label"] = config.get(
            "label", f"E-8 {config['year_start']}-{config['year_end']}"
        )
        # The 2010-2020 workbook mirrors the modern E-5 layout, so the era
        # cleaner drops its "County Total" rows; recovery restores them.
        if config.get("clean_func") == "clean_2010_2020":
            entry.setdefault("recover_counties", True)
        file_configs.append(entry)
    return file_configs


"""
========================================================================================================================
Baseline Construction
========================================================================================================================
"""


def seed_baseline_from_current(current_data_path, max_year=_BASELINE_MAX_YEAR):
    """Return the current pipeline output's <= max_year rows, labeled E-8, as the seed baseline. Test file: scripts/unit_tests/pophousing/historical/test_build_baseline.py"""
    current_data_path = Path(current_data_path)
    if not current_data_path.is_file():
        raise FileNotFoundError(
            f"Cannot seed the baseline: current output not found at {current_data_path}. "
            "Run the main pipeline once, or rebuild from E-8 workbooks instead."
        )
    current_df = pd.read_csv(current_data_path)
    numeric_years = pd.to_numeric(current_df["Year"], errors="coerce")
    seeded = current_df[numeric_years <= max_year].reset_index(drop=True)
    # Older outputs carry a few stale DoF subtotal labels ("Incorporated",
    # "Unincorporated", "Balance of ...") that are not places; drop them with the
    # same shared filter Phase 3 uses so the committed baseline stays clean.
    schema_config = get_schema_config()
    seeded = remove_summary_rows(
        seeded,
        "Location",
        schema_config["summary_keep_values"],
        schema_config["summary_patterns"],
    )
    # The committed file IS the E-8 baseline: normalize Source so the artifact is
    # self-describing and matches the rebuild path (which also writes "E-8"). This
    # also matches how load_historical_housing_data relabels the baseline on read.
    seeded["Source"] = _HISTORICAL_SOURCE_NAME
    return seeded


def build_baseline_from_workbooks(historical_file_config, download_dir):
    """Rebuild the baseline dataframe from the local E-8 decade workbooks. Test file: scripts/unit_tests/pophousing/historical/test_build_baseline.py"""
    file_configs = map_historical_file_configs(historical_file_config, download_dir)
    missing = [
        config["path"] for config in file_configs if not Path(config["path"]).is_file()
    ]
    if missing:
        raise FileNotFoundError(
            "Missing E-8 workbook(s) required to rebuild the baseline:\n  "
            + "\n  ".join(missing)
            + "\nPlace the DoF E-8 decade workbooks in the download directory with the "
            "filenames listed in HISTORICAL_FILE_CONFIG, or pass --download to fetch them."
        )
    return build_historical_housing_dataset(file_configs)


"""
========================================================================================================================
Validated Atomic Write
========================================================================================================================
"""


def write_validated_baseline(baseline_df, baseline_path, metadata_path, method, validation_config):
    """
    Validate the baseline against the shared gate, then write it and its sidecar atomically.

    Args:
        baseline_df: The finalized historical baseline frame.
        baseline_path: Destination path for the committed baseline CSV.
        metadata_path: Destination path for the coverage sidecar JSON.
        method: Provenance tag recorded in the sidecar ("seed" or "rebuild").
        validation_config: The historical-validation config (schema_config["historical_validation"]).

    Returns:
        The sidecar metadata dict that was written.

    Raises:
        ValueError: When the baseline fails the historical-validation gate.

    Test file:
        scripts/unit_tests/pophousing/historical/test_build_baseline.py
    """
    baseline_path = Path(baseline_path)
    baseline_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = baseline_path.with_suffix(baseline_path.suffix + ".tmp")
    try:
        baseline_df.to_csv(temp_path, index=False)
        is_valid, messages = validate_historical_housing_data(temp_path, validation_config)
        if not is_valid:
            raise ValueError(
                "Historical baseline failed validation; refusing to write. "
                + "; ".join(messages)
            )
        temp_path.replace(baseline_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()
    return write_baseline_metadata(metadata_path, baseline_df, method)


"""
========================================================================================================================
Driver
========================================================================================================================
"""


def build_baseline(from_current=False, download=False):
    """Build (or seed) and write the historical E-8 baseline; return a summary dict. Test file: scripts/unit_tests/pophousing/historical/test_build_baseline.py"""
    paths = get_paths()
    schema_config = get_schema_config()
    validation_config = schema_config["historical_validation"]

    if from_current:
        baseline_df = seed_baseline_from_current(paths["current_data_path"])
        method = "seed"
    else:
        if download:
            download_historical_e8_files(
                paths["download_directory"], get_source_settings()
            )
        baseline_df = build_baseline_from_workbooks(
            HISTORICAL_FILE_CONFIG, paths["download_directory"]
        )
        method = "rebuild"

    metadata = write_validated_baseline(
        baseline_df,
        paths["historical_data_path"],
        paths["historical_baseline_metadata_path"],
        method,
        validation_config,
    )
    return {
        "output_path": paths["historical_data_path"],
        "method": method,
        "row_count": metadata["row_count"],
        "year_range": (metadata["min_year"], metadata["max_year"]),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Build or seed the immutable historical E-8 baseline (Phase 0)."
    )
    parser.add_argument(
        "--from-current",
        action="store_true",
        help="Seed the baseline from the current pipeline output's <= 2020 rows.",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Fetch the DoF E-8 workbooks before rebuilding (ignored with --from-current).",
    )
    args = parser.parse_args()

    try:
        summary = build_baseline(from_current=args.from_current, download=args.download)
    except (FileNotFoundError, ValueError) as error:
        print(f"  ✗ Baseline build failed: {error}")
        sys.exit(1)

    print(
        f"  ✓ {summary['method']} → {summary['output_path']} "
        f"({summary['row_count']} rows, years {summary['year_range'][0]}–{summary['year_range'][1]})"
    )
