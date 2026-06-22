import pandas as pd
import pytest

from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.merging.historical_modern_merge import (
    filter_historical_years,
    load_historical_housing_data,
    merge_historical_and_modern_data,
    resolve_source_overlap,
)


def _canonical_row(location="Oakland", year=2020, source="DoF"):
    row = {column: 0 for column in get_schema_config()["output_columns"]}
    row.update(
        {
            "Geographic Level": "City",
            "Location": location,
            "Year": year,
            "Source": source,
        }
    )
    return row


def test_load_historical_housing_data_expected_schema(tmp_path):
    file_path = tmp_path / "historical.csv"
    pd.DataFrame([_canonical_row()]).to_csv(file_path, index=False)

    result = load_historical_housing_data(file_path)

    assert result.columns.tolist() == get_schema_config()["output_columns"]


def test_load_historical_housing_data_marks_e8_source(tmp_path):
    file_path = tmp_path / "historical.csv"
    pd.DataFrame([_canonical_row(source="DoF")]).to_csv(file_path, index=False)

    result = load_historical_housing_data(file_path)

    assert result["Source"].tolist() == ["E-8"]


def test_load_historical_housing_data_extra_columns(tmp_path):
    file_path = tmp_path / "historical.csv"
    dataframe = pd.DataFrame([_canonical_row()])
    dataframe["Dataset_Source"] = "2010-2020"
    dataframe.to_csv(file_path, index=False)

    result = load_historical_housing_data(file_path)

    assert "Dataset_Source" not in result.columns


def test_load_historical_housing_data_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="Historical data file not found"):
        load_historical_housing_data(tmp_path / "missing.csv")


def test_load_historical_housing_data_empty_file(tmp_path):
    file_path = tmp_path / "historical.csv"
    pd.DataFrame(columns=get_schema_config()["output_columns"]).to_csv(
        file_path, index=False
    )

    with pytest.raises(ValueError, match="Historical housing data is empty"):
        load_historical_housing_data(file_path)


def test_load_historical_housing_data_missing_required_column(tmp_path):
    file_path = tmp_path / "historical.csv"
    dataframe = pd.DataFrame([_canonical_row()]).drop(columns=["Vacant Units"])
    dataframe.to_csv(file_path, index=False)

    with pytest.raises(ValueError, match="missing required columns.*Vacant Units"):
        load_historical_housing_data(file_path)


def test_filter_historical_years_inclusive_boundary():
    dataframe = pd.DataFrame({"Year": [2019, "2020", 2021], "value": [1, 2, 3]})

    result = filter_historical_years(dataframe, max_year=2020)

    assert result["value"].tolist() == [1, 2]


def test_filter_historical_years_normalizes_year_dtype():
    dataframe = pd.DataFrame({"Year": ["2019", "2020"]})

    result = filter_historical_years(dataframe, max_year=2020)

    assert result["Year"].tolist() == [2019, 2020]


def test_filter_historical_years_invalid_year():
    dataframe = pd.DataFrame({"Year": [2020, "unknown"]})

    with pytest.raises(ValueError, match="invalid Year values"):
        filter_historical_years(dataframe, max_year=2020)


def test_filter_historical_years_missing_year_column():
    with pytest.raises(KeyError, match="missing column.*Year"):
        filter_historical_years(pd.DataFrame({"value": [1]}), max_year=2020)


def test_filter_historical_years_does_not_mutate_input():
    dataframe = pd.DataFrame({"Year": ["2020", "2021"]})

    filter_historical_years(dataframe, max_year=2020)

    assert dataframe["Year"].tolist() == ["2020", "2021"]


def test_merge_historical_and_modern_data_shared_schema():
    historical = pd.DataFrame(
        {"Location": ["Oakland"], "Year": [2019], "Source": ["E-8"]}
    )
    modern = pd.DataFrame(
        {"Source": ["E-5"], "Year": [2020], "Location": ["Oakland"]}
    )

    result = merge_historical_and_modern_data(historical, modern)

    assert result.to_dict("records") == [
        {"Location": "Oakland", "Year": 2019, "Source": "E-8"},
        {"Location": "Oakland", "Year": 2020, "Source": "E-5"},
    ]


def test_merge_historical_and_modern_data_schema_mismatch():
    historical = pd.DataFrame({"Location": ["Oakland"], "Year": [2019]})
    modern = pd.DataFrame({"Location": ["Oakland"], "Population": [1]})

    with pytest.raises(ValueError, match="Housing schemas do not match.*Year.*Population"):
        merge_historical_and_modern_data(historical, modern)


