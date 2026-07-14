"""
table_iterations.py — single owner of the 9 B25140 race iterations and their labels.

The B25140 iteration set was previously declared twice (raw labels in sources.py,
canonical labels in schemas.py, bridged by a reconciliation map), so editing one
file without the other drifted them. This module is the single source of truth:
sources.py and schemas.py both derive their maps from _ITERATIONS here, and the
base-table id is named explicitly so the "is this the base table" test never
depends on dict-iteration order.

Data sources:
    - hardcoded ACS B25140 iteration reference

Outputs:
    - the ordered iteration table and the derived tblid/label maps

Usage:
    Imported by config/sources.py and config/schemas.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/config/
"""

"""
========================================================================================================================
Iteration Reference
========================================================================================================================
"""

# The un-suffixed base table. Its "All" row is a stored total (not a sum of the
# race iterations), and it is the only iteration whose absence aborts a vintage.
BASE_TABLE_ID = "b25140"

# The 9 B25140 iterations, in acquisition order (base table first), as
# (table id, raw acquisition label, canonical race label) triples. Iteration "a"
# ("White alone", which includes Hispanic White) is deliberately omitted in favor
# of "h" ("White alone, not Hispanic") so White and Hispanic do not double-count.
_ITERATIONS = [
    ("b25140", "All", "All"),
    ("b25140b", "Black", "Black"),
    ("b25140c", "American Indian/Alaskan Native", "AIAN"),
    ("b25140d", "Asian", "Asian"),
    ("b25140e", "Native Hawaiian/Pacific Islander", "NHPI"),
    ("b25140f", "Other", "Other"),
    ("b25140g", "Multiracial", "Multiracial"),
    ("b25140h", "White", "White"),
    ("b25140i", "Hispanic", "Hispanic"),
]

# Fail loudly at import time if the base table is ever moved off the front, so the
# ordering invariant that acquisition relies on can never silently regress.
assert _ITERATIONS[0][0] == BASE_TABLE_ID, "The base table must be the first iteration."


def table_iterations():
    """Return the ordered {table id: raw acquisition label} map (base table first)."""
    return {tblid: raw_label for tblid, raw_label, _canonical in _ITERATIONS}


def race_iteration_map():
    """Return the {table id: canonical race label} map."""
    return {tblid: canonical for tblid, _raw_label, canonical in _ITERATIONS}


def race_reconciliation_map():
    """Return the {raw acquisition label: canonical race label} bridge map."""
    return {raw_label: canonical for _tblid, raw_label, canonical in _ITERATIONS}
