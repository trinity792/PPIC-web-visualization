"""
e8_format_detection.py — identifies the column layout of a historical DoF E-8 workbook.

Data sources:
    - pandas.DataFrame input — raw E-8 worksheet content and structure

Outputs:
    - format identifier — "old_format" or "new_format" layout classification

Usage:
    python scripts/pophousing/historical/e8_format_detection.py

Test Folders:
    - scripts/unit_tests/pophousing/historical/
"""

import pandas as pd

"""
========================================================================================================================
Format Detection
========================================================================================================================
"""

# The 1990-2000 and 2000-2010 workbooks place "County Total" in the first
# column; the 2010-2020 workbook mirrors the modern E-5 layout with "County
# Total" in the second column. The label position is the cheapest reliable
# signal for telling the two layouts apart.
OLD_FORMAT = "old_format"
NEW_FORMAT = "new_format"

_COUNTY_TOTAL_LABEL = "County Total"
_DEFAULT_SEARCH_ROWS = 500


def detect_e8_file_format(raw_e8_df, search_rows=_DEFAULT_SEARCH_ROWS):
    """Identify an E-8 workbook layout from the County Total position. Test file: scripts/unit_tests/pophousing/historical/test_e8_format_detection.py"""
    if raw_e8_df.shape[1] == 0:
        raise ValueError("E-8 worksheet has no columns to inspect")

    rows_to_scan = min(search_rows, len(raw_e8_df))
    for position in range(rows_to_scan):
        row = raw_e8_df.iloc[position]
        first_cell = str(row.iloc[0]) if pd.notna(row.iloc[0]) else ""
        if _COUNTY_TOTAL_LABEL in first_cell:
            return OLD_FORMAT
        if raw_e8_df.shape[1] > 1:
            second_cell = str(row.iloc[1]) if pd.notna(row.iloc[1]) else ""
            if _COUNTY_TOTAL_LABEL in second_cell:
                return NEW_FORMAT

    return NEW_FORMAT
