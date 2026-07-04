"""
state_permits_cleaner.py — cleans one raw state monthly spreadsheet into tidy 50-state rows.

Data sources:
    - Raw state frame from census_bps_downloader.download_state_month
    - Schema config — state name list, measure columns

Outputs:
    - pandas.DataFrame — one row per state with Location, Date, and 5 measures

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/cleaning/
"""

import pandas as pd  # noqa: F401  (kept for parity with the module's documented I/O)


def clean_state_permits(df, year, month, schema_config):
    """
    Clean one raw state spreadsheet into tidy 50-state permit rows.

    Drops all-NaN rows, selects and renames the 6 relevant columns, filters to the 50
    configured state names, casts the 5 measures to int, and stamps Date = "YYYY-MM".

    Test file: scripts/unit_tests/building_permits/cleaning/test_state_permits_cleaner.py
    """
    measure_columns = schema_config["measure_columns"]

    work = df.copy().dropna(how="all")

    expected_column_count = 1 + len(measure_columns)
    if work.shape[1] < expected_column_count:
        raise ValueError(f"State spreadsheet has {work.shape[1]} columns; expected at least {expected_column_count}.")

    work = work.iloc[:, :expected_column_count].copy()
    work.columns = ["Location", *measure_columns]

    work["Location"] = work["Location"].astype(str).str.strip()
    work = work[work["Location"].isin(schema_config["state_names"])].copy()

    for column in measure_columns:
        work[column] = work[column].astype(int)

    work["Date"] = f"{year}-{month:02d}"

    return work[["Location", "Date", *measure_columns]].reset_index(drop=True)
