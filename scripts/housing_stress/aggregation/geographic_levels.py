"""
geographic_levels.py — builds State, Region, and County frames and applies the shared cleaning transforms.

Replaces the three legacy closures (build_state_dataset / build_region_dataset /
build_county_dataset). Each builder maps estimate columns to its geography, then applies the
shared cost_burden_measures transform, reconciles race labels, and tags the geographic level.
All three share one code path except for the geography step.

Data sources:
    - Raw iteration frames from acquisition (one per race iteration)
    - puma_aggregation.py for county/region rollups
    - scripts/shared/geography/california_geography.py for canonical region names

Outputs:
    - pandas.DataFrame — long contract-shaped rows for one geographic level

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/aggregation/
"""

import pandas as pd

from scripts.housing_stress.cleaning.column_normalization import (
    drop_margin_of_error_columns,
    strip_table_prefix,
)
from scripts.housing_stress.cleaning.cost_burden_measures import compute_tenure_measures
from scripts.housing_stress.cleaning.race_ethnicity_mapping import reconcile_race_label
from scripts.housing_stress.geography.puma_aggregation import (
    aggregate_pumas_to_geography,
    extract_puma_id,
    map_region_ids_to_names,
)

# Contract grain used to sort the combined dataset (all rows share one vintage year).
_SORT_COLUMNS = ["Year", "Geographic Level", "Location", "Race/Ethnicity", "Tenure"]


"""
========================================================================================================================
Shared Helpers
========================================================================================================================
"""


def _contract_columns(schema_config):
    """Return the ordered contract columns produced by each builder."""
    return [
        schema_config["year_column"],
        schema_config["level_column"],
        schema_config["location_column"],
        schema_config["race_column"],
        schema_config["tenure_column"],
        *schema_config["measure_columns"],
    ]


def _measure_and_tag(located, raw_label, year, level, schema_config):
    """Attach the race label, compute tenure measures, and stamp year and geographic level."""
    race_column = schema_config["race_column"]
    located = located.copy()
    located[race_column] = raw_label
    located = reconcile_race_label(located, race_column, schema_config["race_reconciliation_map"])

    measured = compute_tenure_measures(located, [schema_config["location_column"], race_column], schema_config)
    measured[schema_config["year_column"]] = year
    measured[schema_config["level_column"]] = level
    return measured[_contract_columns(schema_config)]


def _prepared_estimates(raw_frame):
    """Strip the table prefix and drop margin-of-error columns from a raw iteration frame."""
    return drop_margin_of_error_columns(strip_table_prefix(raw_frame))


def _region_id_to_name(geography):
    """Build the 1-9 region-id to region-name map from the shared geography order."""
    return {index: name for index, name in enumerate(geography["regions_mapping"], start=1)}


"""
========================================================================================================================
Geographic Level Builders
========================================================================================================================
"""


def build_state_rows(iteration_frames, year, schema_config):
    """
    Build State-level contract rows for the 50 states from the raw iteration frames.

    Filters to the configured state abbreviations (excluding DC and PR), uses the USPS
    abbreviation as Location, computes tenure measures, reconciles race labels, and tags
    Geographic Level "State".

    Test file: scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """
    location_column = schema_config["location_column"]
    state_abbreviations = schema_config["state_abbreviations"]

    frames = []
    for raw_label, raw_frame in iteration_frames.items():
        prepared = _prepared_estimates(raw_frame)
        located = prepared[prepared["STUSAB"].isin(state_abbreviations)].copy()
        located[location_column] = located["STUSAB"]
        frames.append(_measure_and_tag(located, raw_label, year, "State", schema_config))

    return pd.concat(frames, ignore_index=True)


def build_region_rows(iteration_frames, year, paths, schema_config, geography):
    """
    Build Region-level contract rows for the 9 CA regions via PUMA aggregation.

    For each iteration: extract PUMA ids, aggregate to region id, map ids to names, compute
    tenure measures, reconcile race labels, and tag Geographic Level "Region".

    Test file: scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """
    location_column = schema_config["location_column"]
    estimate_columns = schema_config["estimate_columns"]
    region_id_to_name = _region_id_to_name(geography)

    frames = []
    for raw_label, raw_frame in iteration_frames.items():
        pumas = extract_puma_id(_prepared_estimates(raw_frame))
        aggregated = aggregate_pumas_to_geography(pumas, paths["region_crosswalk_path"], "region", estimate_columns, location_column)
        aggregated = map_region_ids_to_names(aggregated, location_column, region_id_to_name)
        frames.append(_measure_and_tag(aggregated, raw_label, year, "Region", schema_config))

    return pd.concat(frames, ignore_index=True)


def build_county_rows(iteration_frames, year, paths, schema_config, geography):
    """
    Build County-level contract rows for the CA counties via PUMA aggregation.

    Mirrors build_region_rows but crosswalks PUMA->county and tags Geographic Level "County".
    County estimates are approximate because PUMAs cross county lines.

    Test file: scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """
    location_column = schema_config["location_column"]
    estimate_columns = schema_config["estimate_columns"]

    frames = []
    for raw_label, raw_frame in iteration_frames.items():
        pumas = extract_puma_id(_prepared_estimates(raw_frame))
        aggregated = aggregate_pumas_to_geography(pumas, paths["county_crosswalk_path"], "cntynm", estimate_columns, location_column)
        frames.append(_measure_and_tag(aggregated, raw_label, year, "County", schema_config))

    return pd.concat(frames, ignore_index=True)


"""
========================================================================================================================
Combined Build
========================================================================================================================
"""


def build_all_levels(ca_frames, state_frames, year, paths, schema_config, geography):
    """
    Concatenate State, Region, and County rows into one sorted frame for the vintage.

    Test file: scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """
    state = build_state_rows(state_frames, year, schema_config)
    region = build_region_rows(ca_frames, year, paths, schema_config, geography)
    county = build_county_rows(ca_frames, year, paths, schema_config, geography)

    combined = pd.concat([state, region, county], ignore_index=True)
    return combined.sort_values(_SORT_COLUMNS, ignore_index=True)
