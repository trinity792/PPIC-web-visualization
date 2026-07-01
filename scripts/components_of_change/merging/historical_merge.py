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

import pandas as pd

from scripts.components_of_change.calculations.demographic_rates import recalculate_population_change
from scripts.shared.validation.dataframe_validators import find_duplicate_rows, validate_required_columns

"""
========================================================================================================================
Historical Merge
========================================================================================================================
"""


def load_canonical_dataset(current_data_path):
    """Load the saved canonical Components dataset. Test file: scripts/unit_tests/components_of_change/merging/test_historical_merge.py"""
    return pd.read_csv(current_data_path)


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
    source_history = source_history.loc[source_history["Source"].eq(source)].copy()
    old_data = source_history.loc[~source_history[year_col].isin(new_df[year_col])].copy()
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
