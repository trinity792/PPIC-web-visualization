import pandas as pd

from scripts.shared.visualizations.bar_chart import build_bar_chart, compute_change_metric


def test_compute_change_metric_percent_change():
    dataframe = pd.DataFrame({"Location": ["A", "A"], "Year": [2020, 2021], "Births": [10, 15]})

    result = compute_change_metric(dataframe, "Births", "Percent Change", 2020, 2021)

    assert result.loc[0, "Change"] == 50


def test_compute_change_metric_total():
    dataframe = pd.DataFrame({"Location": ["A", "A", "A"], "Year": [2020, 2021, 2022], "Births": [1, 2, 3]})

    result = compute_change_metric(dataframe, "Births", "Total", 2020, 2022)

    assert result.loc[0, "Change"] == 6


def test_build_bar_chart_returns_plotly_figure():
    result = pd.DataFrame({"Location": ["CA", "A"], "Change": [10, 5]})

    fig = build_bar_chart(result, "Births", "Numeric Change", 2020, 2021, subset="Counties")

    assert len(fig.data) == 2
    assert fig.layout.title.text == "Change in Births from 2020 to 2021"
