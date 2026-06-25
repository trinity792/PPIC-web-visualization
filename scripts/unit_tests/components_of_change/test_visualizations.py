import pandas as pd

from scripts.components_of_change import visualizations


def _components_dataframe():
    return pd.DataFrame(
        {
            "Geographic Level": ["County", "County"],
            "Location": ["Alameda", "Alameda"],
            "Year": [2021, 2022],
            "Source": ["DoF", "DoF"],
            "Births": [10, 15],
            "Total Population": [100, 110],
        }
    )


def test_visualize_line_returns_figure_without_showing(monkeypatch):
    monkeypatch.setattr(visualizations, "build_components_dataset", lambda: {"dataframe": _components_dataframe()})

    fig = visualizations.visualize_line(["Alameda"], ["Births"], ["DoF"], 2021, 2022, show=False)

    assert len(fig.data) == 1
    assert fig.data[0].name == "Alameda - Births (DoF)"


def test_visualize_bar_returns_figure_without_showing(monkeypatch):
    monkeypatch.setattr(visualizations, "build_components_dataset", lambda: {"dataframe": _components_dataframe()})

    fig = visualizations.visualize_bar("Counties", "Births", "Numeric Change", 2021, 2022, "DoF", show=False)

    assert len(fig.data) == 1
    assert fig.layout.title.text == "Change in Births from 2021 to 2022"
