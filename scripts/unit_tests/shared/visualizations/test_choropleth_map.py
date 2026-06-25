import pandas as pd

from scripts.shared.visualizations.choropleth_map import build_choropleth, compute_bins, ensure_bins_have_values


def test_compute_bins_default_rounds_to_requested_count():
    result = compute_bins(pd.Series([1, 9]), "Default", 4)

    assert len(result) == 5


def test_ensure_bins_have_values_adds_blank_rows_for_empty_bins():
    result = ensure_bins_have_values(pd.DataFrame({"Location": ["A"], "Change": [1]}), [0, 2, 4])

    assert len(result) == 2
    assert result["Location"].isna().sum() == 1


def test_build_choropleth_returns_figure():
    geojson = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"NAME": "A"}, "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}}]}
    result = pd.DataFrame({"Location": ["A"], "Change": [1]})

    fig = build_choropleth(result, geojson, "Births", "Numeric Change", 2020, 2021, "Default", 2, "Counties")

    assert fig.layout.title.text == "Change in Births from 2020 to 2021"
