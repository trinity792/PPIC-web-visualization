"""
measure_coercion.py — coerces BPS structure-size measure columns to int with located errors.

Data sources:
    - pandas.DataFrame — a partially cleaned monthly frame carrying Location, Date, and measures

Outputs:
    - pandas.DataFrame — a copy with the measure columns cast to int

Usage:
    Called by the metro and state cleaners; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/cleaning/
"""

import pandas as pd


def coerce_measures_to_int(frame, measure_columns, *, location_column="Location", date_column="Date"):
    """
    Cast the five measure columns to int, raising a *located* error on a bad cell.

    A single blank or non-numeric measure cell in an otherwise-populated row is reported
    with the offending (Date, Location, column, value) rather than surfacing the opaque
    ``ValueError: invalid literal for int()`` that a bare ``.astype(int)`` raises, so a
    partially-populated BPS row is diagnosable at a glance (guide A5). The strictness is
    unchanged — a non-coercible cell still fails the run loudly.

    Test file: scripts/unit_tests/building_permits/cleaning/test_measure_coercion.py
    """
    result = frame.copy()
    for column in measure_columns:
        numeric = pd.to_numeric(result[column], errors="coerce")
        invalid = numeric.isna()
        if invalid.any():
            offenders = []
            for index in result.index[invalid][:5]:
                location = result.at[index, location_column] if location_column in result.columns else "?"
                date = result.at[index, date_column] if date_column in result.columns else "?"
                offenders.append(f"({date}, {location}, {column}={result.at[index, column]!r})")
            raise ValueError(f"Non-numeric measure cell(s) in {column}: {', '.join(offenders)}")
        result[column] = numeric.astype(int)
    return result
