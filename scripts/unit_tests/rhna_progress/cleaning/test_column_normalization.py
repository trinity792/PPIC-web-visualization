import pandas as pd
import pytest
from scripts.rhna_progress.cleaning.column_normalization import (
    normalize_columns,
    parse_planning_period,
    standardize_jurisdiction_names,
)

from scripts.unit_tests.rhna_progress.helpers import (
    raw_cycle_5_frame,
    raw_cycle_6_frame,
    schema_config,
)


def test_normalize_columns_handles_5th_cycle_shape_and_defaults_started():
    result = normalize_columns(raw_cycle_5_frame(), 5, schema_config())

    assert list(result["Jurisdiction"]) == ["ALAMEDA"]
    assert result.loc[0, "Cycle"] == 5
    assert bool(result.loc[0, "Cycle Started"]) is True
    assert result.loc[0, "Very Low Units"] == "267"
    assert result.loc[0, "Very Low RHNA"] == "444"
    assert result.loc[0, "Very Low Percent"] == "0.60"
    assert result.loc[0, "Above Moderate Units"] == "1968"
    assert result.loc[0, "Above Moderate RHNA"] == "748"
    assert result.loc[0, "Above Moderate Percent"] == "2.63"


def test_normalize_columns_handles_6th_cycle_shape_and_preserves_started_flag():
    source = raw_cycle_6_frame()
    source.loc[0, "6th Cycle Started"] = "FALSE"

    result = normalize_columns(source, 6, schema_config())

    assert result.loc[0, "Cycle"] == 6
    assert bool(result.loc[0, "Cycle Started"]) is False
    assert "6th Cycle Started" not in result.columns


def test_normalize_columns_raises_on_unexpected_column_set():
    source = raw_cycle_5_frame().drop(columns=["VLI UNITS"])

    with pytest.raises(ValueError, match="VLI UNITS"):
        normalize_columns(source, 5, schema_config())


def test_normalize_columns_does_not_mutate_input():
    source = raw_cycle_5_frame()
    original = source.copy(deep=True)

    normalize_columns(source, 5, schema_config())

    pd.testing.assert_frame_equal(source, original)


def test_standardize_jurisdiction_names_reconciles_against_crosswalk():
    source = pd.DataFrame(
        {
            "Jurisdiction": [" alameda ", "LOS ANGELES COUNTY", "SAN BUENAVENTURA"],
        }
    )
    crosswalk = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda", "Los Angeles County", "Ventura"],
            "Source Name": ["ALAMEDA", "LOS ANGELES COUNTY", "SAN BUENAVENTURA"],
        }
    )

    result = standardize_jurisdiction_names(source, {"jurisdiction_crosswalk": crosswalk})

    assert result["Jurisdiction"].tolist() == [
        "Alameda",
        "Los Angeles County",
        "Ventura",
    ]


def test_standardize_jurisdiction_names_fails_loud_on_unknown_name():
    source = pd.DataFrame({"Jurisdiction": ["NEWLY INCORPORATED CITY"]})
    crosswalk = pd.DataFrame({"Jurisdiction": ["Alameda"]})

    with pytest.raises(ValueError, match="NEWLY INCORPORATED CITY"):
        standardize_jurisdiction_names(source, {"jurisdiction_crosswalk": crosswalk})


def test_parse_planning_period_splits_valid_ranges_and_preserves_source_text():
    source = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda"],
            "Planning Period": ["01/31/2015 - 01/31/2023"],
        }
    )

    clean, quarantined = parse_planning_period(source)

    assert quarantined.empty
    assert clean.loc[0, "Planning Period"] == "01/31/2015 - 01/31/2023"
    assert clean.loc[0, "Planning Period Start"] == pd.Timestamp("2015-01-31")
    assert clean.loc[0, "Planning Period End"] == pd.Timestamp("2023-01-31")


def test_parse_planning_period_quarantines_bad_ranges_without_null_dates():
    source = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda", "Broken City"],
            "Planning Period": [
                "01/31/2015 - 01/31/2023",
                "not a date range",
            ],
        }
    )

    clean, quarantined = parse_planning_period(source)

    assert clean["Jurisdiction"].tolist() == ["Alameda"]
    assert clean["Planning Period Start"].notna().all()
    assert quarantined["Jurisdiction"].tolist() == ["Broken City"]
    assert "parse" in quarantined.loc[quarantined.index[0], "Quarantine Reason"].lower()
