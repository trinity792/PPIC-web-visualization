"""
jurisdiction_crosswalk.py — loads the committed jurisdiction crosswalk and (one-time) builds it from the DoF E-5 hierarchy.

Data sources:
    - data/data-raw/RHNA-progress-report/jurisdiction_county_crosswalk.csv (committed)
    - the DoF E-5 city-under-county hierarchy + shared CITY_NAME_MAPPINGS (builder only)

Outputs:
    - pandas.DataFrame — the jurisdiction -> county crosswalk
    - list — jurisdiction names the builder could not match (for review)

Usage:
    load_jurisdiction_crosswalk is on the per-run path; build_jurisdiction_crosswalk is
    run manually to (re)seed the committed CSV.

Test Folders:
    - scripts/unit_tests/rhna_progress/geography/
"""

import pandas as pd

"""
========================================================================================================================
Crosswalk Access
========================================================================================================================
"""


def load_jurisdiction_crosswalk(paths):
    """
    Read the committed jurisdiction -> county crosswalk CSV (seeded from the DoF E-5 hierarchy by the one-time builder). Raise with an actionable 'crosswalk missing' message on cold start rather than silently dropping region.

    Test file: scripts/unit_tests/rhna_progress/geography/test_jurisdiction_crosswalk.py
    """
    path = paths["jurisdiction_crosswalk_path"]
    if not path.exists():
        raise FileNotFoundError(
            f"crosswalk missing: expected the committed jurisdiction_county_crosswalk.csv at {path}. "
            "Run build_jurisdiction_crosswalk to seed it from the DoF E-5 hierarchy."
        )
    return pd.read_csv(path)


"""
========================================================================================================================
One-time Builder (Phase 0)
========================================================================================================================
"""


def build_jurisdiction_crosswalk(rhna_names, e5_hierarchy, name_mappings):
    """
    One-time (Phase 0-style) builder, run manually. Join RHNA's 539 jurisdiction names against the DoF E-5 city-under-county hierarchy (reconciled via the shared CITY_NAME_MAPPINGS), report any unmatched names for review, and write the committed
    jurisdiction_county_crosswalk.csv. Not on the per-run path; re-run when a new city incorporates or a new cycle's names appear.

    Test file: scripts/unit_tests/rhna_progress/geography/test_jurisdiction_crosswalk.py
    """
    city_to_county = {}
    for _, row in e5_hierarchy.iterrows():
        city = str(row["City"]).strip()
        county = str(row["County"]).strip()
        city_to_county[city] = county
        city_to_county[city.upper()] = county

    records = []
    unmatched = []
    for name in rhna_names:
        raw = str(name).strip()
        if raw.upper().endswith("COUNTY"):
            # A county jurisdiction self-maps; strip the suffix to name its county.
            jurisdiction = raw.title()
            county = jurisdiction[: -len(" County")].strip()
            records.append({"Jurisdiction": jurisdiction, "County": county, "Source Name": raw})
            continue

        mapped = name_mappings.get(raw) or name_mappings.get(raw.upper())
        title = raw.title()
        jurisdiction = mapped if mapped else title

        county = None
        for candidate in (mapped, title, raw):
            if not candidate:
                continue
            if candidate in city_to_county:
                county = city_to_county[candidate]
                break
            if candidate.upper() in city_to_county:
                county = city_to_county[candidate.upper()]
                break

        if county is None:
            unmatched.append(name)
            continue
        # Source Name preserves the raw HCD spelling so the per-run cleaner's
        # standardize_jurisdiction_names can reconcile e.g. "SAN BUENAVENTURA" -> "Ventura".
        records.append({"Jurisdiction": jurisdiction, "County": county, "Source Name": raw})

    result = pd.DataFrame(records, columns=["Jurisdiction", "County", "Source Name"])
    return result, unmatched
