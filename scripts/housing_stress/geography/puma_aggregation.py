"""
puma_aggregation.py — aggregates PUMA-level ACS estimates to CA counties and regions via crosswalk.

PUMAs do not nest within county lines, so county/region estimates produced here are
approximations (see the ACS Housing Stress refactor plan, Unique Challenges section). The
crosswalks live in data/data-raw/housing-stress/ and are loaded through config paths, not
hardcoded absolute paths.

Data sources:
    - data/data-raw/housing-stress/puma_counties_xwalk_2020.csv — PUMA code -> county name
    - data/data-raw/housing-stress/puma_regions_xwalk_2020.csv — PUMA code -> region id (1-9)

Outputs:
    - pandas.DataFrame — estimate columns summed to the target geography

Usage:
    Called by geographic_levels.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/geography/
"""

import warnings

import pandas as pd

# ACS PUMA geographies carry summary level 795, encoded as the first three digits
# of the GEO_ID (e.g. "795P200US0600101" in the 2024 vintage). Detecting on this
# structural summary-level prefix rather than the NAME text ("... PUMA ...") means a
# change to ACS label wording cannot silently drop every PUMA row, and the bare
# "795" sumlevel is stable across vintages whose middle segment ("P200US", etc.)
# differs. No other California summary level begins with 795.
_PUMA_GEO_ID_PREFIX = "795"


"""
========================================================================================================================
PUMA Identification
========================================================================================================================
"""


def extract_puma_id(df):
    """
    Filter to PUMA rows and parse the trailing 5-digit PUMA code from GEO_ID.

    GEO_ID may be either the index or a column. PUMA rows are identified by the structural
    GEO_ID summary-level prefix "795" (not the NAME text), so a label-wording change cannot
    silently drop them. Does not mutate the input.

    Raises:
        ValueError — if no PUMA rows are found (a signal that the prefix or upstream data
        changed), or if a PUMA row's GEO_ID does not end in 5 parseable digits.

    Test file: scripts/unit_tests/housing_stress/geography/test_puma_aggregation.py
    """
    geo_id_in_index = df.index.name == "GEO_ID"
    working = df.reset_index() if geo_id_in_index else df

    geo_id_text = working["GEO_ID"].astype(str)
    is_puma = geo_id_text.str.startswith(_PUMA_GEO_ID_PREFIX)
    result = working.loc[is_puma].copy()

    if result.empty:
        raise ValueError(
            f"No PUMA rows found by GEO_ID prefix '{_PUMA_GEO_ID_PREFIX}'; "
            "the ACS PUMA summary level or GEO_ID format may have changed."
        )

    try:
        result["PUMA_ID"] = result["GEO_ID"].astype(str).str[-5:].astype(int)
    except ValueError as error:
        raise ValueError(f"Malformed PUMA GEO_ID; cannot parse trailing 5 digits as an integer: {error}") from error

    if geo_id_in_index:
        result = result.set_index("GEO_ID")
    return result


"""
========================================================================================================================
Geographic Aggregation
========================================================================================================================
"""


def aggregate_pumas_to_geography(df, crosswalk_path, crosswalk_geo_column, estimate_columns, output_location_column):
    """
    Merge PUMA rows to a geography via crosswalk and sum estimate columns by that geography.

    Inner-joins on PUMA_ID so unmatched PUMAs drop (matching legacy behavior), renames the
    crosswalk geography column to output_location_column, and sums estimate_columns grouped
    by that geography. This is the approximate PUMA->county / PUMA->region step. Does not
    mutate the input.

    Returns:
        pandas.DataFrame — one row per target geography: [output_location_column] + estimate_columns.

    Raises:
        ValueError — if the crosswalk is missing the "pumace" or geography column (a clear,
        file-naming error instead of an opaque KeyError on a renamed header).

    Test file: scripts/unit_tests/housing_stress/geography/test_puma_aggregation.py
    """
    crosswalk = pd.read_csv(crosswalk_path)
    required_columns = ["pumace", crosswalk_geo_column]
    missing_columns = [column for column in required_columns if column not in crosswalk.columns]
    if missing_columns:
        raise ValueError(f"PUMA crosswalk {crosswalk_path} is missing columns {missing_columns}; found {list(crosswalk.columns)}.")

    crosswalk = crosswalk[required_columns]
    merged = df.merge(crosswalk, left_on="PUMA_ID", right_on="pumace", how="inner")
    matched = merged["PUMA_ID"].nunique()
    if matched < df["PUMA_ID"].nunique() / 2:
        warnings.warn(
            f"PUMA crosswalk {crosswalk_path} matched only {matched} of {df['PUMA_ID'].nunique()} PUMAs; "
            "the crosswalk may be stale for this ACS vintage.",
            stacklevel=2,
        )
    merged = merged.rename(columns={crosswalk_geo_column: output_location_column})
    return merged.groupby(output_location_column, as_index=False)[estimate_columns].sum()


def map_region_ids_to_names(df, region_column, region_id_to_name):
    """
    Replace numeric region ids (1-9) with canonical region names.

    Does not mutate the input; other columns are preserved.

    Raises:
        ValueError — if any region id has no name mapping (all unknown ids listed).

    Test file: scripts/unit_tests/housing_stress/geography/test_puma_aggregation.py
    """
    values = df[region_column]
    unknown = sorted(set(values[~values.isin(region_id_to_name)].tolist()))
    if unknown:
        raise ValueError(f"Unknown region ids: {unknown}")

    result = df.copy()
    result[region_column] = values.map(region_id_to_name)
    return result
