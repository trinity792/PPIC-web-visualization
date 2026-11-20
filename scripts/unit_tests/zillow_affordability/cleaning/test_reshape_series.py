import pandas as pd
import pytest

from scripts.unit_tests.zillow_affordability.helpers import (
    BUY_MONTHS,
    RELEASE_DATE,
    RENT_MONTHS,
    make_raw_frame,
    write_raw_files,
)
from scripts.zillow_affordability.cleaning.reshape_series import (
    build_cleaned_dataset,
    melt_series,
    read_series_file,
    select_places,
)
from scripts.zillow_affordability.config.schemas import get_schema_config
from scripts.zillow_affordability.config.sources import get_source_config


def test_read_series_file_keeps_ids_and_month_columns(tmp_path):
    path = tmp_path / "series.csv"
    make_raw_frame("years_to_save", BUY_MONTHS).to_csv(path, index=False)

    frame = read_series_file(path)

    assert list(frame.columns[:5]) == ["RegionID", "SizeRank", "RegionName", "RegionType", "StateName"]
    assert list(frame.columns[5:]) == BUY_MONTHS


def test_read_series_file_rejects_a_file_missing_id_columns(tmp_path):
    path = tmp_path / "series.csv"
    make_raw_frame("years_to_save", BUY_MONTHS).drop(columns="RegionType").to_csv(path, index=False)

    with pytest.raises(ValueError, match="RegionType"):
        read_series_file(path)


def test_read_series_file_rejects_a_file_with_no_month_columns(tmp_path):
    path = tmp_path / "series.csv"
    make_raw_frame("years_to_save", []).to_csv(path, index=False)

    with pytest.raises(ValueError, match="month"):
        read_series_file(path)


def test_select_places_keeps_california_metros_and_the_us_only():
    raw = make_raw_frame("years_to_save", BUY_MONTHS)

    selected = select_places(raw, get_schema_config())

    assert len(selected) == 27
    assert "New York, NY" not in set(selected["RegionName"])
    assert "United States" in set(selected["RegionName"])


def test_melt_series_produces_grain_rows_with_plain_names_and_months():
    raw = make_raw_frame("years_to_save", BUY_MONTHS)
    selected = select_places(raw, get_schema_config())

    long_rows = melt_series(selected, "Years to Save", "Buy (20% down)", get_schema_config())

    assert list(long_rows.columns) == ["Geographic Level", "Location", "Date", "Housing Scenario", "Years to Save"]
    assert len(long_rows) == 27 * 3
    us = long_rows[long_rows["Location"] == "United States"]
    assert set(us["Geographic Level"]) == {"Nation"}
    assert set(long_rows.loc[long_rows["Location"] == "Fresno", "Geographic Level"]) == {"Metro"}
    assert sorted(us["Date"]) == ["2012-01", "2012-02", "2012-03"]


def test_melt_series_keeps_blank_values_blank_never_zero():
    raw = make_raw_frame("new_renter_affordability", RENT_MONTHS)
    raw.loc[raw["RegionName"] == "Fresno, CA", "2012-02-29"] = None
    selected = select_places(raw, get_schema_config())

    long_rows = melt_series(selected, "Share of Income", "Rent", get_schema_config())

    cell = long_rows[(long_rows["Location"] == "Fresno") & (long_rows["Date"] == "2012-02")]["Share of Income"]
    assert len(cell) == 1 and pd.isna(cell.item())


def test_build_cleaned_dataset_joins_all_series_onto_the_grain(tmp_path):
    files = write_raw_files(tmp_path)
    schema = get_schema_config()

    cleaned = build_cleaned_dataset(files, RELEASE_DATE, get_source_config(), schema)

    assert list(cleaned.columns) == schema["output_columns"]
    assert set(cleaned["Release Date"]) == {RELEASE_DATE}
    # 3 buy scenarios x 3 months + rent x 2 months, for 27 places
    assert len(cleaned) == 27 * (3 * 3 + 2)
    assert not cleaned.duplicated(schema["grain_keys"]).any()


def test_build_cleaned_dataset_blanks_measures_a_scenario_does_not_have(tmp_path):
    files = write_raw_files(tmp_path)
    schema = get_schema_config()

    cleaned = build_cleaned_dataset(files, RELEASE_DATE, get_source_config(), schema)

    for scenario, applicable in schema["applicable_measures"].items():
        rows = cleaned[cleaned["Housing Scenario"] == scenario]
        for column in schema["measure_columns"]:
            if column in applicable:
                assert rows[column].notna().all(), (scenario, column)
            else:
                assert rows[column].isna().all(), (scenario, column)


def test_build_cleaned_dataset_does_not_invent_rent_rows_before_the_renter_files_start(tmp_path):
    files = write_raw_files(tmp_path)

    cleaned = build_cleaned_dataset(files, RELEASE_DATE, get_source_config(), get_schema_config())

    rent_months = set(cleaned.loc[cleaned["Housing Scenario"] == "Rent", "Date"])
    assert rent_months == {"2012-02", "2012-03"}


def test_build_cleaned_dataset_keeps_source_precision(tmp_path):
    files = write_raw_files(tmp_path)
    raw = pd.read_csv(files["mortgage_payment_10"])
    source_value = raw.loc[raw["RegionName"] == "San Jose, CA", "2012-03-31"].item()

    cleaned = build_cleaned_dataset(files, RELEASE_DATE, get_source_config(), get_schema_config())

    row = cleaned[(cleaned["Location"] == "San Jose") & (cleaned["Date"] == "2012-03") & (cleaned["Housing Scenario"] == "Buy (10% down)")]
    assert row["Mortgage Payment"].item() == source_value


def test_build_cleaned_dataset_fails_when_one_series_is_missing_a_place(tmp_path):
    no_madera = make_raw_frame("years_to_save", BUY_MONTHS)
    no_madera = no_madera[no_madera["RegionName"] != "Madera, CA"]
    files = write_raw_files(tmp_path, overrides={"years_to_save": no_madera})

    with pytest.raises(ValueError, match="years_to_save.*Madera"):
        build_cleaned_dataset(files, RELEASE_DATE, get_source_config(), get_schema_config())
