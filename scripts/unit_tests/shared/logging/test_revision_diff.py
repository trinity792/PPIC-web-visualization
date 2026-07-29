import json

import numpy as np
import pandas as pd

from scripts.shared.logging.revision_diff import (
    diff_revisions,
    format_revision_summary,
    has_revisions,
)

KEY_COLUMNS = ["Location", "Year", "Source"]


def _frame(rows):
    return pd.DataFrame(rows, columns=["Location", "Year", "Source", "Births", "Deaths"])


def _baseline():
    return _frame(
        [
            ["Fresno County", 2023, "DoF", 12400.0, 8000.0],
            ["Kern County", 2023, "DoF", 9880.0, 6000.0],
        ]
    )


def test_identical_frames_report_no_revisions():
    # Arrange
    saved = _baseline()
    new = _baseline()

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["changed_cells"] == 0
    assert diff["changed_periods"] == []
    assert diff["sample"] == []
    assert has_revisions(diff) is False


def test_revised_value_is_reported_with_old_and_new():
    # Arrange
    saved = _baseline()
    new = _baseline()
    new.loc[0, "Births"] = 12180.0

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["changed_cells"] == 1
    assert diff["changed_periods"] == [2023]
    assert diff["sample"] == [
        {"key": "Fresno County|2023|DoF", "column": "Births", "old": 12400.0, "new": 12180.0}
    ]


def test_added_period_counts_as_addition_not_revision():
    # Arrange
    saved = _baseline()
    new = pd.concat([_baseline(), _frame([["Fresno County", 2024, "DoF", 12500.0, 8100.0]])], ignore_index=True)

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["added_periods"] == [2024]
    assert diff["added_keys"] == 1
    assert diff["changed_cells"] == 0
    assert has_revisions(diff) is False


def test_removed_key_is_reported():
    # Arrange
    saved = _baseline()
    new = _baseline().iloc[:1].copy()

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["removed_keys"] == 1
    assert diff["removed_periods"] == [2023]
    assert has_revisions(diff) is True


def test_null_on_both_sides_is_not_a_change():
    # Arrange
    saved = _baseline()
    saved.loc[0, "Births"] = np.nan
    new = _baseline()
    new.loc[0, "Births"] = pd.NA

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["changed_cells"] == 0


def test_null_on_one_side_is_a_change():
    # Arrange
    saved = _baseline()
    new = _baseline()
    new.loc[0, "Births"] = np.nan

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["changed_cells"] == 1
    assert diff["sample"][0]["new"] is None
    assert diff["sample"][0]["old"] == 12400.0


def test_float_noise_below_tolerance_is_not_a_revision():
    # Arrange
    saved = _baseline()
    new = _baseline()
    new.loc[0, "Births"] = 12400.0 + 1e-12

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["changed_cells"] == 0


def test_non_numeric_change_is_detected():
    # Arrange
    saved = _baseline()
    saved["Note"] = ["provisional", "final"]
    new = _baseline()
    new["Note"] = ["final", "final"]

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    assert diff["changed_cells"] == 1
    assert diff["sample"][0]["column"] == "Note"
    assert diff["sample"][0]["old"] == "provisional"


def test_sample_is_capped_and_flags_truncation():
    # Arrange
    rows = [[f"County {index}", 2023, "DoF", 1000.0, 500.0] for index in range(30)]
    saved = _frame(rows)
    new = _frame([[row[0], row[1], row[2], row[3] + 100.0, row[4]] for row in rows])

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year", sample_limit=5)

    # Assert
    assert diff["changed_cells"] == 30
    assert len(diff["sample"]) == 5
    assert diff["truncated"] is True


def test_sample_is_ranked_by_relative_magnitude():
    # Arrange
    saved = _frame(
        [
            ["Small County", 2023, "DoF", 100.0, 10.0],
            ["Large County", 2023, "DoF", 100000.0, 10.0],
        ]
    )
    new = _frame(
        [
            ["Small County", 2023, "DoF", 200.0, 10.0],  # +100%
            ["Large County", 2023, "DoF", 100500.0, 10.0],  # +0.5%
        ]
    )

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year", sample_limit=2)

    # Assert
    assert diff["sample"][0]["key"].startswith("Small County")


