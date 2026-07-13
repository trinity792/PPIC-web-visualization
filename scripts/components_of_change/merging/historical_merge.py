"""
historical_merge.py — merges fresh Components source pulls with the saved canonical dataset.

Data sources:
    - data/data-cleaned/components-of-change/ComponentsOfChange_Current.csv — saved canonical dataset
    - pandas.DataFrame inputs — newly cleaned DoF and Census Components records

Outputs:
    - pandas.DataFrame — source-level and final merged Components datasets
    - bool — source change-detection flags

Usage:
    python scripts/components_of_change/merging/historical_merge.py

Test Folders:
    - scripts/unit_tests/components_of_change/merging/
"""

import warnings
from pathlib import Path

import pandas as pd

from scripts.components_of_change.calculations.demographic_rates import recalculate_population_change
from scripts.shared.validation.dataframe_validators import find_duplicate_rows, validate_required_columns

"""
========================================================================================================================
Historical Merge
========================================================================================================================
"""


def load_canonical_dataset(current_data_path):
    """Load the saved canonical Components dataset, or an empty frame on a cold start. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    path = Path(current_data_path)
    if not path.exists():
        # Cold start: no prior output yet. Proceed on live data alone rather than
        # crashing in Phase 1, and warn loudly that deep history is absent (guide A1).
        warnings.warn(
            f"Components canonical dataset not found at {path}; proceeding on live data only",
            stacklevel=2,
        )
        return pd.DataFrame()
    return pd.read_csv(path)


def load_historical_baseline(historical_data_path):
    """Load the immutable deep-history seed, or an empty frame when it is absent. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    if not historical_data_path:
        return pd.DataFrame()
    path = Path(historical_data_path)
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def combine_history_sources(baseline_df, current_df):
    """Union the immutable deep-history seed with the current output, preferring current rows. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    frames = [frame for frame in (baseline_df, current_df) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True)
    key_columns = [column for column in ["Location", "Year", "Source"] if column in combined.columns]
    if key_columns:
        # current_df is concatenated last, so keep="last" prefers the live output while
        # the seed still supplies any deep years the current file may have lost (A1/A7).
        combined = combined.drop_duplicates(subset=key_columns, keep="last").reset_index(drop=True)
    return combined


def _without_geographic_level(dataframe):
    if "Geographic Level" in dataframe.columns:
        return dataframe.drop(columns=["Geographic Level"])
    return dataframe.copy()


def _normalize_numeric_dtypes(dataframe):
    """Cast fully numeric columns to numpy float64 so pd.NA and np.nan compare equal. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    normalized = dataframe.copy()
    for column in normalized.columns:
        coerced = pd.to_numeric(normalized[column], errors="coerce")
        if coerced.notna().sum() == normalized[column].notna().sum():
            normalized[column] = coerced.astype("float64")
    return normalized


def combine_source_with_historical(new_df, historical_df, source, year_col):
    """Combine one source's new rows with saved years absent from the new pull. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    source_history = _without_geographic_level(historical_df)
    if "Source" in source_history.columns:
        source_history = source_history.loc[source_history["Source"].eq(source)].copy()
        # Heal a pre-existing duplicate (Location, Year) in the saved CSV, keeping the
        # most recent, so one bad legacy row cannot permanently wedge the merge's
        # uniqueness guard on every subsequent run (guide B8).
        source_history = source_history.drop_duplicates(subset=["Location", year_col], keep="last")
        old_data = source_history.loc[~source_history[year_col].isin(new_df[year_col])].copy()
    else:
        old_data = pd.DataFrame()
    if old_data.empty:
        combined = new_df.copy()
    else:
        combined = pd.concat([old_data, new_df], ignore_index=True)
    combined = combined.sort_values(["Location", year_col], kind="stable").reset_index(drop=True)
    combined = recalculate_population_change(combined, "Location", "Total Population")
    combined["Source"] = source
    return combined


def detect_new_source_data(new_df, historical_df, source, boundary_year):
    """Return whether a source differs from saved data after excluding the boundary year. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    new_source = _without_geographic_level(new_df)
    new_source = new_source.loc[new_source["Year"].ne(boundary_year)].copy()
    historical_source = _without_geographic_level(historical_df)
    historical_source = historical_source.loc[historical_source["Source"].eq(source) & historical_source["Year"].ne(boundary_year)].copy()
    if set(new_source.columns) != set(historical_source.columns):
        return True
    historical_source = historical_source.loc[:, new_source.columns]
    sort_columns = [column for column in ["Location", "Year", "Source"] if column in new_source.columns]
    if sort_columns:
        new_source = new_source.sort_values(sort_columns, kind="stable")
        historical_source = historical_source.sort_values(sort_columns, kind="stable")
    # Freshly cleaned data uses nullable Float64 (missing = pd.NA); the reloaded
    # canonical CSV uses numpy float64 (missing = np.nan). assert_frame_equal treats
    # pd.NA and np.nan as different, so normalize both to numpy floats before comparing
    # to avoid reporting a change on every run.
    new_source = _normalize_numeric_dtypes(new_source.reset_index(drop=True))
    historical_source = _normalize_numeric_dtypes(historical_source.reset_index(drop=True))
    try:
        pd.testing.assert_frame_equal(new_source, historical_source, check_dtype=False)
        return False
    except AssertionError:
        return True


def merge_dof_and_census(dof_df, census_df):
    """Concatenate source datasets and validate duplicate source-location-year keys. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    merged = pd.concat([census_df, dof_df], ignore_index=True)
    merged["Year"] = pd.to_numeric(merged["Year"], errors="raise").astype(int)
    missing_columns = validate_required_columns(merged, ["Location", "Year", "Source"])
    if missing_columns:
        raise ValueError(f"missing required columns: {', '.join(missing_columns)}")
    duplicate_rows = find_duplicate_rows(merged, ["Location", "Year", "Source"])
    if not duplicate_rows.empty:
        raise ValueError(f"Found {len(duplicate_rows)} duplicate Components rows")
    return merged
