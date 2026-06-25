"""
bar_chart.py — builds generic Plotly change/total bar charts.

Data sources:
    - pandas.DataFrame inputs — filtered records with Location, Year, and metric columns

Outputs:
    - pandas.DataFrame — computed change metric by location
    - plotly.graph_objects.Figure — configured bar chart

Usage:
    python scripts/shared/visualizations/bar_chart.py

Test Folders:
    - scripts/unit_tests/shared/visualizations/
"""

import plotly.graph_objects as go

# ── Constants ─────────────────────────────────────────────────────────────────

SVG_EXPORT_CONFIG = {"toImageButtonOptions": {"format": "svg"}}

"""
========================================================================================================================
Bar Charts
========================================================================================================================
"""


def compute_change_metric(dataframe, parameter, metric_of_change, start_year, end_year, location_col="Location", year_col="Year"):
    """Compute percent, numeric, or total change by location. Test file: scripts/unit_tests/shared/visualizations/test_bar_chart.py"""
    required_columns = [location_col, year_col, parameter]
    missing_columns = [column for column in required_columns if column not in dataframe.columns]
    if missing_columns:
        raise KeyError(f"missing columns: {', '.join(missing_columns)}")
    subset = dataframe.loc[dataframe[year_col].between(start_year, end_year)].copy()
    pivot = subset.pivot(index=location_col, columns=year_col, values=parameter)
    if metric_of_change in {"Percent Change", "Numeric Change"}:
        missing_years = [year for year in [start_year, end_year] if year not in pivot.columns]
        if missing_years:
            raise ValueError(f"Missing required year columns: {missing_years}")
    if metric_of_change == "Percent Change":
        pivot["Change"] = ((pivot[end_year] - pivot[start_year]) / pivot[start_year].abs()) * 100
    elif metric_of_change == "Numeric Change":
        pivot["Change"] = pivot[end_year] - pivot[start_year]
    elif metric_of_change == "Total":
        pivot["Change"] = pivot.loc[:, start_year:end_year].sum(axis=1)
    else:
        raise ValueError(f"Invalid metric of change: {metric_of_change}")
    return pivot.reset_index()[[location_col, "Change"]].sort_values("Change", ascending=False).reset_index(drop=True)


def build_bar_chart(result, parameter, metric_of_change, start_year, end_year, subset=None, highlight_location="CA"):
    """Build a Plotly bar chart from computed change results. Test file: scripts/unit_tests/shared/visualizations/test_bar_chart.py"""
    chart_data = result.copy()
    chart_data["color"] = chart_data["Location"].apply(lambda value: "#CA4F1A" if value == highlight_location else "#293B54")
    fig = go.Figure()
    for _, row in chart_data.iterrows():
        fig.add_trace(go.Bar(x=[row["Location"]], y=[row["Change"]], name=row["Location"], marker_color=row["color"]))
    if metric_of_change == "Total" and parameter in ["Net Migration", "Net Foreign Immigration", "Net Domestic Migration"]:
        title = f"{parameter} from {start_year} to {end_year}"
    elif metric_of_change == "Total":
        title = f"Total {parameter} from {start_year} to {end_year}"
    else:
        title = f"Change in {parameter} from {start_year} to {end_year}"
    fig.update_layout(title={"text": title}, title_font_size=24, xaxis_title="Location", yaxis_title=metric_of_change, height=800, showlegend=False)
    if subset in {"Counties", "All"}:
        fig.update_xaxes(dtick=1, tickangle=-90)
    return fig
