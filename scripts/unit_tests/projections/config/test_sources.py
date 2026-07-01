import re

from scripts.projections.config.sources import get_source_settings

CCEST_RAW_COLUMNS = [
    "SUMLEV",
    "STATE",
    "COUNTY",
    "STNAME",
    "CTYNAME",
    "YEAR",
    "AGEGRP",
    "NHWA_MALE",
    "NHWA_FEMALE",
    "NHBA_MALE",
    "NHBA_FEMALE",
    "NHIA_MALE",
    "NHIA_FEMALE",
    "NHAA_MALE",
    "NHAA_FEMALE",
    "NHNA_MALE",
    "NHNA_FEMALE",
    "NHTOM_MALE",
    "NHTOM_FEMALE",
    "H_MALE",
    "H_FEMALE",
]


def test_get_source_settings_has_required_keys():
    # Act
    settings = get_source_settings()

    # Assert
    assert {
        "dof_base_url",
        "census_base_url",
        "request_headers",
        "timeout",
        "p3_cache_max_age_days",
        "p3_fallback_max_age_days",
        "ccest_cache_max_age_days",
        "p3_filename_pattern",
        "p3_expected_csv_columns",
        "ccest_expected_columns",
    } <= settings.keys()


def test_get_source_settings_p3_filename_pattern_matches_canonical_name():
    # Arrange
    settings = get_source_settings()

    # Act
    canonical_match = re.fullmatch(
        settings["p3_filename_pattern"],
        "P-3_Complete.csv",
    )
    unrelated_match = re.fullmatch(
        settings["p3_filename_pattern"],
        "unrelated-projections.csv",
    )

    # Assert
    assert canonical_match is not None
    assert unrelated_match is None


def test_get_source_settings_request_and_cache_configuration():
    # Act
    settings = get_source_settings()

    # Assert
    assert settings["dof_base_url"].startswith("https://")
    assert settings["census_base_url"].startswith("https://")
    assert settings["timeout"] > 0
    assert "User-Agent" in settings["request_headers"]
    assert settings["p3_cache_max_age_days"] == settings["p3_fallback_max_age_days"]
    assert settings["p3_cache_max_age_days"] > 0
    assert settings["ccest_cache_max_age_days"] > 0


def test_get_source_settings_uses_official_ccest_wide_schema():
    # Act
    settings = get_source_settings()

    # Assert
    assert settings["ccest_expected_columns"] == CCEST_RAW_COLUMNS
