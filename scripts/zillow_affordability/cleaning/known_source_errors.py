"""
known_source_errors.py — blanks specific, hand-listed Zillow cells known to be wrong at the source.

Data sources:
    - scripts/zillow_affordability/config/schemas.py — `known_source_errors`, each an explicit list of places, months, scenarios, and columns

Outputs:
    - pandas.DataFrame — copy of the table with the listed cells set to NaN
    - list[dict] — one report per listed error: rows matched, cells blanked, raw total/mortgage ratio range

Usage:
    from scripts.zillow_affordability.cleaning.known_source_errors import blank_known_source_errors

Test Folders:
    - scripts/unit_tests/zillow_affordability/cleaning/
"""

"""
========================================================================================================================
Known Source Errors
========================================================================================================================
"""


def _ratio_range(rows):
    """Return (min, max) of raw Total / Mortgage payment for matched rows, or None when none have both."""
    both = rows[rows["Mortgage Payment"].gt(0) & rows["Total Monthly Payment"].notna()]
    if both.empty:
        return None
    ratio = both["Total Monthly Payment"] / both["Mortgage Payment"]
    return float(ratio.min()), float(ratio.max())


def blank_known_source_errors(df, known_errors):
    """
    Blank the exact cells each known error lists; never infer cells by rule.

    The listing is deliberate (owner decision 2026-11-18): only cells a person has confirmed as
    wrong are blanked. The report carries the raw total/mortgage ratio of the matched rows
    before blanking so a reviewer at each refresh can see whether Zillow has corrected them.

    Args:
        df: cleaned table
        known_errors: schema_config["known_source_errors"]

    Returns:
        (blanked copy, list of {id, rows_matched, cells_blanked, raw_total_to_mortgage_ratio})

    Test file:
        scripts/unit_tests/zillow_affordability/cleaning/test_known_source_errors.py
    """
    blanked = df.copy()
    report = []
    for error in known_errors:
        mask = blanked["Location"].isin(error["locations"]) & blanked["Date"].isin(error["months"]) & blanked["Housing Scenario"].isin(error["scenarios"])
        matched = blanked[mask]
        cells = int(matched[error["columns"]].notna().sum().sum())
        report.append(
            {
                "id": error["id"],
                "rows_matched": int(mask.sum()),
                "cells_blanked": cells,
                "raw_total_to_mortgage_ratio": _ratio_range(matched),
            }
        )
        blanked.loc[mask, error["columns"]] = float("nan")
    return blanked, report
