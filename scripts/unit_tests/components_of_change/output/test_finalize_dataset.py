import pandas as pd

from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography
from scripts.components_of_change.output.finalize_dataset import assign_geographic_level, prepare_components_output, write_components_output


def test_assign_geographic_level_classifies_state_region_county_and_other():
    dataframe = pd.DataFrame({"Location": ["CA", "Bay Area", "Alameda", "Unknown"], "Year": [2020, 2020, 2020, 2020]})

    result = assign_geographic_level(dataframe, get_components_geography())

    assert result["Geographic Level"].tolist() == ["State", "Region", "County", "Other"]
    assert result.columns[0] == "Geographic Level"


def test_prepare_components_output_orders_and_sorts_columns():
    columns = get_columns_config()["output_columns"]
    first_row = {column: 1 for column in columns}
    first_row.update({"Geographic Level": "County", "Location": "B", "Source": "DoF", "Year": 2021})
    second_row = {column: 2 for column in columns}
    second_row.update({"Geographic Level": "County", "Location": "A", "Source": "DoF", "Year": 2020})
    dataframe = pd.DataFrame([first_row, second_row])

    result = prepare_components_output(dataframe, columns)

    assert result.columns.tolist() == columns
    assert result["Location"].tolist() == ["A", "B"]


def test_write_components_output_is_atomic(tmp_path):
    output_path = tmp_path / "components.csv"
    dataframe = pd.DataFrame({"Location": ["CA"]})

    result = write_components_output(dataframe, output_path)

    assert result == output_path
    assert output_path.read_text().startswith("Location")
