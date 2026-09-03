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
 * Both editor shells render this one grid: the wizard's retired Chart Type
 * *step* once grouped the tiles into named families, and Workstream F kept
 * that layout briefly as a `grouped` prop, but the standalone tool now reads
 * exactly like the module workbench, so the families are gone and the tile
 * set, its order, and its availability filtering have a single answer.
 *
 * Props:
 *   None (reads useChartConfig()).
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
import { isChartTypeAvailable } from "@/lib/visualization/chartAvailability";
import { CHART_TYPE_IDS, getChartType } from "@/lib/visualization/chartRegistry";

// Mockup order, reading left-to-right across the two columns. Range sits with
// the other per-category comparison forms rather than at the end.
const TILE_ORDER = [
  "line",
  "bar",
  "choroplethMap",
  "forest",
  "symbolMap",
  "dotPlot",
  "dumbbell",
  "pie",
  "scatter",
  "bubble",
  "heatmap",
  "dataTable",
];

/**
 * Declared order first, then any registered type the list forgot, filtered by
 * what this schema can actually draw (`isChartTypeAvailable`: registration,
 * the module's `supportedChartTypes`, and whether a map type has any
 * geometry to join to). Without the availability
 * check, a descriptor dropped from `TILE_ORDER` alone would reappear here as a
 * stray appended tile, and a map type would be offered on a module that holds
 * no geometry for it.
 */
function orderedChartTypes(schema) {
  const known = new Set(TILE_ORDER);
  const ids = [...TILE_ORDER, ...CHART_TYPE_IDS.filter((id) => !known.has(id))];
  return ids.filter((id) => isChartTypeAvailable(id, schema));
}

function ChartTypeTile({ id, selected, disabled = false, onSelect }) {
  const chart = getChartType(id);
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
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
}

export default function ChartTypeSection() {
  const { config, dispatch, schema, editorModel } = useChartConfig();
  const ids = orderedChartTypes(schema);
  const available = new Map(
    (editorModel?.chartChoices || []).map((choice) => [choice.id, choice.available]),
  );
  const selectedId = config.presentation?.chartType || config.chartType;
  const select = (id) => dispatch({ type: "SET_CHART_TYPE", chartType: id });

  return (
    <div className="grid grid-cols-2 gap-2">
      {ids.map((id) => (
        <ChartTypeTile
          key={id}
          id={id}
          selected={selectedId === id}
          disabled={available.has(id) && !available.get(id)}
          onSelect={() => select(id)}
        />
      ))}
    </div>
  );
}
