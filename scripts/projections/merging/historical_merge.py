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

# Source base geographies (no derived Region/State rollups).
_BASE_GEOGRAPHIC_LEVELS = ["County", "US State"]

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


def load_historical_baseline(historical_data_path):
    """Load the immutable deep-history seed, or an empty frame when it is absent. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py

    The seed is distinct from the live output (A5). It is optional: on a fresh
    checkout it is absent and the pipeline cold-starts on live data plus whatever
    current output exists (B5).
    """
    if not historical_data_path:
        return pd.DataFrame(columns=CONTRACT_COLUMNS)
    path = Path(historical_data_path)
    if not path.is_file():
        return pd.DataFrame(columns=CONTRACT_COLUMNS)
    return pd.read_csv(path)


def combine_history_sources(baseline_df, current_df):
    """Union the immutable deep-history seed with the current output, preferring current rows. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py"""
    frames = [frame for frame in (baseline_df, current_df) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame(columns=CONTRACT_COLUMNS)
    combined = pd.concat(frames, ignore_index=True)
    key_columns = [column for column in CONTRACT_COLUMNS if column != "Population" and column in combined.columns]
    if key_columns:
        # current_df is concatenated last, so keep="last" prefers the live output
        # while the seed still supplies any deep years the current file may lack.
        combined = combined.drop_duplicates(subset=key_columns, keep="last").reset_index(drop=True)
    return combined


def reduce_to_base_strata(df, schema_config):
    """Strip an enriched frame back to base (non-aggregate) strata. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py

    Saved/retained rows are fully enriched — they carry derived Region/State
    geographies and the "All Ages"/"Both Sexes"/"All"-race marginals. Feeding
    those into aggregation double-counts them (A8) and mismatches change detection
    against freshly-cleaned base rows (A1), so both paths first reduce to the same
    base-strata shape a fresh clean produces. Single owner of "what is a base row."
    """
    if df.empty:
        return df
    mask = (
        df["Age Group"].isin(schema_config["canonical_age_groups"])
        & df["Sex"].isin(schema_config["canonical_sexes"])
        & df["Race/Ethnicity"].isin(schema_config["canonical_race_groups"])
    )
    if "Geographic Level" in df.columns:
        mask &= df["Geographic Level"].isin(_BASE_GEOGRAPHIC_LEVELS)
    return df[mask].reset_index(drop=True)


"""
========================================================================================================================
Source Merging
========================================================================================================================
"""


def combine_source_with_historical(new_df, historical_df, source, year_column, completeness_validator, schema_config):
    """Atomically merge complete incoming source/year releases with historical rows. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py

    Retained historical years are reduced to base strata before concatenation
    (A8) so a partial-year release can never feed pre-computed Region/State or
    marginal rows back into aggregation and double-count them.
    """
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
    retained = reduce_to_base_strata(retained, schema_config)
    return pd.concat([retained, incoming], ignore_index=True)


def detect_new_source_data(new_df, historical_df, source, boundary_year, schema_config):
    """Determine whether the freshly cleaned source contains genuinely new data. Test file: scripts/unit_tests/projections/merging/test_historical_merge.py

    Both sides are reduced to base strata before comparison (A1): the incoming
    frame is base-only (County / US State, no marginals) while saved history is
    fully enriched, so comparing raw sets would always differ and make the flag
    meaningless. Reducing history to the same base shape makes the flag truthful.
    """
    incoming = reduce_to_base_strata(new_df.copy(), schema_config)
    incoming["Source"] = source
    if "Source" in historical_df.columns:
        history = historical_df[historical_df["Source"] == source]
    else:
        history = historical_df
    history = reduce_to_base_strata(history, schema_config)

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
