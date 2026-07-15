import pandas as pd

from scripts.building_permits.merging.historical_merge import (
    combine_with_historical,
    compose_baseline,
    detect_new_data,
    latest_stored_month,
    load_canonical_dataset,
    load_historical_baseline,
)

CONTRACT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Date",
    "Total",
    "1 Unit",
    "2 Units",
    "3 and 4 Units",
    "5 Units or More",
]


def _row(
    date="2026-05",
    level="State",
    location="California",
    total=100,
):
    return {
        "Geographic Level": level,
        "Location": location,
        "Date": date,
        "Total": total,
        "1 Unit": 60,
        "2 Units": 5,
        "3 and 4 Units": 10,
        "5 Units or More": 25,
    }


def test_load_canonical_dataset_missing_file_returns_empty_contract(tmp_path):
    result = load_canonical_dataset(tmp_path / "missing.csv")

    assert result.empty
    assert list(result.columns) == CONTRACT_COLUMNS


def test_load_canonical_dataset_reads_saved_rows(tmp_path):
    path = tmp_path / "BuildingPermits_Current.csv"
    expected = pd.DataFrame(
        [
            _row(),
            _row(level="Metro", location="Bakersfield", total=20),
        ]
    )
    expected.to_csv(path, index=False)

    result = load_canonical_dataset(path)

    pd.testing.assert_frame_equal(result, expected)


def test_latest_stored_month_returns_none_for_empty_frame():
    historical = pd.DataFrame(columns=CONTRACT_COLUMNS)

    assert latest_stored_month(historical, "Date") is None


def test_latest_stored_month_returns_newest_unsorted_month():
    historical = pd.DataFrame(
        [
            _row(date="2025-12"),
            _row(date="2026-05"),
            _row(date="2026-02"),
        ]
    )

    assert latest_stored_month(historical, "Date") == "2026-05"


def test_combine_with_historical_preserves_non_overlapping_months():
    historical = pd.DataFrame(
        [
            _row(date="2026-02"),
            _row(date="2026-03"),
        ]
    )
    incoming = pd.DataFrame([_row(date="2026-04")])

    result = combine_with_historical(incoming, historical, "Date")

    assert result["Date"].tolist() == ["2026-02", "2026-03", "2026-04"]


def test_combine_with_historical_replaces_overlapping_month_atomically():
    historical = pd.DataFrame(
        [
            _row(date="2026-04", total=90),
            _row(date="2026-05", location="California", total=100),
            _row(
                date="2026-05",
                level="Metro",
                location="Bakersfield",
                total=20,
            ),
        ]
    )
    incoming = pd.DataFrame(
        [_row(date="2026-05", location="Texas", total=200)]
    )

    result = combine_with_historical(incoming, historical, "Date")
    may_rows = result.loc[result["Date"].eq("2026-05")]

    assert may_rows["Location"].tolist() == ["Texas"]
    assert may_rows["Total"].tolist() == [200]
    assert "California" not in set(may_rows["Location"])
    assert "Bakersfield" not in set(may_rows["Location"])
    assert result.loc[result["Date"].eq("2026-04"), "Total"].item() == 90


def test_combine_with_historical_replaces_every_incoming_month_as_a_whole():
    historical = pd.DataFrame(
        [
            _row(date="2026-03", location="California"),
            _row(date="2026-04", location="California"),
            _row(date="2026-05", location="California"),
        ]
    )
    incoming = pd.DataFrame(
        [
            _row(date="2026-03", location="Texas"),
            _row(date="2026-04", location="Oregon"),
        ]
    )

    result = combine_with_historical(incoming, historical, "Date")

    assert result.groupby("Date")["Location"].apply(set).to_dict() == {
        "2026-03": {"Texas"},
        "2026-04": {"Oregon"},
        "2026-05": {"California"},
    }


def test_combine_with_historical_sorts_contract_grain():
    historical = pd.DataFrame(
        [
            _row(
                date="2026-05",
                level="State",
                location="Texas",
            ),
            _row(
                date="2026-05",
                level="Metro",
                location="San Francisco",
            ),
        ]
    )
    incoming = pd.DataFrame(
        [
            _row(
                date="2026-04",
                level="State",
                location="California",
            ),
            _row(
                date="2026-05",
                level="Metro",
                location="Bakersfield",
            ),
            _row(
                date="2026-05",
                level="State",
                location="California",
            ),
        ]
    )

    result = combine_with_historical(incoming, historical, "Date")

    assert list(
        result[["Date", "Geographic Level", "Location"]].itertuples(
            index=False,
            name=None,
        )
    ) == [
        ("2026-04", "State", "California"),
        ("2026-05", "Metro", "Bakersfield"),
        ("2026-05", "State", "California"),
    ]


