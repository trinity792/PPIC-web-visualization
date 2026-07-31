"use client";

/**
 * ChartTypeStep.js — wizard step "Chart Type": a gallery of the chart-type
 * variants from lib/visualization/chartRegistry, grouped by family (Line, Bar,
 * Pie, Map, Dumbbell, …). Selecting a card dispatches SET_CHART_TYPE; the right
 * column previews the current chart with the imported/module data.
 *
 * Props:
 *   (none — reads/dispatches through useChartConfig())
 *
 * Data sources:
 *   - lib/visualization/chartRegistry.js (CHART_TYPES)
 *   - components/chart-builder/wizard/PreviewPane.js
 */

/* eslint-disable react/prop-types */

import React from "react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/components/ui/utils";
import { isChartTypeAvailable } from "@/lib/visualization/chartAvailability";
import { getChartType } from "@/lib/visualization/chartRegistry";

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import StepShell from "@/components/chart-builder/wizard/StepShell";

// Family → chart-type ids, in the order the mockup lists them. Any registry id
// not named here lands under "Other" so new chart types still surface.
//
// Diverging Bar is not listed (Workstream B): it retired to a `bar` variant
// flag (`appearance.diverging`, set from OutcomeSection), not a separate card,
// so both editor surfaces offer the toggle instead of a second tile — unlike
// ChartTypeSection.js's `orderedChartTypes`, this component has no fallback
// that appends an unlisted-but-registered id, so no `hidden` marker is needed
// here for the id to disappear from the gallery.
const FAMILIES = [
  { label: "Line", ids: ["line"] },
  { label: "Bar", ids: ["bar"] },
  { label: "Pie", ids: ["pie"] },
  { label: "Map", ids: ["choroplethMap", "symbolMap"] },
  { label: "Range", ids: ["dumbbell", "dotPlot", "forest"] },
  { label: "Distribution", ids: ["scatter", "bubble", "heatmap"] },
  { label: "Table", ids: ["dataTable"] },
];

function VariantCard({ id, selected, onSelect }) {
  const chart = getChartType(id);
  if (!chart) return null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className={cn(
        "flex min-h-24 flex-col justify-between rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-ppic-brand bg-ppic-orange-100/40 ring-1 ring-ppic-brand"
          : "border-border bg-card hover:border-ppic-brand/50 hover:bg-muted/50",
      )}
    >
      <span className="font-heading text-sm font-semibold">{chart.label}</span>
      <span className="mt-1 text-xs leading-snug text-muted-foreground">
        {chart.purpose}
      </span>
    </button>
  );
}

export default function ChartTypeStep() {
  const { config, dispatch, schema } = useChartConfig();

  function selectType(chartType) {
    dispatch({ type: "SET_CHART_TYPE", chartType });
  }

  return (
    <StepShell title="Chart Type" preview={<PreviewPane />}>
      <ScrollArea className="h-[calc(100svh-24rem)] w-full min-w-0 pr-2">
        <div className="grid gap-5">
          {FAMILIES.map((family) => {
            // Availability, not just registration: a module's
            // `supportedChartTypes`, a retired `hidden` descriptor, and — for
            // the map family — whether this surface has anything to join
            // coordinates to. Pasted data has no coordinate contract, so Symbol
            // Map leaves the gallery here rather than drawing an empty figure.
            const ids = family.ids.filter((id) => isChartTypeAvailable(id, schema));
            if (!ids.length) return null;
            return (
              <div key={family.label} className="grid gap-3">
                {/* Short fixed-width accent to match the edit sidebar's SectionHeading. */}
                <div className="relative inline-block self-start">
                  <span className="font-heading text-base font-semibold">
                    {family.label}
                  </span>
                  <span className="absolute -bottom-1 left-0 h-0.5 w-8 rounded-full bg-ppic-brand" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ids.map((id) => (
                    <VariantCard
                      key={id}
                      id={id}
                      selected={config.chartType === id}
                      onSelect={selectType}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </StepShell>
  );
}