def test_result_is_json_serializable_with_numpy_dtypes():
    # Arrange — numpy scalars would otherwise collapse the block into a string via _json_safe
    saved = _baseline().astype({"Year": "int64", "Births": "float64"})
    new = saved.copy()
    new.loc[0, "Births"] = np.float64(12180.0)

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    encoded = json.dumps(diff)
    assert "12180" in encoded
    assert isinstance(diff["changed_periods"][0], int)


def test_float_year_keys_and_periods_drop_the_decimal():
    # Modules normalize Year to float64 for null-safe comparison; the log must still read
    # "Fresno County|2023|DoF" and period 2023, not 2023.0.
    saved = _baseline().astype({"Year": "float64"})
    new = saved.copy()
    new.loc[0, "Births"] = 12180.0

    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    assert diff["changed_periods"] == [2023]
    assert diff["sample"][0]["key"] == "Fresno County|2023|DoF"


def test_boolean_columns_compare_without_raising():
    # numpy refuses to subtract bool arrays, so a bool contract column (RHNA's
    # "Most Recent") would otherwise blow up the ranking step.
    saved = _baseline()
    saved["Most Recent"] = [True, True]
    new = _baseline()
    new["Most Recent"] = [False, True]

    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    assert diff["changed_cells"] == 1
    assert diff["sample"][0]["column"] == "Most Recent"
    assert diff["sample"][0]["old"] is True
    assert diff["sample"][0]["new"] is False


def test_inputs_are_not_mutated():
    # Arrange
    saved = _baseline()
    new = _baseline()
    new.loc[0, "Births"] = 12180.0
    saved_before = saved.copy()
    new_before = new.copy()

    # Act
    diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Assert
    pd.testing.assert_frame_equal(saved, saved_before)
    pd.testing.assert_frame_equal(new, new_before)


def test_empty_frames_return_zero_diff():
    # Arrange
    empty = pd.DataFrame()

    # Act
    diff = diff_revisions(empty, empty, KEY_COLUMNS, "Year")

    # Assert
    assert diff["changed_cells"] == 0
    assert diff["added_keys"] == 0


def test_cold_start_against_empty_saved_frame_reports_additions_only():
    # Arrange
    new = _baseline()

    # Act
    diff = diff_revisions(new, pd.DataFrame(), KEY_COLUMNS, "Year")

    # Assert
    assert diff["added_keys"] == 2
    assert diff["changed_cells"] == 0


def test_value_columns_restricts_the_comparison():
    # Arrange
    saved = _baseline()
    new = _baseline()
    new.loc[0, "Births"] = 12180.0
    new.loc[0, "Deaths"] = 8100.0

    # Act
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year", value_columns=["Deaths"])

    # Assert
    assert diff["changed_cells"] == 1
    assert diff["sample"][0]["column"] == "Deaths"


def test_format_revision_summary_renders_a_human_line():
    # Arrange
    saved = _baseline()
    new = _baseline()
    new.loc[0, "Births"] = 12180.0
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    # Act
    message = format_revision_summary(diff)

    # Assert
    assert "1 cells revised" in message
    assert "Fresno County|2023|DoF Births 12400.0 -> 12180.0" in message


def test_format_revision_summary_collapses_a_long_period_span():
    # A wholesale vintage restatement touches every year of the horizon; the log line must
    # summarize the span rather than naming all of them.
    rows = [["County A", year, "DoF", 100.0, 50.0] for year in range(2020, 2071)]
    saved = _frame(rows)
    new = _frame([[row[0], row[1], row[2], 200.0, row[4]] for row in rows])
    diff = diff_revisions(new, saved, KEY_COLUMNS, "Year")

    message = format_revision_summary(diff)

    assert "periods 2020-2070 (51 periods)" in message
    assert "2035" not in message


def test_format_revision_summary_is_none_when_nothing_changed():
    # Arrange
    diff = diff_revisions(_baseline(), _baseline(), KEY_COLUMNS, "Year")

    # Act / Assert
    assert format_revision_summary(diff) is None