def test_combine_with_historical_empty_new_data_preserves_history():
    historical = pd.DataFrame(
        [
            _row(date="2026-04"),
            _row(date="2026-05"),
        ]
    )
    incoming = pd.DataFrame(columns=CONTRACT_COLUMNS)

    result = combine_with_historical(incoming, historical, "Date")

    pd.testing.assert_frame_equal(
        result.reset_index(drop=True),
        historical.reset_index(drop=True),
    )


def test_combine_with_historical_does_not_mutate_inputs():
    historical = pd.DataFrame([_row(date="2026-04")])
    incoming = pd.DataFrame([_row(date="2026-05")])
    original_historical = historical.copy(deep=True)
    original_incoming = incoming.copy(deep=True)

    combine_with_historical(incoming, historical, "Date")

    pd.testing.assert_frame_equal(historical, original_historical)
    pd.testing.assert_frame_equal(incoming, original_incoming)


def test_detect_new_data_returns_false_for_identical_data():
    historical = pd.DataFrame(
        [
            _row(),
            _row(level="Metro", location="Bakersfield"),
        ]
    )
    merged = historical.copy(deep=True)

    assert detect_new_data(merged, historical) is False


def test_detect_new_data_ignores_row_order_and_index():
    historical = pd.DataFrame(
        [
            _row(),
            _row(level="Metro", location="Bakersfield"),
        ]
    )
    merged = historical.iloc[::-1].copy()
    merged.index = [10, 20]

    assert detect_new_data(merged, historical) is False


def test_detect_new_data_returns_true_for_changed_value():
    historical = pd.DataFrame([_row(total=100)])
    merged = pd.DataFrame([_row(total=101)])

    assert detect_new_data(merged, historical) is True


def test_detect_new_data_returns_true_for_added_row():
    historical = pd.DataFrame([_row()])
    merged = pd.DataFrame(
        [
            _row(),
            _row(level="Metro", location="Bakersfield"),
        ]
    )

    assert detect_new_data(merged, historical) is True


def test_detect_new_data_treats_missing_current_as_new():
    candidate = pd.DataFrame([_row()])

    assert detect_new_data(candidate, pd.DataFrame(columns=CONTRACT_COLUMNS)) is True


def test_detect_new_data_survives_int_vs_csv_dtype_round_trip(tmp_path):
    # The candidate carries freshly built int measures; the reloaded current file may
    # infer a different-but-equal numeric dtype. The serialized-CSV comparison must not
    # report a spurious change (guide A7).
    candidate = pd.DataFrame([_row(), _row(level="Metro", location="Bakersfield")])
    path = tmp_path / "BuildingPermits_Current.csv"
    from scripts.building_permits.output.finalize_dataset import prepare_output

    prepared = prepare_output(candidate, {"output_columns": CONTRACT_COLUMNS})
    prepared.to_csv(path, index=False)
    reloaded = pd.read_csv(path)

    assert detect_new_data(prepared, reloaded) is False


def test_load_historical_baseline_missing_file_returns_empty_contract(tmp_path):
    result = load_historical_baseline(tmp_path / "missing.csv")

    assert result.empty
    assert list(result.columns) == CONTRACT_COLUMNS


def test_load_historical_baseline_reads_seed_rows(tmp_path):
    path = tmp_path / "BuildingPermits_Historical.csv"
    seed = pd.DataFrame([_row(date="2010-01"), _row(date="2010-02")])
    seed.to_csv(path, index=False)

    result = load_historical_baseline(path)

    pd.testing.assert_frame_equal(result, seed)


def test_compose_baseline_prefers_live_rows_on_overlap():
    baseline = pd.DataFrame([_row(date="2023-12", total=1), _row(date="2024-01", total=1)])
    current = pd.DataFrame([_row(date="2024-01", total=999)])

    result = compose_baseline(baseline, current)

    # Seed supplies the deep 2023-12 month; the live 2024-01 row wins the overlap.
    assert result.loc[result["Date"].eq("2023-12"), "Total"].item() == 1
    assert result.loc[result["Date"].eq("2024-01"), "Total"].item() == 999


def test_compose_baseline_recovers_deep_history_when_current_is_truncated():
    baseline = pd.DataFrame([_row(date="2010-01"), _row(date="2010-02")])
    current = pd.DataFrame(columns=CONTRACT_COLUMNS)

    result = compose_baseline(baseline, current)

    assert sorted(result["Date"].unique()) == ["2010-01", "2010-02"]


def test_compose_baseline_empty_inputs_returns_empty_contract():
    result = compose_baseline(
        pd.DataFrame(columns=CONTRACT_COLUMNS),
        pd.DataFrame(columns=CONTRACT_COLUMNS),
    )

    assert result.empty
    assert list(result.columns) == CONTRACT_COLUMNS