def test_merge_historical_and_modern_data_does_not_mutate_inputs():
    historical = pd.DataFrame({"Location": ["Oakland"], "Year": [2019]})
    modern = pd.DataFrame({"Year": [2020], "Location": ["Oakland"]})

    merge_historical_and_modern_data(historical, modern)

    assert historical.columns.tolist() == ["Location", "Year"]
    assert modern.columns.tolist() == ["Year", "Location"]


def test_resolve_source_overlap_priority():
    dataframe = pd.DataFrame(
        {
            "Location": ["Oakland", "Oakland"],
            "Geographic Level": ["City", "City"],
            "Year": [2020, 2020],
            "Total Population": [430_000, 440_000],
            "Source": ["E-8", "E-5"],
        }
    )

    result = resolve_source_overlap(
        dataframe,
        ["Location", "Geographic Level", "Year"],
        ["E-5", "E-8"],
    )

    assert result[["Source", "Total Population"]].to_dict("records") == [
        {"Source": "E-5", "Total Population": 440_000}
    ]


def test_resolve_source_overlap_same_source_keeps_first():
    dataframe = pd.DataFrame(
        {
            "Location": ["Oakland", "Oakland"],
            "Year": [2020, 2020],
            "value": [1, 2],
            "Source": ["E-5", "E-5"],
        }
    )

    result = resolve_source_overlap(
        dataframe, ["Location", "Year"], ["E-5", "E-8"]
    )

    assert result["value"].tolist() == [1]


def test_resolve_source_overlap_preserves_retained_row_order():
    dataframe = pd.DataFrame(
        {
            "Location": ["Berkeley", "Oakland", "Oakland", "Alameda"],
            "Year": [2020, 2020, 2020, 2020],
            "Source": ["E-8", "E-8", "E-5", "E-5"],
        }
    )

    result = resolve_source_overlap(
        dataframe, ["Location", "Year"], ["E-5", "E-8"]
    )

    assert result["Location"].tolist() == ["Berkeley", "Oakland", "Alameda"]


def test_resolve_source_overlap_unknown_source():
    dataframe = pd.DataFrame(
        {"Location": ["Oakland"], "Year": [2020], "Source": ["Unknown"]}
    )

    with pytest.raises(ValueError, match="source_priority does not include.*Unknown"):
        resolve_source_overlap(
            dataframe, ["Location", "Year"], ["E-5", "E-8"]
        )


def test_resolve_source_overlap_missing_key_column():
    dataframe = pd.DataFrame(
        {"Location": ["Oakland"], "Source": ["E-5"]}
    )

    with pytest.raises(KeyError, match="missing columns.*Year"):
        resolve_source_overlap(
            dataframe, ["Location", "Year"], ["E-5", "E-8"]
        )


def test_resolve_source_overlap_missing_source_column():
    dataframe = pd.DataFrame({"Location": ["Oakland"], "Year": [2020]})

    with pytest.raises(KeyError, match="missing column.*Source"):
        resolve_source_overlap(
            dataframe, ["Location", "Year"], ["E-5", "E-8"]
        )


def test_resolve_source_overlap_null_key():
    dataframe = pd.DataFrame(
        {"Location": [None], "Year": [2020], "Source": ["E-5"]}
    )

    with pytest.raises(ValueError, match="key columns contain null values.*Location"):
        resolve_source_overlap(
            dataframe, ["Location", "Year"], ["E-5", "E-8"]
        )


def test_resolve_source_overlap_duplicate_priority():
    dataframe = pd.DataFrame(
        {"Location": ["Oakland"], "Year": [2020], "Source": ["E-5"]}
    )

    with pytest.raises(ValueError, match="source_priority contains duplicates"):
        resolve_source_overlap(
            dataframe, ["Location", "Year"], ["E-5", "E-5"]
        )


def test_resolve_source_overlap_does_not_mutate_input():
    dataframe = pd.DataFrame(
        {"Location": ["Oakland"], "Year": [2020], "Source": ["E-5"]}
    )

    resolve_source_overlap(
        dataframe, ["Location", "Year"], ["E-5", "E-8"]
    )

    assert dataframe.columns.tolist() == ["Location", "Year", "Source"]
