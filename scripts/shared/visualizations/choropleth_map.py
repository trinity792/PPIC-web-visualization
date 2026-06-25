"""
choropleth_map.py — builds generic Plotly choropleth maps for binned change metrics.

Data sources:
    - pandas.DataFrame inputs — computed change values by location
    - GeoJSON dicts — county, region, or state geometries

Outputs:
    - numpy.ndarray — computed bin edges
    - dict — dissolved region GeoJSON when geopandas is available
    - plotly.graph_objects.Figure — configured choropleth map

Usage:
    python scripts/shared/visualizations/choropleth_map.py

Test Folders:
    - scripts/unit_tests/shared/visualizations/
"""

import math

import numpy as np
import pandas as pd
import plotly.express as px

# ── Constants ─────────────────────────────────────────────────────────────────

SVG_EXPORT_CONFIG = {"toImageButtonOptions": {"format": "svg"}}

"""
========================================================================================================================
Choropleth Maps
========================================================================================================================
"""


def compute_bins(values, bins_range, num_bins):
    """Compute rounded choropleth bin edges. Test file: scripts/unit_tests/shared/visualizations/test_choropleth_map.py"""
    if num_bins < 1:
        raise ValueError("num_bins must be at least 1")
    if num_bins > 9:
        raise ValueError("Too many bins. Select a maximum of 9")
    numeric_values = pd.to_numeric(pd.Series(values), errors="coerce").dropna()
    if numeric_values.empty:
        raise ValueError("Cannot compute bins for empty values")
    if bins_range == "Default":
        minimum = numeric_values.min()
        maximum = numeric_values.max()
        if maximum == minimum:
            lower_bound = math.floor(minimum) - 1
            upper_bound = math.ceil(maximum) + 1
            return np.round(np.linspace(lower_bound, upper_bound, num_bins + 1), decimals=2)
        if maximum - minimum < num_bins:
            lower_bound = math.floor(minimum)
            upper_bound = math.ceil(maximum)
            return np.round(np.linspace(lower_bound, upper_bound, num_bins + 1), decimals=2)
        lower_bound = math.floor(minimum / num_bins) * num_bins
        upper_bound = math.ceil(maximum / num_bins) * num_bins
        return np.round(np.linspace(lower_bound, upper_bound, num_bins + 1))
    lower_bound, upper_bound = bins_range
    return np.linspace(lower_bound, upper_bound, num_bins + 1)


def ensure_bins_have_values(result, bin_edges):
    """Add synthetic blank rows so every configured bin appears in the legend. Test file: scripts/unit_tests/shared/visualizations/test_choropleth_map.py"""
    output = result.copy()
    for index in range(len(bin_edges) - 1):
        lower_edge = bin_edges[index]
        upper_edge = bin_edges[index + 1]
        in_bin = output.loc[(output["Change"] >= lower_edge) & (output["Change"] < upper_edge)]
        if in_bin.empty:
            output = pd.concat([output, pd.DataFrame({"Location": [np.nan], "Change": [(lower_edge + upper_edge) / 2]})], ignore_index=True)
    return output.reset_index(drop=True)


def dissolve_regions(counties_gdf, regions_mapping):
    """Dissolve county geometries into region GeoJSON. Test file: scripts/unit_tests/shared/visualizations/test_choropleth_map.py"""
    import geopandas as gpd

    region_frames = []
    for region_name, counties in regions_mapping.items():
        county_rows = counties_gdf.loc[counties_gdf["NAME"].isin(counties)]
        if county_rows.empty:
            continue
        region_frames.append(gpd.GeoDataFrame({"NAME": [region_name], "geometry": [county_rows.geometry.union_all()]}, crs=counties_gdf.crs))
    if not region_frames:
        return {"type": "FeatureCollection", "features": []}
    return pd.concat(region_frames, ignore_index=True).__geo_interface__


def _format_bin_range(bin_range):
    if pd.isna(bin_range):
        return None
    return f"{round(bin_range.left, 2)} to {round(bin_range.right, 2)}"


def _colors_for_bins(num_bins):
    colors = px.colors.sequential.Reds
    if num_bins == 2:
        selected = [colors[i] for i in [1, 5]]
    elif num_bins == 3:
        selected = [colors[i] for i in [1, 3, 5]]
    elif num_bins == 4:
        selected = [colors[i] for i in [1, 2, 3, 4]]
    elif num_bins == 5:
        selected = [colors[i] for i in [1, 2, 3, 4, 5]]
    else:
        selected = colors[:num_bins]
    selected.reverse()
    return selected


def build_choropleth(result, geojson, parameter, metric_of_change, start_year, end_year, bins_range, num_bins, subset, state_name_mapping=None):
    """Build a binned Plotly choropleth map. Test file: scripts/unit_tests/shared/visualizations/test_choropleth_map.py"""
    chart_data = result.copy()
    bin_edges = compute_bins(chart_data["Change"], bins_range, num_bins)
    chart_data = ensure_bins_have_values(chart_data, bin_edges)
    chart_data = chart_data.sort_values("Change", ascending=False).reset_index(drop=True)
    chart_data["binned_change"] = pd.cut(chart_data["Change"], bins=bin_edges, include_lowest=True, ordered=True).apply(_format_bin_range)
    colors = _colors_for_bins(num_bins)
    if subset == "States":
        chart_data["Location"] = chart_data["Location"].map(state_name_mapping or {}).fillna(chart_data["Location"])
        featureidkey = "properties.name"
        scope = "usa"
    else:
        featureidkey = "properties.NAME"
        scope = None
    fig = px.choropleth(data_frame=chart_data, geojson=geojson, locations="Location", featureidkey=featureidkey, color="binned_change", color_discrete_sequence=colors, scope=scope)
    if subset == "States":
        fig.update_layout(margin={"r": 500, "t": 50, "l": 50, "b": 50})
    else:
        fig.update_geos(fitbounds="locations", visible=False)
        fig.update_layout(margin={"r": 500, "t": 50, "l": 0, "b": 0})
    labels = [f"{bin_edges[index]:.0f}-{bin_edges[index + 1]:.0f}" for index in range(len(bin_edges) - 1)]
    fig.update_layout(coloraxis_colorbar={"title": None, "tickvals": bin_edges, "ticktext": labels, "len": 0.75, "tickmode": "array", "ticks": "outside"})
    if metric_of_change == "Total" and parameter in ["Net Migration", "Net Foreign Immigration", "Net Domestic Migration"]:
        title = f"{parameter} from {start_year} to {end_year}"
    elif metric_of_change == "Total":
        title = f"Total {parameter} from {start_year} to {end_year}"
    else:
        title = f"Change in {parameter} from {start_year} to {end_year}"
    fig.update_layout(title_text=title, title_font_size=24, height=500)
    return fig
