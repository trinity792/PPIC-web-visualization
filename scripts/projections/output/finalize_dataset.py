"""
finalize_dataset.py — assigns geographic levels, orders columns, and performs conditional archival.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — updated canonical dataset
    - data/archive/demographic-projections/{FILENAME}_{TIMESTAMP}.csv — archived prior output (when data changed)

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/output/
"""

from datetime import datetime
from pathlib import Path

import pandas as pd

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

    def classify(row):
        location = row["Location"]
        if row["Source"] == "Census cc-est" and location in us_states:
            return "US State"
        if location == "California":
            return "State"
        if location in counties:
            return "County"
        if location in regions:
            return "Region"
        return "Other"

    result = df.copy()
    result["Geographic Level"] = result.apply(classify, axis=1)
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


def archive_and_save(df, current_path, archive_directory):
    """Compare the new dataset against the existing file and save only when data changed. Test file: scripts/unit_tests/projections/output/test_finalize_dataset.py"""
    current_path = Path(current_path)
    archive_directory = Path(archive_directory)
    new_csv = df.to_csv(index=False)

    if current_path.is_file():
        existing_csv = current_path.read_text(encoding="utf-8")
        if existing_csv == new_csv:
            return None
        archive_directory.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%m-%d-%y")
        archive_path = archive_directory / f"{current_path.stem}_{timestamp}{current_path.suffix}"
        archive_path.write_text(existing_csv, encoding="utf-8")

    current_path.parent.mkdir(parents=True, exist_ok=True)
    current_path.write_text(new_csv, encoding="utf-8")
    return current_path
