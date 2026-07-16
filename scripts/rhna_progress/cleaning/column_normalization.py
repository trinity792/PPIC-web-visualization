"""
column_normalization.py — renames both raw cycle shapes to the canonical schema, standardizes names, and parses the planning period.

Data sources:
    - raw RHNA cycle CSVs (14-col 5th cycle or 15-col 6th cycle)
    - the committed jurisdiction crosswalk (for name reconciliation)

Outputs:
    - pandas.DataFrame — canonical wide frame with parsed Planning Period Start/End
    - pandas.DataFrame — quarantined rows whose Planning Period failed to parse

Usage:
    Called by the RHNA Progress cleaning phase; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/cleaning/
"""

import re

import pandas as pd

"""
========================================================================================================================
Helpers
========================================================================================================================
"""


def _normalize_name(value):
    """Collapse whitespace, trim, and upper-case a place name for crosswalk matching."""
    return re.sub(r"\s+", " ", str(value).strip()).upper()


def _to_bool(value):
    """Coerce a source 'Cycle Started' flag ('TRUE'/'FALSE') to a Python bool, defaulting True when blank."""
    if isinstance(value, bool):
        return value
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return True
    return str(value).strip().upper() in {"TRUE", "T", "YES", "1"}


"""
========================================================================================================================
Column Normalization
========================================================================================================================
"""


def normalize_columns(raw_df, cycle, schema_config):
    """
    Rename the source columns (either the 14-col 5th-cycle or 15-col 6th-cycle shape) to the canonical schema, default Cycle Started where absent, and attach the Cycle integer. Raise ValueError on an unexpected column set (names the expected vs
    found columns).

    Test file: scripts/unit_tests/rhna_progress/cleaning/test_column_normalization.py
    """
    tier_columns = schema_config["income_tier_columns"]

    rename = {}
    required_sources = ["Jurisdiction", "Planning Period"]
    canonical_measures = []
    for columns in tier_columns.values():
        rename[columns["source_units"]] = columns["units"]
        rename[columns["source_rhna"]] = columns["rhna"]
        rename[columns["source_percent"]] = columns["percent"]
        required_sources += [columns["source_units"], columns["source_rhna"], columns["source_percent"]]
        canonical_measures += [columns["units"], columns["rhna"], columns["percent"]]

    missing = [column for column in required_sources if column not in raw_df.columns]
    if missing:
        raise ValueError(
            f"Unexpected RHNA column set for cycle {cycle}: missing {missing}; found {list(raw_df.columns)}"
        )

    result = raw_df.rename(columns=rename).copy()

    # The 6th-cycle file carries an "Nth Cycle Started" boolean; the 5th cycle omits it and
    # defaults True. Normalize either shape to a single "Cycle Started" bool column.
    started_column = None
    for column in result.columns:
        if column == "Cycle Started" or re.match(r"^\d+(?:st|nd|rd|th)\s+Cycle Started$", str(column), re.IGNORECASE):
            started_column = column
            break
    if started_column is not None:
        started_values = result[started_column].map(_to_bool)
        result = result.drop(columns=[started_column])
        result["Cycle Started"] = started_values
    else:
        result["Cycle Started"] = True

    result["Cycle"] = cycle

    keep = ["Jurisdiction", "Planning Period", "Cycle Started", "Cycle", *canonical_measures]
    return result[[column for column in keep if column in result.columns]]


def standardize_jurisdiction_names(df, geography):
    """
    Single canonical place-name pass: uppercase-normalize, trim, and reconcile jurisdiction names against the crosswalk keys so cities and counties join cleanly downstream.

    Test file: scripts/unit_tests/rhna_progress/cleaning/test_column_normalization.py
    """
    crosswalk = geography["jurisdiction_crosswalk"]

    lookup = {}
    if "Jurisdiction" in crosswalk.columns:
        for canonical in crosswalk["Jurisdiction"].dropna():
            lookup[_normalize_name(canonical)] = canonical
    # A "Source Name" column (when the crosswalk carries one) maps raw HCD spellings that
    # differ from the canonical name (e.g. SAN BUENAVENTURA -> Ventura).
    if "Source Name" in crosswalk.columns:
        for source_name, canonical in zip(crosswalk["Source Name"], crosswalk["Jurisdiction"]):
            if pd.notna(source_name):
                lookup[_normalize_name(source_name)] = canonical

    result = df.copy()
    resolved = []
    unmapped = []
    for name in result["Jurisdiction"]:
        key = _normalize_name(name)
        if key in lookup:
            resolved.append(lookup[key])
        else:
            unmapped.append(name)
            resolved.append(name)

    if unmapped:
        raise ValueError(
            f"Unrecognized jurisdiction name(s) not found in the crosswalk: {sorted(set(unmapped))}. "
            "Re-run build_jurisdiction_crosswalk to add them."
        )

    result["Jurisdiction"] = resolved
    return result


"""
========================================================================================================================
Planning Period Parsing
========================================================================================================================
"""


def _parse_range(value):
    """Split an 'mm/dd/yyyy - mm/dd/yyyy' range into (start, end, reason); reason is None on success."""
    parts = [part.strip() for part in str(value).split(" - ")]
    if len(parts) != 2:
        return pd.NaT, pd.NaT, "Planning Period parse failed: expected 'start - end'"
    try:
        start = pd.to_datetime(parts[0], format="%m/%d/%Y")
        end = pd.to_datetime(parts[1], format="%m/%d/%Y")
    except (ValueError, TypeError):
        return pd.NaT, pd.NaT, "Planning Period parse failed: unrecognized date"
    return start, end, None


def parse_planning_period(df):
    """
    Split the 'mm/dd/yyyy - mm/dd/yyyy' range into Planning Period Start / End dates, leaving the original string intact. Rows whose range fails to parse are quarantined (returned in a separate frame written to a side file and logged), not emitted
    with null dates.

    Test file: scripts/unit_tests/rhna_progress/cleaning/test_column_normalization.py
    """
    result = df.copy()
    parsed = [_parse_range(value) for value in result["Planning Period"]]
    result["Planning Period Start"] = [item[0] for item in parsed]
    result["Planning Period End"] = [item[1] for item in parsed]
    reasons = [item[2] for item in parsed]
    is_good = [reason is None for reason in reasons]

    good_mask = pd.Series(is_good, index=result.index)
    clean = result[good_mask].reset_index(drop=True)

    quarantined = result[~good_mask].copy()
    quarantined["Quarantine Reason"] = [reasons[i] for i in range(len(reasons)) if not is_good[i]]
    quarantined = quarantined.reset_index(drop=True)

    return clean, quarantined
