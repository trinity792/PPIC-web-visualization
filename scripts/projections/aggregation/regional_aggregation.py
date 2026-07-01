"""
regional_aggregation.py — builds the 9 CA region rows and the California state row by summing county-level population.

The P-3 source contains only county-level data (58 FIPS codes). Both the 9 CA region rows
and the California state total must be computed by summing county rows. Census CC-EST
state rows were already constructed from SUMLEV=050 county observations in the Census
cleaner, so this aggregation module applies only to DoF P-3 county rows.

Data sources:
    - Cleaned DataFrame from the merge phase
    - scripts/shared/geography/california_geography.py — county-to-region mapping

Outputs:
    - pandas.DataFrame — input rows plus newly computed region-level and state-level rows

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/aggregation/
"""

import pandas as pd

_COUNTY_LEVEL = "County"
_POPULATION_COLUMN = "Population"


def add_regional_data(df, regions_mapping, groupby_dimensions):
    """Compute region-level population by summing county rows within each of the 9 CA regions. Test file: scripts/unit_tests/projections/aggregation/test_regional_aggregation.py"""
    counties = df[df["Geographic Level"] == _COUNTY_LEVEL]

    region_frames = []
    for region_name, member_counties in regions_mapping.items():
        members = counties[counties["Location"].isin(member_counties)]
        if members.empty:
            continue
        aggregated = members.groupby(groupby_dimensions, as_index=False)[_POPULATION_COLUMN].sum()
        aggregated["Location"] = region_name
        aggregated["Geographic Level"] = "Region"
        region_frames.append(aggregated)

    if not region_frames:
        return df.copy()
    return pd.concat([df, *region_frames], ignore_index=True)


def add_state_total(df, county_names, groupby_dimensions, state_name="California"):
    """Compute the California state total by summing all matching county rows. Test file: scripts/unit_tests/projections/aggregation/test_regional_aggregation.py"""
    counties = df[(df["Geographic Level"] == _COUNTY_LEVEL) & (df["Location"].isin(county_names))]
    if counties.empty:
        return df.copy()

    candidates = counties.groupby(groupby_dimensions, as_index=False)[_POPULATION_COLUMN].sum()
    candidates["Location"] = state_name
    candidates["Geographic Level"] = "State"

    existing_state = df[(df["Location"] == state_name) & (df["Geographic Level"] == "State")]
    if not existing_state.empty:
        existing_keys = set(existing_state[groupby_dimensions].itertuples(index=False, name=None))
        keep = [
            key not in existing_keys
            for key in candidates[groupby_dimensions].itertuples(index=False, name=None)
        ]
        candidates = candidates[keep]

    if candidates.empty:
        return df.copy()
    return pd.concat([df, candidates], ignore_index=True)
