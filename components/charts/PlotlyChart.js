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
import { cn } from "@/components/ui/utils";

import { CHART_HEIGHTS } from "@/lib/constants";
import { fitFootnoteLayout } from "@/lib/visualization/toPlotly";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

function paddingPixels(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(100, number) : 0;
}

function positionCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(1000, number) : 1;
}

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
  const containerRef = React.useRef(null);
  const [chartWidth, setChartWidth] = React.useState(0);
  const accessibleSummary =
    summary || layout.title?.text || "Interactive data visualization";
  const requestedHeight = Number(layout.height);
  const baseHeight = Number.isFinite(requestedHeight)
    ? Math.max(height, requestedHeight)
    : height;
  const linePadding = layout.meta?.ppicLinePadding || {};
  const horizontalPadding = paddingPixels(linePadding.horizontal);
  const verticalPadding = paddingPixels(linePadding.vertical);
  const horizontalCount = positionCount(linePadding.horizontalCount);
  const verticalCount = positionCount(linePadding.verticalCount);
  const effectiveHeight = Math.round(
    baseHeight + horizontalPadding * 2 * horizontalCount,
  );
  const effectiveWidth =
    chartWidth > 0
      ? Math.round(chartWidth + verticalPadding * 2 * verticalCount)
      : 0;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateWidth = () => {
      const nextWidth = container.getBoundingClientRect().width;
      setChartWidth((current) => (current === nextWidth ? current : nextWidth));
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const responsiveLayout = React.useMemo(() => {
    // Always give Plotly a fresh layout with the same explicit height used by
    // the wrapper. Plotly mutates responsive layout objects while mounting; if
    // Auto reused the adapter's object, remounting the preview on another
    // wizard step could inherit a different height. For forest plots,
    // effectiveHeight already includes the adapter's row-based automatic
    // height plus any user-selected top/bottom padding.
    const dimensionedLayout = { ...layout, height: effectiveHeight };
    return fitFootnoteLayout(
      dimensionedLayout,
      effectiveWidth || chartWidth,
      effectiveHeight,
    );
  }, [chartWidth, effectiveHeight, effectiveWidth, layout]);

  // Remove Plotly's built-in image button so ExportMenu is the only export
  // path; preserve any buttons the caller already asked to remove (deduped).
  const modeBarButtonsToRemove = [
    ...new Set([...(config.modeBarButtonsToRemove || []), "toImage"]),
  ];

  const handleGraphDiv = (_figure, graphDiv) => onGraphDiv?.(graphDiv);

  return (
    <div
      ref={containerRef}
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
          width: effectiveWidth ? `${effectiveWidth}px` : "100%",
          height: `${effectiveHeight}px`,
          margin: "0 auto",
        }}
      />
      {summary ? <p className="sr-only">{summary}</p> : null}
    </div>
  );
}
