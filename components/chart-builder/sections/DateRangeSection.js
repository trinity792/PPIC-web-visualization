"use client";

/**
 * DateRangeSection.js — the year (or year-range) slider for the editor sidebar.
 *
 * Extracted from ChartSidebar.js's YearRangeSection unchanged. Also exports
 * `hasTemporalData`, the predicate the section registry uses to decide whether
 * this section applies to the current schema/config at all.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements the graph-editor range-slider pattern
 */

import React, { useEffect, useState } from "react";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/components/ui/utils";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { isChangeTransform } from "@/components/chart-builder/chartData";
import { isTemporal } from "@/lib/visualization/fieldTypes";

// Charts whose period is a span (vs a single year). The Range chart also uses a
// start+end pair, so a dual-handle slider fits it too.
const RANGE_CHART_TYPES = ["line", "heatmap", "dumbbell"];

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Whether the current data has a time axis at all: an inline table with a date
 * column, or a module schema with both a year range and a temporal field.
 */
export function hasTemporalData(config, schema) {
  if (config.data?.source === "inline") {
    return Boolean(
      config.data?.inline?.columns?.some((column) => column.type === "date"),
    );
  }
  return (
    Array.isArray(schema.yearRange) &&
    schema.yearRange.length === 2 &&
    Object.values(schema.fields || {}).some(isTemporal)
  );
}

// ── Section ──────────────────────────────────────────────────────────

export default function DateRangeSection() {
  const { config, dispatch, schema } = useChartConfig();
  const [min, max] = schema.yearRange || [2000, new Date().getFullYear()];
  // Bar/choropleth become two-period charts when a change transform is active
  // (legacy metric_of_change), so they get the dual-handle window too.
  const isRange =
    RANGE_CHART_TYPES.includes(config.chartType) ||
    (["bar", "choroplethMap"].includes(config.chartType) &&
      isChangeTransform(config.transform));

  const committed = isRange
    ? [config.period.startYear ?? min, config.period.endYear ?? max]
    : [config.period.year ?? max];
  // Local value for smooth dragging; only commit to the store (and trigger a
  // refetch) on release.
  const [value, setValue] = useState(committed);
  useEffect(() => {
    setValue(
      isRange
        ? [config.period.startYear ?? min, config.period.endYear ?? max]
        : [config.period.year ?? max],
    );
  }, [
    config.period.startYear,
    config.period.endYear,
    config.period.year,
    isRange,
    min,
    max,
  ]);

  function commit(next) {
    if (isRange) {
      dispatch({ type: "SET_PERIOD", key: "startYear", value: next[0] });
      dispatch({ type: "SET_PERIOD", key: "endYear", value: next[1] });
    } else {
      dispatch({ type: "SET_PERIOD", key: "year", value: next[0] });
    }
  }

  return (
    <div className="grid gap-3 px-1">
      <Slider
        min={min}
        max={max}
        step={1}
        value={value}
        onValueChange={setValue}
        onValueCommit={commit}
        aria-label={isRange ? "Year range" : "Year"}
        // The compact track matches the editor mockup without changing shared Slider.
        className={cn(
          "[&_[data-slot=slider-track]]:h-2.5",
          "[&_[data-slot=slider-range]]:bg-ppic-orange-300",
          "[&_[data-slot=slider-thumb]]:size-3",
          "[&_[data-slot=slider-thumb]]:border-ppic-orange-300",
        )}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span className="font-medium text-foreground">{value[0]}</span>
        {isRange ? (
          <span className="font-medium text-foreground">{value[1]}</span>
        ) : null}
        <span>{max}</span>
      </div>
    </div>
  );
}
