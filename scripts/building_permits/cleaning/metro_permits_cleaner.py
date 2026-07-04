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


# Named source columns the cleaner depends on, in addition to the measure columns.
_REQUIRED_SOURCE_COLUMNS = ["Name", "CBSA", "Metro /Micro Code"]


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

    name = work["Name"].astype(str).str.strip()
    split = name.str.split(", ")
    work["Location"] = split.str[0]
    work["State"] = split.str[1]

    work = work[work["State"].str.contains("CA", na=False)]
    work = work[work["Metro /Micro Code"] != schema_config["micro_metro_code"]].copy()

    for column in measure_columns:
        work[column] = work[column].astype(int)

    cbsa_code_renames = schema_config["cbsa_code_renames"]
    work["Location"] = work.apply(
        lambda row: cbsa_code_renames.get(row["CBSA"], row["Location"]),
        axis=1,
    )
    work["Location"] = work["Location"].replace(schema_config["metro_display_renames"])

    work["Date"] = f"{year}-{month:02d}"

    return work[["Location", "Date", *measure_columns]].reset_index(drop=True)
