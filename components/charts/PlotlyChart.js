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

import React from "react";
import dynamic from "next/dynamic";

import { useIsMobile } from "@/components/ui/use-mobile";
import { useAdvancedMode } from "@/components/chart-builder/advancedMode";
import { cn } from "@/components/ui/utils";

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
  const { mouseHoverAnimations = true } = useAdvancedMode();
  const accessibleSummary =
    summary || layout.title?.text || "Interactive data visualization";
  const requestedHeight = Number(layout.height);
  const baseHeight = Number.isFinite(requestedHeight)
    ? Math.max(height, requestedHeight)
    : height;
  const effectiveHeight = Math.round(baseHeight);

  const responsiveLayout = React.useMemo(() => {
    // Always give Plotly a fresh layout with the same explicit height used by
    // the wrapper. Plotly mutates responsive layout objects while mounting; if
    // Auto reused the adapter's object, remounting the preview on another
    // wizard step could inherit a different height. Notes and sources are
    // drawn by ChartFrame, not inside the Plotly figure.
    return { ...layout, height: effectiveHeight, ...(!mouseHoverAnimations ? { hovermode: false } : {}) };
  }, [effectiveHeight, layout, mouseHoverAnimations]);

  // Remove Plotly's built-in image button so ExportMenu is the only export
  // path; preserve any buttons the caller already asked to remove (deduped).
  const modeBarButtonsToRemove = [
    ...new Set([...(config.modeBarButtonsToRemove || []), "toImage"]),
  ];

  const handleGraphDiv = (_figure, graphDiv) => onGraphDiv?.(graphDiv);

  return (
    <div
      role="group"
      aria-label={accessibleSummary}
      className={cn("ppic-plotly-chart overflow-x-auto", className)}
    >
      <Plot
        data={data}
        layout={responsiveLayout}
        config={{
          ...config,
          displayModeBar: isMobile ? false : config.displayModeBar,
          modeBarButtonsToRemove,
        }}
        onInitialized={handleGraphDiv}
        onUpdate={handleGraphDiv}
        useResizeHandler
        style={{
          width: "100%",
          height: `${effectiveHeight}px`,
          margin: "0 auto",
        }}
      />
      {summary ? <p className="sr-only">{summary}</p> : null}
    </div>
  );
}
