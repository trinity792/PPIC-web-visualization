"""
line_chart.py — builds generic Plotly line charts for time-series records.

Data sources:
    - pandas.DataFrame inputs — filtered records with Location, Source, Year, and metric columns

Outputs:
    - plotly.graph_objects.Figure — configured line chart

Usage:
    python scripts/shared/visualizations/line_chart.py

Test Folders:
    - scripts/unit_tests/shared/visualizations/
"""

import plotly.graph_objects as go

# ── Constants ─────────────────────────────────────────────────────────────────

DEFAULT_COLOR_PALETTE = ["#293B54", "#CA4F1A", "#CCCB74", "#44AFD0", "#1A1918", "#693692", "#02BDA7", "#832522", "#196348"]
SVG_EXPORT_CONFIG = {"toImageButtonOptions": {"format": "svg"}}

"""
========================================================================================================================
Line Charts
========================================================================================================================
"""


def apply_indexing(dataframe, baseline_year, group_col="Location"):
    """Index numeric columns to 100 at a baseline year. Test file: scripts/unit_tests/shared/visualizations/test_line_chart.py"""
    baseline = dataframe.loc[dataframe["Year"].eq(baseline_year)].set_index(group_col)
    if baseline.empty:
        raise ValueError(f"No baseline rows found for {baseline_year}")
    result = dataframe.set_index(group_col).join(baseline, rsuffix="_baseline").reset_index()
    for column in baseline.columns:
        if column not in {"Year", "Source"}:
            baseline_column = f"{column}_baseline"
            result[column] = 100 * result[column] / result[baseline_column]
    return result.drop(columns=[f"{column}_baseline" for column in baseline.columns if column != "Year"])


def build_line_chart(dataframe, locations, parameters, sources, indexed=False, color_palette=None):
    """Build a Plotly line chart for selected locations, metrics, and sources. Test file: scripts/unit_tests/shared/visualizations/test_line_chart.py"""
    color_palette = list(color_palette or DEFAULT_COLOR_PALETTE)
    fig = go.Figure()
    color_index = 0
    for source in sources:
        source_data = dataframe.loc[dataframe["Source"].eq(source)]
        for location in locations:
            location_data = source_data.loc[source_data["Location"].eq(location)]
            for parameter in parameters:
                color = color_palette[color_index % len(color_palette)]
                color_index += 1
                fig.add_trace(
                    go.Scatter(
                        x=location_data["Year"],
                        y=location_data[parameter],
                        mode="lines+markers",
                        name=f"{location} - {parameter} ({source})",
                        line={"color": color, "width": 2},
                        hovertemplate=f"<b>{location}</b><br>Year: %{{x}}<br>{parameter}: %{{y}}<br>Source: {source}<extra></extra>",
                    )
                )
    title = "Components of Change Over Time"
    if indexed:
        title += " (Indexed from 100)"
    fig.update_layout(title=title, title_font_size=24, xaxis_title="Year", yaxis_title="Value", legend_title={"text": "Location and Statistic"}, height=800, hovermode="closest")
    return fig
