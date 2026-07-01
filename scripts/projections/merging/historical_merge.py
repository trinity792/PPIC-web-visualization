"""
historical_merge.py — combines cleaned sources with historical rows and detects new data.

Data sources:
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — saved canonical data
    - Cleaned DoF P-3 DataFrame from dof_p3_cleaner
    - Cleaned Census cc-est DataFrame from census_ccest_cleaner

Outputs:
    - pandas.DataFrame — merged dataset with both sources
    - bool flags — whether new data was detected for each source

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/merging/
"""

from pathlib import Path

import pandas as pd

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
    "Source",
]

"""
========================================================================================================================
Historical Data Access
========================================================================================================================
"""


def load_canonical_dataset(current_data_path):
    """Read the existing contract CSV, or return an empty contract-shaped DataFrame. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py"""
    path = Path(current_data_path)
    if not path.is_file():
        return pd.DataFrame(columns=CONTRACT_COLUMNS)
    return pd.read_csv(path)


"""
========================================================================================================================
Source Merging
========================================================================================================================
"""


def combine_source_with_historical(new_df, historical_df, source, year_column, completeness_validator):
    """Atomically merge complete incoming source/year releases with historical rows. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py"""
    incoming = new_df.copy()
    incoming["Source"] = source

    is_valid, messages = completeness_validator(incoming)
    if not is_valid:
        raise ValueError(
            f"Incoming {source} data failed completeness validation: {'; '.join(messages)}"
        )

    source_history = historical_df[historical_df["Source"] == source]
    incoming_years = set(incoming[year_column])
    retained = source_history[~source_history[year_column].isin(incoming_years)]
    return pd.concat([retained, incoming], ignore_index=True)


def detect_new_source_data(new_df, historical_df, source, boundary_year):
    """Determine whether the freshly cleaned source contains genuinely new data. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py"""
    incoming = new_df.copy()
    incoming["Source"] = source
    if "Source" in historical_df.columns:
        history = historical_df[historical_df["Source"] == source]
    else:
        history = historical_df

    return _recent_row_set(incoming, boundary_year) != _recent_row_set(history, boundary_year)


def _recent_row_set(df, boundary_year):
    """Return the set of contract-keyed rows with Year beyond the boundary year."""
    if df.empty or "Year" not in df.columns:
        return set()
    recent = df[df["Year"] > boundary_year]
    columns = [column for column in CONTRACT_COLUMNS if column in recent.columns]
    return set(recent[columns].itertuples(index=False, name=None))


def merge_dof_and_census(dof_df, census_df):
    """Concatenate the DoF and Census DataFrames, coerce Year to integer, and sort. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py"""
    frames = [frame for frame in (dof_df, census_df) if not frame.empty]
    if not frames:
        return pd.DataFrame(columns=CONTRACT_COLUMNS)

    combined = pd.concat(frames, ignore_index=True)
    combined["Year"] = pd.to_numeric(combined["Year"]).astype("int64")
    return combined.sort_values(
        ["Location", "Year", "Age Group", "Sex", "Race/Ethnicity"]
    ).reset_index(drop=True)
