"""
income_measures.py — coerces the tier Units/RHNA/Percent measures and stamps snapshot provenance.

Data sources:
    - the canonical wide frame from column_normalization

Outputs:
    - pandas.DataFrame — the frame with typed measures and provenance columns

Usage:
    Called by the RHNA Progress cleaning phase; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/cleaning/
"""

import pandas as pd

# The dictionaries define these strings as the Percent placeholder when the RHNA
# denominator is 0; they must become null before the float cast (or "Infinity" parses
# to a real inf).
_PERCENT_SENTINELS = {"INFINITY", "INF", "#DIV/0!", "NAN", ""}

"""
========================================================================================================================
Measure Coercion
========================================================================================================================
"""


def _blank_sentinel(value):
    """Return pd.NA for a Percent sentinel/blank, else the value unchanged."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return pd.NA
    if str(value).strip().upper() in _PERCENT_SENTINELS:
        return pd.NA
    return value


def coerce_income_measures(df, schema_config):
    """
    Replace the 'Infinity' / '#DIV/0!' sentinels with null in the four % columns, cast Units/RHNA columns to Int64 and % columns to Float64. Never raises on a single bad cell (coerce + log).

    Test file: scripts/unit_tests/rhna_progress/cleaning/test_income_measures.py
    """
    result = df.copy()
    for columns in schema_config["income_tier_columns"].values():
        for count_column in (columns["units"], columns["rhna"]):
            if count_column in result.columns:
                result[count_column] = pd.to_numeric(result[count_column], errors="coerce").astype("Int64")
        percent_column = columns["percent"]
        if percent_column in result.columns:
            cleaned = result[percent_column].map(_blank_sentinel)
            result[percent_column] = pd.to_numeric(cleaned, errors="coerce").astype("Float64")
    return result


"""
========================================================================================================================
Provenance
========================================================================================================================
"""


def stamp_provenance(df, snapshot_date, source_last_updated):
    """Attach Snapshot Date (resource last_modified) and Source Last Updated (package metadata_modified) to every row of a cleaned cycle frame. Test file: scripts/unit_tests/rhna_progress/cleaning/test_income_measures.py"""
    result = df.copy()
    result["Snapshot Date"] = pd.Timestamp(snapshot_date)
    result["Source Last Updated"] = pd.Timestamp(source_last_updated)
    return result
