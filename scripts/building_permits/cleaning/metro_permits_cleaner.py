"""
metro_permits_cleaner.py — cleans one raw CBSA monthly spreadsheet into tidy CA-metro rows.

Data sources:
    - Raw CBSA frame from census_bps_downloader.download_cbsa_month
    - Schema config — CBSA-code renames, metro display renames, micro code, measure columns

Outputs:
    - pandas.DataFrame — one row per CA metropolitan CBSA with Location, Date, and 5 measures

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/cleaning/
"""

import pandas as pd

from scripts.building_permits.cleaning.measure_coercion import coerce_measures_to_int

# Named source columns the cleaner depends on, in addition to the measure columns.
_REQUIRED_SOURCE_COLUMNS = ["Name", "CBSA", "Metro /Micro Code"]
_CODE_COLUMNS = ["CBSA", "Metro /Micro Code"]


def _locate_header_row(df):
    """Return the index of the header row (the row carrying the 'Name' and 'CBSA' labels)."""
    for position in range(len(df)):
        values = set(df.iloc[position].tolist())
        if "Name" in values and "CBSA" in values:
            return position
    raise ValueError("Could not locate the CBSA header row (expected 'Name' and 'CBSA').")


def clean_metro_permits(df, year, month, schema_config):
    """
    Clean one raw CBSA spreadsheet into tidy California metropolitan permit rows.

    Reseats the header row, drops all-NaN rows/columns, splits the "Name" field into
    Location and State, keeps California metropolitan CBSAs (dropping micropolitan via
    the configured micro code), casts the 5 measures to int, applies the CBSA-code and
    display rename maps from config, and stamps Date = "YYYY-MM". Named-column selection
    raises if an expected column is absent, so a BPS layout change fails loudly.

    Test file: scripts/unit_tests/building_permits/cleaning/test_metro_permits_cleaner.py
    """
    measure_columns = schema_config["measure_columns"]

    work = df.copy()
    header_row = _locate_header_row(work)
    work.columns = work.iloc[header_row]
    work = work.iloc[header_row + 1:]
    work = work.dropna(axis=1, how="all").dropna(how="all").copy()

    # The BPS sheet repeats each measure name across a "Current Month" block and a
    # "Year to Date" block; keep only the first (current-month) occurrence so a
    # named selection is unambiguous.
    work = work.loc[:, ~work.columns.duplicated(keep="first")]

    required = [*_REQUIRED_SOURCE_COLUMNS, *measure_columns]
    missing = [column for column in required if column not in work.columns]
    if missing:
        raise ValueError(f"Missing expected column(s) in CBSA spreadsheet: {missing}")

    # Pin the code columns to a canonical nullable-integer dtype before they drive the
    # micropolitan filter and the code-based rename. xlrd commonly reads numeric .xls
    # cells as floats (41860.0, 5.0); without this coercion the int-keyed rename lookup
    # and the `!= 5` filter would silently no-op on a float cell, leaving an unrenamed
    # metro that then fails validate_metro_names (guide B2).
    for column in _CODE_COLUMNS:
        work[column] = pd.to_numeric(work[column], errors="coerce").astype("Int64")

    name = work["Name"].astype(str).str.strip()
    split = name.str.split(", ")
    work["Location"] = split.str[0]
    work["State"] = split.str[1]

    work = work[work["State"].str.contains("CA", na=False)]
    work = work[work["Metro /Micro Code"] != schema_config["micro_metro_code"]].copy()

    work["Date"] = f"{year}-{month:02d}"
    work = coerce_measures_to_int(work, measure_columns)

    cbsa_code_renames = schema_config["cbsa_code_renames"]
    code_renames = work["CBSA"].map(cbsa_code_renames)
    work["Location"] = code_renames.where(code_renames.notna(), work["Location"])
    work["Location"] = work["Location"].replace(schema_config["metro_display_renames"])

    return work[["Location", "Date", *measure_columns]].reset_index(drop=True)
