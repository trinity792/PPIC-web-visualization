def get_source_settings():
    return {
        "base_url": "https://dof.ca.gov/forecasting/demographics/estimates/",
        "requests_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
            )
        },
        "request_timeout_seconds": 60,
        "e5_cache_max_age_days": 60,
        "e5_fallback_max_age_days": 60,
        "e5_filename_pattern": r"E-5-\d{4}_Geo_InternetVersion\.xlsx",
        "e5_header_pattern": r"E-5 Population and Housing Estimates for Cities, Counties, and the State",
        "e5_landing_page_pattern": r"20\d{2}\s*(?:-|\u2013)\s*20\d{2}",
        "e5_workbook_link_pattern": r"E-5-\d{4}_Geo_InternetVersion\.xlsx(?:\?.*)?$",
    }
