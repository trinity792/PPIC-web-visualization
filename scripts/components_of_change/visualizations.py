"""
visualizations.py — provides notebook-facing Components of Change chart wrappers.

Data sources:
    - scripts.orchestrators.components_of_change_pipeline — canonical Components dataset builder
    - data/data-raw/components-of-change/*.geojson|*.json — optional map geometry files

Outputs:
    - plotly.graph_objects.Figure — line, bar, or choropleth chart figures

Usage:
    python scripts/components_of_change/visualizations.py

Test Folders:
    - scripts/unit_tests/components_of_change/
"""

import json

from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography
from scripts.components_of_change.config.paths import get_paths
from scripts.components_of_change.validation.input_validators import expand_locations, locations_for_subset, validate_locations, validate_metric_of_change, validate_parameters, validate_source, validate_subset, validate_year_bounds
from scripts.orchestrators.components_of_change_pipeline import build_components_dataset
from scripts.shared.visualizations.bar_chart import SVG_EXPORT_CONFIG as BAR_EXPORT_CONFIG
from scripts.shared.visualizations.bar_chart import build_bar_chart, compute_change_metric
from scripts.shared.visualizations.choropleth_map import SVG_EXPORT_CONFIG as MAP_EXPORT_CONFIG
from scripts.shared.visualizations.choropleth_map import build_choropleth, dissolve_regions
from scripts.shared.visualizations.line_chart import SVG_EXPORT_CONFIG as LINE_EXPORT_CONFIG
from scripts.shared.visualizations.line_chart import apply_indexing, build_line_chart

"""
========================================================================================================================
Notebook-Facing Visualizers
========================================================================================================================
"""


def _filtered_chart_data(dataframe, start_year, end_year, sources):
    result = dataframe.loc[dataframe["Year"].between(start_year, end_year)].copy()
    return result.loc[result["Source"].isin(sources)].copy()


def _available_years_by_source(dataframe):
    return {
        source: sorted(source_df["Year"].dropna().astype(int).unique())
        for source, source_df in dataframe.groupby("Source")
    }


def visualize_line(locations, parameters, source, start_year, end_year, indexed=False, show=True):
    """Build and optionally show a Components line chart. Test file: scripts/unit_tests/components_of_change/test_visualizations.py"""
    columns_config = get_columns_config()
    geography_config = get_components_geography()
    sources = validate_source(source, allow_multiple=True)
    validate_parameters(parameters, columns_config)
    validate_locations(locations, sources, geography_config)
    validate_year_bounds(sources, start_year, end_year)
    expanded_locations = expand_locations(locations, geography_config)
    pipeline_result = build_components_dataset()
    dataframe = pipeline_result["dataframe"]
    chart_data = _filtered_chart_data(dataframe, start_year, end_year, sources)
    if indexed:
        chart_data = apply_indexing(chart_data, start_year)
    fig = build_line_chart(chart_data, expanded_locations, parameters, sources, indexed=indexed)
    if show:
        fig.show(config=LINE_EXPORT_CONFIG)
    return fig


def visualize_bar(subset, parameter, metric_of_change, start_year, end_year, source, show=True):
    """Build and optionally show a Components bar chart. Test file: scripts/unit_tests/components_of_change/test_visualizations.py"""
    columns_config = get_columns_config()
    geography_config = get_components_geography()
    source = validate_source(source)
    validate_subset(subset, source, geography_config)
    validate_parameters([parameter], columns_config, change_only=True)
    validate_metric_of_change(metric_of_change, parameter, columns_config)
    locations = locations_for_subset(subset, geography_config, metric_of_change)
    pipeline_result = build_components_dataset()
    dataframe = pipeline_result["dataframe"]
    validate_year_bounds(source, start_year, end_year, _available_years_by_source(dataframe))
    chart_data = dataframe.loc[dataframe["Source"].eq(source) & dataframe["Location"].isin(locations)].copy()
    result = compute_change_metric(chart_data, parameter, metric_of_change, start_year, end_year)
    fig = build_bar_chart(result, parameter, metric_of_change, start_year, end_year, subset=subset)
    if show:
        fig.show(config=BAR_EXPORT_CONFIG)
    return fig


def _load_geojson_for_subset(subset, paths, geography_config):
    if subset == "States":
        with open(paths["us_states_geojson_path"]) as geojson_file:
            return json.load(geojson_file)
    if subset == "Regions":
        import geopandas as gpd

        counties_gdf = gpd.read_file(paths["california_counties_geojson_path"])
        return dissolve_regions(counties_gdf, geography_config["regions_mapping"])
    with open(paths["california_counties_geojson_path"]) as geojson_file:
        return json.load(geojson_file)


def visualize_map(subset, parameter, metric_of_change, start_year, end_year, source, bins_range="Default", num_bins=5, show=True):
    """Build and optionally show a Components choropleth map. Test file: scripts/unit_tests/components_of_change/test_visualizations.py"""
    columns_config = get_columns_config()
    geography_config = get_components_geography()
    paths = get_paths()
    source = validate_source(source)
    validate_subset(subset, source, geography_config)
    validate_parameters([parameter], columns_config, change_only=True)
    validate_metric_of_change(metric_of_change, parameter, columns_config)
    locations = locations_for_subset(subset, geography_config)
    pipeline_result = build_components_dataset()
    dataframe = pipeline_result["dataframe"]
    validate_year_bounds(source, start_year, end_year, _available_years_by_source(dataframe))
    chart_data = dataframe.loc[dataframe["Source"].eq(source) & dataframe["Location"].isin(locations)].copy()
    result = compute_change_metric(chart_data, parameter, metric_of_change, start_year, end_year)
    geojson = _load_geojson_for_subset(subset, paths, geography_config)
    fig = build_choropleth(result, geojson, parameter, metric_of_change, start_year, end_year, bins_range, num_bins, subset, geography_config["abbreviation_to_state"])
    if show:
        fig.show(config=MAP_EXPORT_CONFIG)
    return fig
