import pandas as pd
import pytest

from scripts.pophousing.config.schemas import get_schema_config
from scripts.pophousing.output.finalize_dataset import (
    prepare_housing_output,
    write_housing_output,
)


def _output_dataframe():
    columns = get_schema_config()["output_columns"]
    rows = []
    for location, level, year, source in (
        ("Oakland", "City", 2021, "E-5"),
        ("Alameda", "County", 2020, "E-8"),
    ):
        row = {column: 0 for column in columns}
        row.update(
            {
                "Location": location,
                "Geographic Level": level,
                "Year": year,
                "Source": source,
            }
        )
        rows.append(row)
    return pd.DataFrame(rows)


def _prepare(dataframe):
    return prepare_housing_output(
        dataframe,
        output_columns=get_schema_config()["output_columns"],
        sort_columns=["Geographic Level", "Location", "Year"],
    )


def test_prepare_output_preserves_source_provenance():
    result = _prepare(_output_dataframe())

    # Per-row provenance flows through instead of being flattened to one literal (B3).
    by_location = dict(zip(result["Location"], result["Source"]))
    assert by_location == {"Oakland": "E-5", "Alameda": "E-8"}


def test_prepare_output_requires_source_column():
    dataframe = _output_dataframe().drop(columns=["Source"])

    with pytest.raises(ValueError, match="missing output columns.*Source"):
        _prepare(dataframe)


def test_prepare_output_column_order():
    dataframe = _output_dataframe()[list(reversed(_output_dataframe().columns))]

    result = _prepare(dataframe)

    assert result.columns.tolist() == get_schema_config()["output_columns"]


def test_prepare_output_drops_extra_columns():
    dataframe = _output_dataframe()
    dataframe["_temp_county"] = "Alameda"

    result = _prepare(dataframe)

    assert "_temp_county" not in result.columns


def test_prepare_output_missing_output_column():
    dataframe = _output_dataframe().drop(columns=["Vacant Units"])

    with pytest.raises(ValueError, match="missing output columns.*Vacant Units"):
        _prepare(dataframe)


def test_prepare_output_sort_order():
    result = _prepare(_output_dataframe())

    assert result[["Geographic Level", "Location"]].to_dict("records") == [
        {"Geographic Level": "City", "Location": "Oakland"},
        {"Geographic Level": "County", "Location": "Alameda"},
    ]


def test_prepare_output_year_as_string():
    result = _prepare(_output_dataframe())

    assert result["Year"].dtype.name == "string"


def test_prepare_output_invalid_year():
    dataframe = _output_dataframe()
    dataframe["Year"] = dataframe["Year"].astype("object")
    dataframe.loc[0, "Year"] = "unknown"

    with pytest.raises(ValueError, match="invalid Year values"):
        _prepare(dataframe)


def test_prepare_output_does_not_mutate_input():
    dataframe = _output_dataframe()
    original = dataframe.copy(deep=True)

    _prepare(dataframe)

    pd.testing.assert_frame_equal(dataframe, original)


def test_write_output_creates_file(tmp_path):
    output_path = tmp_path / "output.csv"

    write_housing_output(_prepare(_output_dataframe()), output_path)

    assert output_path.is_file()


def test_write_output_no_index(tmp_path):
    output_path = tmp_path / "output.csv"

    write_housing_output(_prepare(_output_dataframe()), output_path)

    assert not pd.read_csv(output_path).columns[0].startswith("Unnamed")


def test_write_output_roundtrip(tmp_path):
    output_path = tmp_path / "output.csv"
    dataframe = _prepare(_output_dataframe())

    write_housing_output(dataframe, output_path)

    pd.testing.assert_frame_equal(
        pd.read_csv(output_path, dtype={"Year": "string"}),
        dataframe,
        check_dtype=False,
    )


def test_write_output_creates_parent_directory(tmp_path):
    output_path = tmp_path / "nested" / "output.csv"

    write_housing_output(_prepare(_output_dataframe()), output_path)

    assert output_path.is_file()


def test_write_output_overwrites_existing(tmp_path):
    output_path = tmp_path / "output.csv"
    output_path.write_text("old content")

    write_housing_output(_prepare(_output_dataframe()), output_path)

    assert output_path.read_text() != "old content"
