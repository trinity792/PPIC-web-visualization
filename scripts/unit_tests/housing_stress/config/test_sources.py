from scripts.housing_stress.config.sources import get_source_settings

EXPECTED_ITERATIONS = [
    ("b25140", "All"),
    ("b25140b", "Black"),
    ("b25140c", "American Indian/Alaskan Native"),
    ("b25140d", "Asian"),
    ("b25140e", "Native Hawaiian/Pacific Islander"),
    ("b25140f", "Other"),
    ("b25140g", "Multiracial"),
    ("b25140h", "White"),
    ("b25140i", "Hispanic"),
]


def test_get_source_settings_has_required_keys():
    settings = get_source_settings()

    assert {
        "data_url_pattern",
        "geo_url_pattern",
        "dataset",
        "request_headers",
        "timeout",
        "cache_max_age_days",
        "earliest_year",
        "excluded_years",
        "max_year_lookback",
        "table_iterations",
        "expected_geo_columns",
        "expected_estimate_columns",
    } <= settings.keys()


def test_get_source_settings_url_patterns_template_year_and_table_id():
    settings = get_source_settings()

    data_url = settings["data_url_pattern"].format(year=2023, tblid="b25140h")
    geo_url = settings["geo_url_pattern"].format(year=2023, tblid="b25140h")

    assert data_url.endswith("/acsdt1y2023-b25140h.dat")
    assert "2023" in geo_url
    assert geo_url.endswith("/Geos20231YR.txt")


def test_get_source_settings_has_ordered_race_iterations():
    settings = get_source_settings()

    assert list(settings["table_iterations"].items()) == EXPECTED_ITERATIONS
    assert "b25140a" not in settings["table_iterations"]


def test_get_source_settings_defines_year_availability():
    settings = get_source_settings()

    assert settings["earliest_year"] == 2012
    assert set(settings["excluded_years"]) == {2020}
    assert settings["max_year_lookback"] > 0


def test_get_source_settings_request_and_raw_schema_configuration():
    settings = get_source_settings()

    assert settings["data_url_pattern"].startswith("https://")
    assert settings["geo_url_pattern"].startswith("https://")
    assert settings["dataset"] == "1"
    assert settings["timeout"] > 0
    assert settings["cache_max_age_days"] > 0
    assert "User-Agent" in settings["request_headers"]
    assert settings["expected_geo_columns"] == ["GEO_ID", "NAME", "STUSAB"]
    assert settings["expected_estimate_columns"] == [
        f"E{number:03d}" for number in range(1, 14)
    ]
