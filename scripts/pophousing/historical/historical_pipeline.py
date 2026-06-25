"""
historical_pipeline.py — orchestrates cleaning, merging, and finalizing the historical E-8 dataset.

Data sources:
    - file_configs — per-era E-8 workbook paths/frames, sheet settings, year bounds, and cleaners
    - lib/pophousing_config.py — canonical Population & Housing output schema

Outputs:
    - pandas.DataFrame — combined canonical historical Population & Housing dataset

Usage:
    python scripts/pophousing/historical/historical_pipeline.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

from pathlib import Path

import pandas as pd

from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.historical.boundary_year_resolution import (
    resolve_boundary_year_overlaps,
)
from scripts.pophousing.historical.e8_era_cleaners import (
    clean_1990_2000,
    clean_2000_2010,
    clean_2010_2020,
)
from scripts.pophousing.historical.e8_standardization import standardize_e8_data
from scripts.pophousing.historical.missing_county_recovery import (
    extract_missing_county_rows,
    integrate_missing_county_rows,
)

"""
========================================================================================================================
Historical Pipeline
========================================================================================================================
"""

_SOURCE_COLUMN = "Dataset Source"
_HISTORICAL_SOURCE_NAME = "E-8"
_SORT_COLUMNS = ["Geographic Level", "Location", "Year"]
_CLEAN_FUNCTIONS = {
    "clean_1990_2000": clean_1990_2000,
    "clean_2000_2010": clean_2000_2010,
    "clean_2010_2020": clean_2010_2020,
}


def build_historical_housing_dataset(file_configs):
    """Clean, merge, and finalize all E-8 eras into one canonical dataset. Test file: scripts/unit_tests/pophousing/historical/test_historical_pipeline.py"""
    configs = _normalize_file_configs(file_configs)
    if not configs:
        raise ValueError("No historical file configs were provided")

    era_frames = []
    recovery_specs = []
    for config in configs:
        raw_e8_df = _load_raw_workbook(config)
        clean_func = _resolve_clean_func(config["clean_func"])
        cleaned_df = clean_func(raw_e8_df)
        standardized_df = standardize_e8_data(
            cleaned_df, config["year_start"], config["year_end"]
        )
        standardized_df[_SOURCE_COLUMN] = config["label"]
        era_frames.append(standardized_df)
        if config.get("recover_counties"):
            recovery_specs.append(
                (
                    raw_e8_df,
                    range(config["year_start"], config["year_end"] + 1),
                    config["label"],
                )
            )

    combined_df = pd.concat(era_frames, ignore_index=True, sort=False)

    # Boundary years (e.g. 2000, 2010) appear in adjacent workbooks; the more
    # recent workbook wins, so priority follows the latest year covered.
    source_priority = [
        config["label"]
        for config in sorted(configs, key=lambda config: config["year_end"], reverse=True)
    ]
    combined_df = resolve_boundary_year_overlaps(combined_df, source_priority)

    for raw_e8_df, target_years, label in recovery_specs:
        recovered_df = extract_missing_county_rows(raw_e8_df, target_years)
        if recovered_df.empty:
            continue
        recovered_df[_SOURCE_COLUMN] = label
        combined_df = integrate_missing_county_rows(combined_df, recovered_df)

    combined_df = resolve_boundary_year_overlaps(combined_df, source_priority)
    return _finalize_historical_dataset(combined_df)


"""
========================================================================================================================
Configuration & Loading Helpers
========================================================================================================================
"""


def _normalize_file_configs(file_configs):
    """Return file configs as a list of dicts each carrying a source label. Test file: scripts/unit_tests/pophousing/historical/test_historical_pipeline.py"""
    if isinstance(file_configs, dict):
        configs = [
            {"label": config.get("label", label), **config}
            for label, config in file_configs.items()
        ]
    else:
        configs = [dict(config) for config in file_configs]

    for config in configs:
        missing_keys = [
            key
            for key in ("label", "clean_func", "year_start", "year_end")
            if key not in config
        ]
        if missing_keys:
            raise ValueError(
                f"Historical file config missing keys: {', '.join(missing_keys)}"
            )
    return configs


def _resolve_clean_func(clean_func):
    """Resolve a callable or registered name to an era cleaner. Test file: scripts/unit_tests/pophousing/historical/test_historical_pipeline.py"""
    if callable(clean_func):
        return clean_func
    if clean_func in _CLEAN_FUNCTIONS:
        return _CLEAN_FUNCTIONS[clean_func]
    raise ValueError(f"Unknown historical clean function: {clean_func!r}")


def _load_raw_workbook(config):
    """Return a config's pre-read frame or read its workbook from disk. Test file: scripts/unit_tests/pophousing/historical/test_historical_pipeline.py"""
    if "dataframe" in config:
        return config["dataframe"]

    path = config.get("path")
    if path is None:
        raise ValueError(
            f"Historical file config {config['label']!r} has neither 'dataframe' nor 'path'"
        )
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Historical E-8 workbook not found: {path}")
    return pd.read_excel(
        path,
        sheet_name=config.get("sheet_name", 0),
        header=config.get("header", 0),
    )


def _finalize_historical_dataset(combined_df):
    """Apply the canonical schema, source label, and sort order. Test file: scripts/unit_tests/pophousing/historical/test_historical_pipeline.py"""
    output_columns = get_schema_config()["output_columns"]
    result = combined_df.copy()
    result["Source"] = _HISTORICAL_SOURCE_NAME
    for column in output_columns:
        if column not in result.columns:
            result[column] = pd.NA
    result = result.loc[:, output_columns]
    return result.sort_values(_SORT_COLUMNS, kind="stable").reset_index(drop=True)
