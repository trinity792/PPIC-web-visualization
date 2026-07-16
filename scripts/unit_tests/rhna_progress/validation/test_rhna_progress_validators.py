import pandas as pd
from scripts.rhna_progress.validation.rhna_progress_validators import (
    validate_cleaned,
    validate_dictionary_columns,
    validate_final,
)

from scripts.unit_tests.rhna_progress.helpers import (
    GRAIN_KEYS,
    INCOME_LEVELS,
    OUTPUT_COLUMNS,
    TIER_LEVELS,
    long_row,
    raw_cycle_6_frame,
    schema_config,
    write_minimal_docx_table,
)


def _cleaned_frame():
    rows = []
    for level in INCOME_LEVELS:
        units = 400 if level == "Total" else 100
        rhna = 400 if level == "Total" else 100
        rows.append(
            long_row(
                income_level=level,
                units=units,
                rhna=rhna,
                percent=1.0,
                status="Met",
                overall_category="Met",
            )
        )
    return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)


def _final_frame():
    frame = _cleaned_frame()
    frame["Projected Units"] = frame["Units"]
    frame["On Track Score"] = 1.0
    frame["Tiers Met"] = 4
    frame["Tiers With Goal"] = 4
    frame["Overall Progress"] = 1.0
    frame["Overall On Track Score"] = 1.0
    frame["Overall Category"] = "Met"
    frame["Most Recent"] = True
    return frame


def test_validate_dictionary_columns_accepts_matching_docx_field_names(tmp_path):
    raw_columns = raw_cycle_6_frame().columns.tolist()
    codebook = tmp_path / "6th-cycle-rhna-progress-report-data-dictionary.docx"
    write_minimal_docx_table(codebook, raw_columns)

    is_valid, messages = validate_dictionary_columns(raw_columns, 6, codebook)

    assert is_valid is True
    assert messages == []


def test_validate_dictionary_columns_blocks_missing_declared_field(tmp_path):
    raw_columns = raw_cycle_6_frame().drop(columns=["VLI UNITS"]).columns.tolist()
    codebook = tmp_path / "6th-cycle-rhna-progress-report-data-dictionary.docx"
    write_minimal_docx_table(codebook, raw_cycle_6_frame().columns.tolist())

    is_valid, messages = validate_dictionary_columns(raw_columns, 6, codebook)

    assert is_valid is False
    assert any("VLI UNITS" in message for message in messages)


def test_validate_dictionary_columns_warns_soft_on_extra_live_column(tmp_path):
    raw_columns = raw_cycle_6_frame().columns.tolist() + ["New HCD Column"]
    codebook = tmp_path / "6th-cycle-rhna-progress-report-data-dictionary.docx"
    write_minimal_docx_table(codebook, raw_cycle_6_frame().columns.tolist())

    is_valid, messages = validate_dictionary_columns(raw_columns, 6, codebook)

    assert is_valid is True
    assert any("New HCD Column" in message for message in messages)


def test_validate_cleaned_accepts_valid_long_income_grain():
    is_valid, messages = validate_cleaned(_cleaned_frame(), schema_config())

    assert is_valid is True
    assert messages == []


def test_validate_cleaned_reports_missing_income_level_in_group():
    source = _cleaned_frame()
    source = source[source["Income Level"].ne("Moderate")]

    is_valid, messages = validate_cleaned(source, schema_config())

    assert is_valid is False
    assert any("Moderate" in message for message in messages)


def test_validate_cleaned_reports_null_grain_key():
    source = _cleaned_frame()
    source.loc[source.index[0], "Jurisdiction"] = None

    is_valid, messages = validate_cleaned(source, schema_config())

    assert is_valid is False
    assert any("null" in message.lower() for message in messages)


def test_validate_cleaned_reports_negative_units_or_rhna():
    source = _cleaned_frame()
    source.loc[source.index[0], "Units"] = -1

    is_valid, messages = validate_cleaned(source, schema_config())

    assert is_valid is False
    assert any("negative" in message.lower() for message in messages)


def test_validate_cleaned_reports_tier_percent_mismatch():
    source = _cleaned_frame()
    source.loc[source["Income Level"].eq("Very Low"), "Percent"] = 0.25

    is_valid, messages = validate_cleaned(source, schema_config())

    assert is_valid is False
    assert any("percent" in message.lower() for message in messages)


def test_validate_final_accepts_valid_dataset():
    is_valid, messages = validate_final(_final_frame(), schema_config())

    assert is_valid is True
    assert messages == []


def test_validate_final_reports_duplicate_grain():
    source = pd.concat([_final_frame(), _final_frame().iloc[[0]]], ignore_index=True)

    is_valid, messages = validate_final(source, schema_config())

    assert is_valid is False
    assert any("duplicate" in message.lower() for message in messages)


def test_validate_final_reports_total_row_mismatch():
    source = _final_frame()
    source.loc[source["Income Level"].eq("Total"), "Units"] = 399

    is_valid, messages = validate_final(source, schema_config())

    assert is_valid is False
    assert any("total" in message.lower() for message in messages)


def test_validate_final_reports_region_outside_shared_nine():
    source = _final_frame()
    source["Region"] = "Not A PPIC Region"

    is_valid, messages = validate_final(source, schema_config())

    assert is_valid is False
    assert any("region" in message.lower() for message in messages)


def test_validate_final_reports_mixed_most_recent_flags_within_group():
    source = _final_frame()
    source.loc[source.index[0], "Most Recent"] = False

    is_valid, messages = validate_final(source, schema_config())

    assert is_valid is False
    assert any("Most Recent" in message for message in messages)


def test_validate_final_reports_status_inconsistent_with_four_quadrant_rule():
    source = _final_frame()
    source.loc[source["Income Level"].eq("Very Low"), "Status"] = "On Track"

    is_valid, messages = validate_final(source, schema_config())

    assert is_valid is False
    assert any("status" in message.lower() for message in messages)


def test_validate_final_reports_tiers_met_above_tiers_with_goal():
    source = _final_frame()
    source["Tiers Met"] = 5

    is_valid, messages = validate_final(source, schema_config())

    assert is_valid is False
    assert any("Tiers Met" in message for message in messages)


def test_validate_final_uses_grain_keys_from_schema_config():
    config = schema_config()

    assert config["final_validation_config"]["duplicate_key_columns"] == GRAIN_KEYS
    assert config["final_validation_config"]["income_levels"] == INCOME_LEVELS
    assert config["final_validation_config"]["tier_income_levels"] == TIER_LEVELS

