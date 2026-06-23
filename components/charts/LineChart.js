"use client";

import dynamic from "next/dynamic";
import { COLORS, BASE_PLOTLY_COLORS } from "@/lib/constants";

// Plotly references `window`/`document`, so it can only run client-side.
// Disable SSR for the react-plotly.js wrapper to avoid build/runtime errors.
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/**
 * Presentational, props-driven line chart. Each series becomes one Plotly trace,
 * colored by cycling BASE_PLOTLY_COLORS. Axis/background styling is adapted from the
 * legacy tool's apply_high_res_layout.
 *
 * @param {Array<{location:string, years:number[], values:Array<number|null>}>} series
 */
export default function LineChart({ series = [], title, xTitle = "Year", yTitle }) {
  const traces = series.map((s, i) => ({
    x: s.years,
    y: s.values,
    type: "scatter",
    mode: "lines+markers",
    name: s.location,
    line: { width: 2, color: BASE_PLOTLY_COLORS[i % BASE_PLOTLY_COLORS.length] },
    marker: { size: 5 },
  }));

  const layout = {
    title: title ? { text: title, font: { size: 18, color: COLORS.gray7 } } : undefined,
    xaxis: {
      title: { text: xTitle },
      showgrid: true,
      gridcolor: COLORS.gray2,
      zeroline: false,
    },
    yaxis: {
      title: { text: yTitle },
      showgrid: true,
      gridcolor: COLORS.gray2,
      zeroline: false,
    },
    plot_bgcolor: COLORS.white,
    paper_bgcolor: COLORS.white,
    font: { family: "Inter, sans-serif", color: COLORS.gray6 },
    legend: { orientation: "v", x: 1.02, y: 1 },
    margin: { l: 70, r: 40, t: title ? 50 : 20, b: 50 },
    autosize: true,
  };

  return (
    <Plot
      data={traces}
      layout={layout}
      useResizeHandler
      style={{ width: "100%", height: "520px" }}
      config={{ displayModeBar: true, responsive: true }}
    />
  );
}
