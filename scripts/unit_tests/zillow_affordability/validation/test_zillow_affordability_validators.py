import pandas as pd
import pytest

from scripts.unit_tests.zillow_affordability.helpers import RELEASE_DATE, write_raw_files
from scripts.zillow_affordability.cleaning.reshape_series import build_cleaned_dataset
from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config
from scripts.zillow_affordability.output.finalize_dataset import finalize_dataset
from scripts.zillow_affordability.validation.zillow_affordability_validators import (
    collect_warnings,
    validate_cleaned,
    validate_final,
)

SCHEMA = get_schema_config()


@pytest.fixture
def valid(tmp_path):
    files = write_raw_files(tmp_path)
    cleaned = build_cleaned_dataset(files, RELEASE_DATE, get_source_config(), SCHEMA)
    return finalize_dataset(cleaned, SCHEMA)


def _row(frame, location, date, scenario):
    return (frame["Location"] == location) & (frame["Date"] == date) & (frame["Housing Scenario"] == scenario)


def _assert_fails(frame, tag, existing=None):
    is_valid, messages = validate_final(frame, SCHEMA, existing=existing)
    assert not is_valid
    assert any(message.startswith(tag) for message in messages), messages


# ── Passing frames ────────────────────────────────────────────────────────────


def test_a_well_formed_frame_passes_both_validators(valid):
    assert validate_cleaned(valid, SCHEMA) == (True, [])
    assert validate_final(valid, SCHEMA, existing=valid) == (True, [])


def test_a_well_formed_frame_has_no_warnings(valid):
    assert collect_warnings(valid, SCHEMA) == []


# ── Hard checks ───────────────────────────────────────────────────────────────


def test_missing_or_reordered_columns_fail(valid):
    _assert_fails(valid.drop(columns="Years to Save"), "columns")
    _assert_fails(valid[[*reversed(valid.columns)]], "columns")


def test_an_empty_frame_fails(valid):
    _assert_fails(valid.iloc[0:0], "empty")


def test_duplicate_grain_keys_fail(valid):
    _assert_fails(pd.concat([valid, valid.iloc[[0]]], ignore_index=True), "duplicates")


def test_values_outside_the_vocabulary_fail(valid):
    bad_scenario = valid.copy()
    bad_scenario.loc[bad_scenario.index[0], "Housing Scenario"] = "Buy (3% down)"
    _assert_fails(bad_scenario, "allowed values")

    bad_level = valid.copy()
    bad_level.loc[bad_level.index[0], "Geographic Level"] = "County"
    _assert_fails(bad_level, "allowed values")


def test_cleaning_validator_also_catches_vocabulary_and_missing_places(valid):
    bad = valid[valid["Location"] != "Madera"]
    is_valid, messages = validate_cleaned(bad, SCHEMA)
    assert not is_valid
    assert any(message.startswith("locations") for message in messages)


def test_a_missing_place_fails(valid):
    _assert_fails(valid[valid["Location"] != "Madera"], "locations")


def test_a_missing_place_in_only_one_scenario_fails(valid):
    _assert_fails(valid[~((valid["Location"] == "Madera") & (valid["Housing Scenario"] == "Rent"))], "locations")


def test_more_than_one_release_date_fails(valid):
    mixed = valid.copy()
    mixed.loc[mixed.index[0], "Release Date"] = "2026-10-15"
    _assert_fails(mixed, "release date")


def test_a_future_or_garbled_release_date_fails(valid):
    _assert_fails(valid.assign(**{"Release Date": "2999-01-01"}), "release date")
    _assert_fails(valid.assign(**{"Release Date": "soon"}), "release date")


def test_a_malformed_month_fails(valid):
    bad = valid.copy()
    bad.loc[bad.index[0], "Date"] = "2012-1"
    _assert_fails(bad, "months")


def test_a_gap_in_the_months_fails(valid):
    _assert_fails(valid[~_row(valid, "Fresno", "2012-02", "Buy (20% down)")], "months")


def test_a_series_starting_later_than_configured_fails(valid):
    _assert_fails(valid[~((valid["Housing Scenario"] == "Buy (5% down)") & (valid["Date"] == "2012-01"))], "months")


def test_months_after_the_release_month_fail(valid):
    _assert_fails(valid.assign(**{"Release Date": "2012-02-15"}), "months")


def test_a_measure_on_a_scenario_that_lacks_it_fails(valid):
    bad = valid.copy()
    bad.loc[_row(bad, "Fresno", "2012-01", "Buy (5% down)"), "Income Needed"] = 1.0
    _assert_fails(bad, "scenario measures")


def test_a_negative_value_fails(valid):
    bad = valid.copy()
    bad.loc[_row(bad, "Fresno", "2012-01", "Buy (20% down)"), "Years to Save"] = -1.0
    _assert_fails(bad, "negative")


def test_total_payment_below_mortgage_payment_fails(valid):
    bad = valid.copy()
    bad.loc[_row(bad, "Fresno", "2012-01", "Buy (10% down)"), "Total Monthly Payment"] = 10.0
    _assert_fails(bad, "total below mortgage")


def test_a_saved_month_disappearing_fails(valid):
    _assert_fails(valid[valid["Date"] != "2012-01"], "history", existing=valid)


# ── Soft checks ───────────────────────────────────────────────────────────────


def test_a_broken_30_percent_identity_is_a_warning_not_a_failure(valid):
    drifted = valid.copy()
    drifted.loc[_row(drifted, "Fresno", "2012-02", "Buy (20% down)"), "Income Needed"] = 1_000_000.0

    assert validate_final(drifted, SCHEMA, existing=valid)[0] is True
    warnings = collect_warnings(drifted, SCHEMA)
    assert any("30%" in message and "Fresno" in message for message in warnings)


def test_a_share_above_one_is_a_warning(valid):
    high = valid.copy()
    high.loc[_row(high, "Napa", "2012-03", "Rent"), "Share of Income"] = 1.2

    warnings = collect_warnings(high, SCHEMA)
    assert any("above 100%" in message and "Napa" in message for message in warnings)


def test_a_blank_latest_month_is_a_warning(valid):
    lagging = valid.copy()
    lagging.loc[_row(lagging, "Chico", "2012-03", "Rent"), ["Income Needed", "Share of Income"]] = None

    warnings = collect_warnings(lagging, SCHEMA)
    assert any("latest month" in message and "Chico" in message for message in warnings)


def test_a_california_metro_outside_the_expected_list_is_a_warning(valid):
    extra = valid[valid["Location"] == "Napa"].assign(Location="Truckee")

    warnings = collect_warnings(pd.concat([valid, extra], ignore_index=True), SCHEMA)
    assert any("Truckee" in message and "not in the expected list" in message for message in warnings)
