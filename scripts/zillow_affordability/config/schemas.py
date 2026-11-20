"""
schemas.py — the data contract for the Zillow Housing Affordability table: columns, grain, vocabularies, and check settings.

Data sources:
    - docs/specifications/zillow-affordability-topic-specification.md — the approved contract this mirrors

Outputs:
    - dict — schema settings consumed by cleaning, validation, merging, and output

Usage:
    from scripts.zillow_affordability.config.schemas import get_schema_config

Test Folders:
    - scripts/unit_tests/zillow_affordability/config/
"""

"""
========================================================================================================================
Contract
========================================================================================================================
"""

_MEASURES = [
    "Mortgage Payment",
    "Total Monthly Payment",
    "Income Needed",
    "Share of Income",
    "Affordable Home Price",
    "Years to Save",
]

_SCENARIOS = ["Buy (5% down)", "Buy (10% down)", "Buy (20% down)", "Rent"]

# Zillow's short metro names (without ", CA") for the 26 California metros it publishes,
# plus the national benchmark. Verified against the 2026-11-16 release.
_EXPECTED_LOCATIONS = [
    "United States",
    "Bakersfield",
    "Chico",
    "El Centro",
    "Fresno",
    "Hanford",
    "Los Angeles",
    "Madera",
    "Merced",
    "Modesto",
    "Napa",
    "Oxnard",
    "Redding",
    "Riverside",
    "Sacramento",
    "Salinas",
    "San Diego",
    "San Francisco",
    "San Jose",
    "San Luis Obispo",
    "Santa Cruz",
    "Santa Maria",
    "Santa Rosa",
    "Stockton",
    "Vallejo",
    "Visalia",
    "Yuba City",
]


# ── Known source errors ───────────────────────────────────────────────────────

# Cells confirmed wrong in Zillow's own files and blanked by explicit listing, not by a
# rule (owner decision 2026-11-18). RECHECK AT EVERY ZILLOW REFRESH: every run logs a
# reminder with the raw total/mortgage ratio of these rows; normal months run 1.15-1.80x.
# Remove an entry once Zillow publishes corrected values.
_KNOWN_SOURCE_ERRORS = [
    {
        "id": "zillow-2013-tax-insurance-spike",
        "locations": ["Hanford", "Santa Rosa", "Yuba City"],
        "months": [f"2013-{month:02d}" for month in range(1, 13)],
        "scenarios": ["Buy (5% down)", "Buy (10% down)", "Buy (20% down)"],
        # Mortgage Payment and Years to Save are unaffected; these four derive from the total.
        "columns": ["Total Monthly Payment", "Income Needed", "Share of Income", "Affordable Home Price"],
        "recorded": "2026-11-18",
        "found_in_release": "2026-11-16",
        "reason": (
            "Total Monthly Payment is 13.5-23.9x the mortgage payment (normal: 1.15-1.80x) in every month of 2013 "
            "(e.g. Santa Rosa $1,788 in Dec 2012, $26,412 in Jan 2013, $2,319 in Jan 2014) "
            "while the mortgage payment is normal; the error carries into the columns computed from it."
        ),
    },
]


def get_schema_config():
    """
    Return the Zillow Affordability contract: output columns, measures, grain, vocabularies, expected places, per-scenario measures, earliest months, and soft-check tolerances.

    Test file: scripts/unit_tests/zillow_affordability/config/test_schemas.py
    """
    return {
        "output_columns": [
            "Release Date",
            "Geographic Level",
            "Location",
            "Date",
            "Housing Scenario",
            *_MEASURES,
        ],
        "text_columns": ["Release Date", "Geographic Level", "Location", "Date", "Housing Scenario"],
        "measure_columns": list(_MEASURES),
        "grain_keys": ["Location", "Date", "Housing Scenario"],
        "scenario_order": list(_SCENARIOS),
        "geographic_level_map": {"country": "Nation", "msa": "Metro"},
        "geographic_level_order": ["Nation", "Metro"],
        "state_code": "CA",
        "state_suffix": ", CA",
        "expected_locations": list(_EXPECTED_LOCATIONS),
        "applicable_measures": {
            "Buy (5% down)": ["Mortgage Payment", "Total Monthly Payment"],
            "Buy (10% down)": ["Mortgage Payment", "Total Monthly Payment"],
            "Buy (20% down)": list(_MEASURES),
            "Rent": ["Income Needed", "Share of Income"],
        },
        "earliest_month": {
            "Buy (5% down)": "2012-01",
            "Buy (10% down)": "2012-01",
            "Buy (20% down)": "2012-01",
            "Rent": "2015-01",
        },
        # Zillow's affordability threshold: income needed keeps the monthly cost at 30% of income.
        "income_rule_share": 0.30,
        "income_rule_tolerance": 0.005,
        "known_source_errors": list(_KNOWN_SOURCE_ERRORS),
    }
