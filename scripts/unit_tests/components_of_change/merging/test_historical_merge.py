import numpy as np
import pandas as pd
import pytest

from scripts.components_of_change.merging.historical_merge import (
    combine_history_sources,
    combine_source_with_historical,
    detect_new_source_data,
    load_canonical_dataset,
    load_historical_baseline,
    merge_dof_and_census,
    summarize_source_revisions,
)


def _row(location, year, source, population):
    return {
        "Geographic Level": "County",
        "Location": location,
        "Year": year,
        "Total Population": population,
        "Percent Change in Population": None,
        "Numeric Change in Population": None,
        "Births": 1,
        "Deaths": 1,
        "Natural Increase": 0,
        "Net Migration": 0,
        "Net Foreign Immigration": 0,
        "Net Domestic Migration": 0,
        "Crude Birth Rate": 1,
        "Crude Death Rate": 1,
        "Crude Migration Rate": 0,
        "Crude Domestic Migration Rate": 0,
        "Crude Foreign Migration Rate": 0,
        "Source": source,
    }


def test_combine_source_with_historical_keeps_absent_years_and_recalculates_change():
    historical = pd.DataFrame([_row("Alameda", 2020, "DoF", 100), _row("Alameda", 2021, "DoF", 110)])
    new = pd.DataFrame([_row("Alameda", 2021, "DoF", 120), _row("Alameda", 2022, "DoF", 150)]).drop(columns=["Geographic Level"])

    result = combine_source_with_historical(new, historical, "DoF", "Year")

    assert result["Year"].tolist() == [2020, 2021, 2022]
    assert result.loc[result["Year"].eq(2021), "Numeric Change in Population"].iloc[0] == 20


def test_detect_new_source_data_ignores_boundary_year():
    historical = pd.DataFrame([_row("Alameda", 1990, "DoF", 90), _row("Alameda", 1991, "DoF", 100)])
    new = historical.drop(columns=["Geographic Level"]).copy()
    new.loc[new["Year"].eq(1990), "Total Population"] = 999

    assert detect_new_source_data(new, historical, "DoF", 1990) is False


def test_detect_new_source_data_ignores_row_order():
    historical = pd.DataFrame([_row("Contra Costa", 2021, "DoF", 200), _row("Alameda", 2021, "DoF", 100)])
    new = historical.drop(columns=["Geographic Level"]).sort_values("Location").reset_index(drop=True)

    assert detect_new_source_data(new, historical, "DoF", 1990) is False


def test_detect_new_source_data_treats_na_and_nan_as_equal():
    # Freshly cleaned data uses nullable Float64 (missing = pd.NA); the reloaded
    # canonical CSV uses numpy float64 (missing = np.nan). Identical data must not
    # be reported as a change just because of that representation difference.
    historical = pd.DataFrame([_row("Alameda", 2020, "DoF", 100), _row("Alameda", 2021, "DoF", 110)])
    historical["Percent Change in Population"] = np.nan  # numpy float64 nan, as after a CSV round-trip
    new = historical.drop(columns=["Geographic Level"]).copy()
    new["Percent Change in Population"] = new["Percent Change in Population"].astype("Float64")  # pd.NA

    assert new["Percent Change in Population"].isna().all()
    assert detect_new_source_data(new, historical, "DoF", 1990) is False


def test_detect_new_source_data_survives_a_cold_start():
    # A cold start hands in an empty frame with no columns; that must read as "all new"
    # rather than raising KeyError on the Source lookup and failing Phase 4.
    new = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)]).drop(columns=["Geographic Level"])

    assert detect_new_source_data(new, pd.DataFrame(), "DoF", 1990) is True


def test_summarize_source_revisions_reports_a_revised_value():
    # Arrange: 2021 is restated, so whole-year replacement overwrites the saved figure.
    historical = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)])
    new = historical.drop(columns=["Geographic Level"]).copy()
    new.loc[new["Year"].eq(2021), "Births"] = 5

    # Act
    diff = summarize_source_revisions(new, historical, "DoF", 1990)

    # Assert
    assert diff["changed_cells"] == 1
    assert diff["changed_periods"] == [2021]
    assert diff["sample"][0]["column"] == "Births"
    assert diff["sample"][0]["old"] == 1
    assert diff["sample"][0]["new"] == 5


def test_summarize_source_revisions_separates_a_new_year_from_a_revision():
    # Arrange: 2022 is genuinely new; nothing already published changed.
    historical = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)])
    new = pd.DataFrame(
        [_row("Alameda", 2021, "DoF", 100), _row("Alameda", 2022, "DoF", 110)]
    ).drop(columns=["Geographic Level"])

    # Act
    diff = summarize_source_revisions(new, historical, "DoF", 1990)

    # Assert
    assert diff["added_periods"] == [2022]
    assert diff["changed_cells"] == 0
    assert diff["changed_periods"] == []


