"""
finalize_dataset.py — assigns Components geography levels and writes the canonical dataset.

Data sources:
    - pandas.DataFrame — merged Components records
    - data/data-cleaned/components-of-change/ComponentsOfChange_Current.csv — prior canonical dataset when present

Outputs:
    - pandas.DataFrame — canonical output with Geographic Level first
    - {current_data_path}.csv — atomically written current Components dataset
    - data/archive/components-of-change/{FILENAME}.csv — archived prior current dataset when present

Usage:
    python scripts/components_of_change/output/finalize_dataset.py

Test Folders:
    - scripts/unit_tests/components_of_change/output/
"""

from pathlib import Path

import pandas as pd

from scripts.shared.archives.file_retention import archive_or_delete_files

"""
========================================================================================================================
Output Finalization
========================================================================================================================
"""


def assign_geographic_level(dataframe, geography_config):
    """Assign State, Region, County, or Other from Components geography config. Test file: scripts/unit_tests/components_of_change/output/test_finalize_dataset.py"""
    if "Location" not in dataframe.columns:
        raise KeyError("missing column: Location")
    result = dataframe.copy()
    result["Geographic Level"] = "Other"
    result.loc[result["Location"].isin(geography_config["state_abbreviations"]), "Geographic Level"] = "State"
    result.loc[result["Location"].isin(geography_config["region_names"]), "Geographic Level"] = "Region"
    result.loc[result["Location"].isin(geography_config["county_names"]), "Geographic Level"] = "County"
    columns = ["Geographic Level", *[column for column in result.columns if column != "Geographic Level"]]
    return result.loc[:, columns]


def prepare_components_output(dataframe, output_columns, sort_columns=None):
    """Order and sort Components output columns. Test file: scripts/unit_tests/components_of_change/output/test_finalize_dataset.py"""
    missing_columns = [column for column in output_columns if column not in dataframe.columns]
    if missing_columns:
        raise ValueError(f"missing output columns: {', '.join(missing_columns)}")
    sort_columns = sort_columns or ["Geographic Level", "Location", "Source", "Year"]
    result = dataframe.copy()
    result["Year"] = pd.to_numeric(result["Year"], errors="raise").astype(int)
    return result.loc[:, output_columns].sort_values(sort_columns, kind="stable").reset_index(drop=True)


def write_components_output(dataframe, output_path):
    """Atomically write Components records to CSV and return the output path. Test file: scripts/unit_tests/components_of_change/output/test_finalize_dataset.py"""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(f"{output_path.name}.tmp")
    try:
        dataframe.to_csv(temporary_path, index=False)
        temporary_path.replace(output_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    return output_path


def archive_and_save(dataframe, current_data_path, archive_directory):
    """Archive the prior canonical CSV when present, then write the new Components dataset. Test file: scripts/unit_tests/components_of_change/output/test_finalize_dataset.py"""
    current_data_path = Path(current_data_path)
    if current_data_path.is_file():
        archive_or_delete_files([current_data_path], archive_directory)
    return write_components_output(dataframe, current_data_path)
