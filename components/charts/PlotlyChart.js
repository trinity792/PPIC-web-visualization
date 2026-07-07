"use client";

/**
 * PlotlyChart.js — responsive client-only wrapper around react-plotly.js.
 *
 * Props:
 *   data        {Array<Object>} — Plotly trace definitions
 *   layout      {Object}        — Plotly layout configuration
 *   config      {Object}        — Plotly interaction and export configuration
 *   height      {number}        — chart height in pixels
 *   className   {string}        — optional classes applied to the chart container
 *   summary     {string|null}   — optional screen-reader description of the chart
 *   onGraphDiv  {function|null}  — receives the mounted graph div on init/update
 *                                  so ExportMenu can drive Plotly.toImage; the
 *                                  built-in modebar image button is removed so
 *                                  ExportMenu is the single export path
 *
 * Data sources:
 *   - Plotly-ready traces and configuration via props from chart orchestrators
 *
 * UI Kit reference:
 *   - Implements the reusable "Chart Container" rendering wrapper
 */

/* eslint-disable react/prop-types */

import React from "react";
import dynamic from "next/dynamic";

import { useIsMobile } from "@/components/ui/use-mobile";

import { CHART_HEIGHTS } from "@/lib/constants";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export default function PlotlyChart({
  data = [],
  layout = {},
  config = {},
  height = CHART_HEIGHTS.default,
  className = "",
  summary = null,
  onGraphDiv = null,
}) {
  const isMobile = useIsMobile();
  const accessibleSummary =
    summary || layout.title?.text || "Interactive data visualization";

  // Remove Plotly's built-in image button so ExportMenu is the only export
  // path; preserve any buttons the caller already asked to remove (deduped).
  const modeBarButtonsToRemove = [
    ...new Set([...(config.modeBarButtonsToRemove || []), "toImage"]),
  ];

  const handleGraphDiv = (_figure, graphDiv) => onGraphDiv?.(graphDiv);

  return (
    <div role="group" aria-label={accessibleSummary} className={className}>
      <Plot
        data={data}
        layout={layout}
        config={{
          ...config,
          displayModeBar: isMobile ? false : config.displayModeBar,
          modeBarButtonsToRemove,
        }}
        onInitialized={handleGraphDiv}
        onUpdate={handleGraphDiv}
        useResizeHandler
        style={{ width: "100%", height: `${height}px` }}
      />
      {summary ? <p className="sr-only">{summary}</p> : null}
    </div>
  );
}
