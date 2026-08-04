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
 * Workstream F: the wizard's now-retired Chart Type *step* grouped tiles into
 * named families (Line, Bar, Pie, Map, Range, Distribution, Table) as its own
 * layout. Folded in here as the `grouped` prop rather than kept as a second
 * component, so both editor shells share one source of truth for the tile
 * set and its availability filtering — only the wrapping differs. A
 * registered type outside every family (the old step had no such case) still
 * renders, appended under no heading, so it stays reachable rather than
 * silently dropped.
 *
 * Props:
 *   grouped {boolean} — render family headings instead of one flat grid
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

// The wizard's retired Chart Type step's visual grouping, carried over as the
// `grouped` prop's layout. A family lists chart-type ids; TILE_ORDER still
// governs each family's internal order (family membership is filtered out of
// the already-ordered id list below, so it need not be repeated here).
const FAMILIES = [
  { label: "Line", ids: ["line"] },
  { label: "Bar", ids: ["bar"] },
  { label: "Pie", ids: ["pie"] },
  { label: "Map", ids: ["choroplethMap", "symbolMap"] },
  { label: "Range", ids: ["dumbbell", "dotPlot", "forest"] },
  { label: "Distribution", ids: ["scatter", "bubble", "heatmap"] },
  { label: "Table", ids: ["dataTable"] },
];

/**
 * `ids` (already ordered + availability-filtered) split into family buckets,
 * each keeping the incoming order. Anything not claimed by a family — a
 * registered type the design order never anticipated — is appended under no
 * heading, so it stays reachable rather than silently dropped.
 */
function familyGroups(ids) {
  const idSet = new Set(ids);
  const claimed = new Set();
  const groups = FAMILIES.map(({ label, ids: familyIds }) => {
    const present = ids.filter((id) => familyIds.includes(id) && idSet.has(id));
    present.forEach((id) => claimed.add(id));
    return { label, ids: present };
  }).filter((group) => group.ids.length);

  const leftover = ids.filter((id) => !claimed.has(id));
  return leftover.length ? [...groups, { label: null, ids: leftover }] : groups;
}

function ChartTypeTile({ id, selected, onSelect }) {
  const chart = getChartType(id);
  return (
    <button
      type="button"
      aria-pressed={selected}
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

export default function ChartTypeSection({ grouped = false }) {
  const { config, dispatch, schema } = useChartConfig();
  const ids = orderedChartTypes(schema);
  const select = (id) => dispatch({ type: "SET_CHART_TYPE", chartType: id });

  if (!grouped) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {ids.map((id) => (
          <ChartTypeTile
            key={id}
            id={id}
            selected={config.chartType === id}
            onSelect={() => select(id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {familyGroups(ids).map(({ label, ids: familyIds }) => (
        <div key={label || "other"} className="grid gap-2">
          {label ? (
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {familyIds.map((id) => (
              <ChartTypeTile
                key={id}
                id={id}
                selected={config.chartType === id}
                onSelect={() => select(id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
