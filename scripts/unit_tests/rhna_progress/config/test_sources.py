import re

from scripts.rhna_progress.config.sources import get_source_config


def test_get_source_config_has_required_keys():
    config = get_source_config()

    assert {
        "package_id",
        "api_base_url",
        "resource_name_pattern",
        "dictionary_name_pattern",
        "request_headers",
        "timeout",
        "retry_attempts",
        "retry_backoff_seconds",
    } <= config.keys()


def test_get_source_config_targets_hcd_rhna_package():
    config = get_source_config()

    assert config["package_id"] == "ff082e96-72f7-4443-9747-8b8dadc15671"
    assert config["api_base_url"].startswith("https://")
    assert config["api_base_url"].endswith("/api/3/action")


def test_get_source_config_resource_regex_extracts_cycle_integer():
    pattern = re.compile(get_source_config()["resource_name_pattern"], re.IGNORECASE)

    assert pattern.match("5th Cycle RHNA Progress Report").group("cycle") == "5"
    assert pattern.match("6th Cycle RHNA Progress Report").group("cycle") == "6"
    assert pattern.match("7th Cycle RHNA Progress Report").group("cycle") == "7"
    assert pattern.match("6th Cycle RHNA Progress Report Data Dictionary") is None


def test_get_source_config_dictionary_regex_identifies_codebooks():
    pattern = re.compile(get_source_config()["dictionary_name_pattern"], re.IGNORECASE)

    assert pattern.match("5th Cycle RHNA Progress Report Data Dictionary").group("cycle") == "5"
    assert pattern.match("6th Cycle RHNA Progress Report Data Dictionary").group("cycle") == "6"
    assert pattern.match("6th Cycle RHNA Progress Report") is None


def test_get_source_config_request_settings():
    config = get_source_config()

    assert config["timeout"] > 0
    assert config["retry_attempts"] >= 1
    assert config["retry_backoff_seconds"] >= 0
    assert "User-Agent" in config["request_headers"]

