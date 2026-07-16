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
import { cn } from "@/components/ui/utils";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import StepShell from "@/components/chart-builder/wizard/StepShell";

// Family → chart-type ids, in the order the mockup lists them. Any registry id
// not named here lands under "Other" so new chart types still surface.
const FAMILIES = [
  { label: "Line", ids: ["line"] },
  { label: "Bar", ids: ["bar", "divergingBar"] },
  { label: "Pie", ids: ["pie"] },
  { label: "Map", ids: ["choroplethMap", "symbolMap"] },
  { label: "Range", ids: ["dumbbell", "dotPlot", "slope", "forest"] },
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
  const { config, dispatch } = useChartConfig();

  // A module may restrict the chart types it supports (e.g. a snapshot-only module
  // that offers ranking bars but not trend lines or maps). Absent the allowlist,
  // every registered chart type is offered as before.
  const supported = getModuleSchema(config.module)?.supportedChartTypes;
  const allowed = supported ? new Set(supported) : null;

  function selectType(chartType) {
    dispatch({ type: "SET_CHART_TYPE", chartType });
  }

  return (
    <StepShell title="Chart Type" preview={<PreviewPane />}>
      <div className="grid gap-5">
        {FAMILIES.map((family) => {
          const ids = family.ids.filter(
            (id) => getChartType(id) && (!allowed || allowed.has(id)),
          );
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
    </StepShell>
  );
}