def test_summarize_source_revisions_is_quiet_when_nothing_changed():
    historical = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)])
    new = historical.drop(columns=["Geographic Level"]).copy()

    diff = summarize_source_revisions(new, historical, "DoF", 1990)

    assert diff["changed_cells"] == 0
    assert diff["added_keys"] == 0
    assert diff["sample"] == []


def test_summarize_source_revisions_agrees_with_the_change_flag():
    # The diff must describe the same comparison the detector ran, or the log would
    # explain a different run than the one that saved.
    historical = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)])
    new = historical.drop(columns=["Geographic Level"]).copy()
    new.loc[new["Year"].eq(2021), "Births"] = 7

    assert detect_new_source_data(new, historical, "DoF", 1990) is True
    assert summarize_source_revisions(new, historical, "DoF", 1990)["changed_cells"] == 1


def test_summarize_source_revisions_excludes_the_boundary_year():
    # The detector ignores the boundary year, so the diff must too — otherwise a run
    # could report revised cells while the flag says nothing changed.
    historical = pd.DataFrame([_row("Alameda", 1990, "DoF", 90), _row("Alameda", 1991, "DoF", 100)])
    new = historical.drop(columns=["Geographic Level"]).copy()
    new.loc[new["Year"].eq(1990), "Births"] = 99

    assert detect_new_source_data(new, historical, "DoF", 1990) is False
    assert summarize_source_revisions(new, historical, "DoF", 1990)["changed_cells"] == 0


def test_summarize_source_revisions_on_cold_start_reports_additions_only():
    new = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)]).drop(columns=["Geographic Level"])

    diff = summarize_source_revisions(new, pd.DataFrame(), "DoF", 1990)

    assert diff["added_keys"] == 1
    assert diff["changed_cells"] == 0


def test_combine_source_with_historical_deduplicates_saved_history():
    # Arrange: the saved CSV carries a legacy duplicate (Alameda 2020) that would
    # otherwise wedge the merge's uniqueness guard forever (guide B8).
    historical = pd.DataFrame(
        [_row("Alameda", 2020, "DoF", 100), _row("Alameda", 2020, "DoF", 999)]
    )
    new = pd.DataFrame([_row("Alameda", 2021, "DoF", 120)]).drop(columns=["Geographic Level"])

    result = combine_source_with_historical(new, historical, "DoF", "Year")

    assert list(result["Year"]) == [2020, 2021]
    assert (result["Year"] == 2020).sum() == 1


def test_combine_source_with_historical_handles_empty_history():
    # Arrange: cold start — no saved history at all.
    new = pd.DataFrame([_row("Alameda", 2021, "DoF", 120)]).drop(columns=["Geographic Level"])

    result = combine_source_with_historical(new, pd.DataFrame(), "DoF", "Year")

    assert result["Year"].tolist() == [2021]
    assert (result["Source"] == "DoF").all()


def test_load_canonical_dataset_missing_file_returns_empty(tmp_path):
    # Arrange / Act: a missing canonical CSV must not crash Phase 1, and must warn
    # loudly (guide A1).
    with pytest.warns(UserWarning, match="proceeding on live data only"):
        result = load_canonical_dataset(tmp_path / "does_not_exist.csv")

    # Assert
    assert result.empty


def test_load_historical_baseline_absent_returns_empty(tmp_path):
    assert load_historical_baseline(None).empty
    assert load_historical_baseline(tmp_path / "missing.csv").empty


def test_combine_history_sources_prefers_current_over_seed():
    # Arrange: the seed supplies a deep year the current output lacks; the current
    # output wins where both cover the same key.
    seed = pd.DataFrame([_row("Alameda", 1991, "DoF", 50), _row("Alameda", 2020, "DoF", 111)])
    current = pd.DataFrame([_row("Alameda", 2020, "DoF", 222), _row("Alameda", 2021, "DoF", 260)])

    result = combine_history_sources(seed, current)

    assert set(result["Year"]) == {1991, 2020, 2021}
    kept_2020 = result.loc[result["Year"].eq(2020), "Total Population"].iloc[0]
    assert kept_2020 == 222  # current output preferred over seed


def test_merge_dof_and_census_rejects_duplicates():
    dof = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)]).drop(columns=["Geographic Level"])
    census = pd.DataFrame([_row("Alameda", 2021, "DoF", 100)]).drop(columns=["Geographic Level"])

    try:
        merge_dof_and_census(dof, census)
    except ValueError as error:
        assert "duplicate" in str(error)
    else:
        raise AssertionError("Expected duplicate rows to raise")
