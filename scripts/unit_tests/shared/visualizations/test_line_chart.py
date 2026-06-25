import pandas as pd

from scripts.shared.visualizations.line_chart import apply_indexing, build_line_chart


def test_apply_indexing_sets_baseline_to_100():
    dataframe = pd.DataFrame({"Location": ["A", "A"], "Year": [2020, 2021], "Source": ["DoF", "DoF"], "Births": [10, 20]})

    result = apply_indexing(dataframe, 2020)

    assert result.loc[result["Year"].eq(2020), "Births"].iloc[0] == 100
    assert result.loc[result["Year"].eq(2021), "Births"].iloc[0] == 200


def test_build_line_chart_adds_trace_per_source_location_parameter():
    dataframe = pd.DataFrame({"Location": ["A", "A"], "Year": [2020, 2021], "Source": ["DoF", "DoF"], "Births": [10, 20]})

    fig = build_line_chart(dataframe, ["A"], ["Births"], ["DoF"])

    assert len(fig.data) == 1
    assert fig.data[0].name == "A - Births (DoF)"
