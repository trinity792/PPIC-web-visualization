import re

from scripts.pophousing.config.sources import get_source_settings


def test_get_source_settings_required_keys():
    # Act
    settings = get_source_settings()

    # Assert
    assert {
        "base_url",
        "requests_headers",
        "request_timeout_seconds",
        "e5_cache_max_age_days",
        "e5_fallback_max_age_days",
        "e5_filename_pattern",
    } <= settings.keys()


def test_get_source_settings_e5_filename_pattern():
    # Arrange
    settings = get_source_settings()

    # Act
    matches = re.fullmatch(settings["e5_filename_pattern"], "E-5-2025_Geo_InternetVersion.xlsx")

    # Assert
    assert matches is not None


def test_get_source_settings_fallback_window_exceeds_cache():
    # The fallback window must be strictly wider than the cache/retention window,
    # or a workbook archived out of the cache is unreachable as a fallback (B1).
    settings = get_source_settings()

    # Assert
    assert settings["e5_cache_max_age_days"] == 90
    assert settings["e5_fallback_max_age_days"] > settings["e5_cache_max_age_days"]


def test_get_source_settings_request_configuration():
    # Act
    settings = get_source_settings()

    # Assert
    assert settings["base_url"].startswith("https://")
    assert settings["request_timeout_seconds"] > 0
    assert "User-Agent" in settings["requests_headers"]
