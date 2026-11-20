"""
sources.py — defines the 12 Zillow Research affordability files and the HTTP settings used to fetch them.

Data sources:
    - https://www.zillow.com/research/data/ — Zillow Research Housing Data page (Affordability and Home values sections)
    - lib.config — default HTTP headers and timeout

Outputs:
    - dict — base URL, per-series download settings, headers, and timeout

Usage:
    from scripts.zillow_affordability.config.sources import get_source_config

Test Folders:
    - scripts/unit_tests/zillow_affordability/config/
"""

from lib.config import get_default_http_settings

"""
========================================================================================================================
Source Configuration
========================================================================================================================
"""

# Link stability: Fixed. Each file has one permanent URL that Zillow overwrites with every
# monthly release (all 12 verified 2026-11-18). The release date comes from Last-Modified.
_BASE_URL = "https://files.zillowstatic.com/research/public_csvs"

_BUY_SUFFIX = "uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
_RENT_SUFFIX = "uc_sfrcondomfr_sm_sa_month.csv"

# (key, folder, filename, contract column, housing scenario)
_SERIES = [
    *[
        (
            f"mortgage_payment_{share[2:]}",
            "mortgage_payment",
            f"Metro_mortgage_payment_downpayment_{share}_{_BUY_SUFFIX}",
            "Mortgage Payment",
            scenario,
        )
        for share, scenario in [("0.05", "Buy (5% down)"), ("0.10", "Buy (10% down)"), ("0.20", "Buy (20% down)")]
    ],
    *[
        (
            f"total_monthly_payment_{share[2:]}",
            "total_monthly_payment",
            f"Metro_total_monthly_payment_downpayment_{share}_{_BUY_SUFFIX}",
            "Total Monthly Payment",
            scenario,
        )
        for share, scenario in [("0.05", "Buy (5% down)"), ("0.10", "Buy (10% down)"), ("0.20", "Buy (20% down)")]
    ],
    (
        "new_homeowner_income_needed",
        "new_homeowner_income_needed",
        f"Metro_new_homeowner_income_needed_downpayment_0.20_{_BUY_SUFFIX}",
        "Income Needed",
        "Buy (20% down)",
    ),
    (
        "new_homeowner_affordability",
        "new_homeowner_affordability",
        f"Metro_new_homeowner_affordability_downpayment_0.20_{_BUY_SUFFIX}",
        "Share of Income",
        "Buy (20% down)",
    ),
    (
        "affordable_price",
        "affordable_price",
        f"Metro_affordable_price_downpayment_0.20_{_BUY_SUFFIX}",
        "Affordable Home Price",
        "Buy (20% down)",
    ),
    (
        "years_to_save",
        "years_to_save",
        f"Metro_years_to_save_downpayment_0.20_{_BUY_SUFFIX}",
        "Years to Save",
        "Buy (20% down)",
    ),
    (
        "new_renter_income_needed",
        "new_renter_income_needed",
        f"Metro_new_renter_income_needed_{_RENT_SUFFIX}",
        "Income Needed",
        "Rent",
    ),
    (
        "new_renter_affordability",
        "new_renter_affordability",
        f"Metro_new_renter_affordability_{_RENT_SUFFIX}",
        "Share of Income",
        "Rent",
    ),
]


def get_source_config():
    """
    Return the Zillow source settings: base URL, the 12 series (key, folder, filename, url, column, scenario), headers, and timeout.

    Test file: scripts/unit_tests/zillow_affordability/config/test_sources.py
    """
    http = get_default_http_settings()
    return {
        "base_url": _BASE_URL,
        "series": [
            {
                "key": key,
                "folder": folder,
                "filename": filename,
                "url": f"{_BASE_URL}/{folder}/{filename}",
                "column": column,
                "scenario": scenario,
            }
            for key, folder, filename, column, scenario in _SERIES
        ],
        "headers": dict(http["headers"]),
        "timeout_seconds": http["timeout_seconds"],
    }
