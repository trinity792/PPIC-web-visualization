from scripts.building_permits.config.sources import get_source_settings


def test_get_source_settings_has_required_keys():
    settings = get_source_settings()

    assert {
        "cbsa_url_pattern",
        "state_url_pattern",
        "request_headers",
        "timeout",
        "cache_max_age_days",
        "earliest_month",
        "max_month_lookback",
        "expected_metro_columns",
        "expected_state_columns",
    } <= settings.keys()


def test_get_source_settings_url_patterns_template_month():
    settings = get_source_settings()

    cbsa_url = settings["cbsa_url_pattern"].format(yyyymm="202605")
    state_url = settings["state_url_pattern"].format(yyyymm="202605")

    assert cbsa_url.endswith("/cbsamonthly_202605.xls")
    assert state_url.endswith("/statemonthly_202605.xls")


def test_get_source_settings_defines_month_availability_window():
    settings = get_source_settings()

    assert settings["earliest_month"] == "2010-01"
    assert settings["max_month_lookback"] > 0


def test_get_source_settings_request_and_raw_schema_configuration():
    settings = get_source_settings()

    assert settings["cbsa_url_pattern"].startswith("https://")
    assert settings["state_url_pattern"].startswith("https://")
    assert settings["timeout"] > 0
    assert settings["cache_max_age_days"] > 0
    assert "User-Agent" in settings["request_headers"]
    assert settings["expected_metro_columns"]
    assert settings["expected_state_columns"]
