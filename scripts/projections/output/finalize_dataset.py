"""
finalize_dataset.py — assigns geographic levels, orders columns, and performs conditional archival.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — updated canonical dataset
    - data/archive/demographic-projections/projections_DemographicProjections_{YYYY-MM-DD}.csv — archived prior output (when data changed)

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/output/
"""

import pandas as pd

from scripts.shared.archives.dataset_archive import archive_and_save  # noqa: F401 - re-exported for callers

_SORT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Source",
]

"""
========================================================================================================================
Geographic Level Assignment
========================================================================================================================
"""


def assign_geographic_level(df, geography_config):
    """Tag each row with its Geographic Level based on Location and Source. Test file: scripts/unit_tests/projections/output/test_finalize_dataset.py"""
    counties = set(geography_config["california_counties"])
    regions = set(geography_config["region_names"])
    us_states = set(geography_config["us_state_names"])

    result = df.copy()
    location = result["Location"]

    # Vectorized equivalent of the priority ladder
    # (US State > State > County > Region > Other): start at the lowest priority
    # and overwrite upward so the highest-priority match wins.
    level = pd.Series("Other", index=result.index)
    level = level.mask(location.isin(regions), "Region")
    level = level.mask(location.isin(counties), "County")
    level = level.mask(location == "California", "State")
    level = level.mask((result["Source"] == "Census cc-est") & location.isin(us_states), "US State")

    result["Geographic Level"] = level
    return result


"""
========================================================================================================================
Output Preparation
========================================================================================================================
"""


def prepare_projections_output(df, schema_config):
    """Enforce contract column order, sort rows, and cast types for the final CSV. Test file: scripts/unit_tests/projections/output/test_finalize_dataset.py"""
    output_columns = schema_config["output_columns"]
    missing = [column for column in output_columns if column not in df.columns]
    if missing:
        raise ValueError(f"Missing contract column(s): {', '.join(missing)}")

    result = df.copy()
    result["Year"] = pd.to_numeric(result["Year"]).astype("int64")
    sort_columns = [column for column in _SORT_COLUMNS if column in result.columns]
    result = result.sort_values(sort_columns).reset_index(drop=True)
    return result[output_columns]


# archive_and_save is the shared helper (scripts.shared.archives.dataset_archive), imported
# above rather than reimplemented here — see docs/PPIC Summer 2026/refractor-guide/
# shared-archive-and-save-plan.md, Workstream B. This was the module the 189MB-to-2MB
# streamed-hash optimization was written for; it is now shared behavior, not local to
# this module.
