"use client";

/**
 * ChartTypeSection.js — the sidebar's chart-type grid.
 *
 * Two columns of label-only tiles, in the order the July 2026 mockup lists them.
 * The order is declared here rather than read from the registry because it is a
 * design decision (families the mockup groups visually), not a data one; any
 * registered type missing from the list still appears, appended, so a new chart
 * type is never silently unreachable.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/chartRegistry.js (labels and the registered id set)
 *
 * UI Kit reference:
 *   - Implements the selectable tile-grid pattern
 */

import React from "react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { cn } from "@/components/ui/utils";
import { CHART_TYPE_IDS, getChartType } from "@/lib/visualization/chartRegistry";

// Mockup order, reading left-to-right across the two columns. Range sits with
// the other per-category comparison forms rather than at the end.
const TILE_ORDER = [
  "line",
  "bar",
  "choroplethMap",
  "forest",
  "divergingBar",
  "symbolMap",
  "dotPlot",
  "dumbbell",
  "pie",
  "scatter",
  "bubble",
  "heatmap",
  "dataTable",
];

/** Declared order first, then any registered type the list forgot. */
function orderedChartTypes(allowed) {
  const known = new Set(TILE_ORDER);
  const ids = [
    ...TILE_ORDER.filter((id) => getChartType(id)),
    ...CHART_TYPE_IDS.filter((id) => !known.has(id)),
  ];
  return allowed ? ids.filter((id) => allowed.has(id)) : ids;
}

export default function ChartTypeSection() {
  const { config, dispatch, schema } = useChartConfig();
  // A module may restrict the chart types it supports (e.g. a snapshot-only
  // module that offers ranking bars but not trend lines or maps).
  const allowed = schema?.supportedChartTypes
    ? new Set(schema.supportedChartTypes)
    : null;
  const ids = orderedChartTypes(allowed);

  return (
    <div className="grid grid-cols-2 gap-2">
      {ids.map((id) => {
        const chart = getChartType(id);
        const selected = config.chartType === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => dispatch({ type: "SET_CHART_TYPE", chartType: id })}
            title={chart.purpose}
            className={cn(
              "rounded-full border px-3 py-2 text-center text-sm transition-colors",
              selected
                ? "border-ppic-brand bg-ppic-orange-100 font-medium text-foreground"
                : "border-border bg-card text-foreground hover:border-ppic-brand/50 hover:bg-muted/60",
            )}
          >
            {chart.label}
          </button>
        );
      })}
    </div>
  );
}
