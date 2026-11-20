import pandas as pd

from scripts.unit_tests.zillow_affordability.helpers import RELEASE_DATE, write_raw_files
from scripts.zillow_affordability.cleaning.known_source_errors import blank_known_source_errors
from scripts.zillow_affordability.cleaning.reshape_series import build_cleaned_dataset
from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config

SCHEMA = get_schema_config()

ERROR = {
    "id": "test-error",
    "locations": ["Fresno"],
    "months": ["2012-02", "2012-03"],
    "scenarios": ["Buy (10% down)", "Buy (20% down)"],
    "columns": ["Total Monthly Payment", "Income Needed"],
    "recorded": "2026-11-18",
    "reason": "test",
}


def _cleaned(tmp_path):
    return build_cleaned_dataset(write_raw_files(tmp_path), RELEASE_DATE, get_source_config(), SCHEMA)


def _cells(frame, location, months, scenarios):
    return frame[(frame["Location"] == location) & frame["Date"].isin(months) & frame["Housing Scenario"].isin(scenarios)]


def test_only_the_listed_cells_are_blanked(tmp_path):
    cleaned = _cleaned(tmp_path)

    blanked, report = blank_known_source_errors(cleaned, [ERROR])

    target = _cells(blanked, "Fresno", ERROR["months"], ERROR["scenarios"])
    assert target["Total Monthly Payment"].isna().all()
    # Income Needed only exists on the 20% rows, so only those count as blanked
    assert target["Income Needed"].isna().all()
    assert target["Mortgage Payment"].notna().all()

    untouched = blanked.drop(index=target.index)
    pd.testing.assert_frame_equal(untouched, cleaned.drop(index=target.index))
    assert report[0]["cells_blanked"] == 2 * 2 + 2


def test_blanking_does_not_mutate_the_input(tmp_path):
    cleaned = _cleaned(tmp_path)
    original = cleaned.copy()

    blank_known_source_errors(cleaned, [ERROR])

    pd.testing.assert_frame_equal(cleaned, original)


def test_the_report_describes_raw_values_before_blanking(tmp_path):
    cleaned = _cleaned(tmp_path)

    _, report = blank_known_source_errors(cleaned, [ERROR])

    entry = report[0]
    assert entry["id"] == "test-error"
    assert entry["rows_matched"] == 4
    # Synthetic data: total / mortgage is 1.8/1.3 at 10% down and 1.5 at 20% down
    low, high = entry["raw_total_to_mortgage_ratio"]
    assert round(low, 2) == 1.38 and round(high, 2) == 1.5


def test_an_error_matching_no_rows_reports_zero(tmp_path):
    cleaned = _cleaned(tmp_path)
    missing = dict(ERROR, locations=["Atlantis"])

    blanked, report = blank_known_source_errors(cleaned, [missing])

    pd.testing.assert_frame_equal(blanked, cleaned)
    assert report[0]["rows_matched"] == 0
    assert report[0]["cells_blanked"] == 0
    assert report[0]["raw_total_to_mortgage_ratio"] is None


def test_the_configured_2013_zillow_error_targets_three_metros_and_twelve_months():
    errors = SCHEMA["known_source_errors"]

    assert len(errors) == 1
    error = errors[0]
    assert error["locations"] == ["Hanford", "Santa Rosa", "Yuba City"]
    assert error["months"] == [f"2013-{month:02d}" for month in range(1, 13)]
    assert error["scenarios"] == ["Buy (5% down)", "Buy (10% down)", "Buy (20% down)"]
    assert error["columns"] == ["Total Monthly Payment", "Income Needed", "Share of Income", "Affordable Home Price"]
    assert "Mortgage Payment" not in error["columns"]
