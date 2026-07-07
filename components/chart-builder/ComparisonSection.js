"use client";

/**
 * ComparisonSection.js — transform, indexing, and reference-line controls.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements graph-editor comparison form controls
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { allowedTransforms } from "@/lib/visualization/fieldTypes";

const TRANSFORM_LABELS = {
  actual: "Actual value",
  indexed: "Indexed to base year",
  numericChange: "Numeric change",
  percentChange: "Percent change",
  percentagePointChange: "Percentage-point change",
  differenceFromBenchmark: "Difference from benchmark",
};

export default function ComparisonSection() {
  const { config, dispatch, schema } = useChartConfig();
  const measureName =
    config.bindings.y ||
    config.bindings.color ||
    config.bindings.start ||
    config.bindings.x;
  const measure = schema.fields[measureName];
  const transforms = allowedTransforms(measure);
  const canIndex = transforms.includes("indexed");
  // A change/indexed transform is meaningless for some chart types (dumbbell,
  // slope show two raw values; scatter/bubble axes are two different
  // measures) — hide the whole transform block rather than render a dead
  // control (flagged issue 1).
  const transformCapable = Boolean(getChartType(config.chartType)?.transformCapable);

  return (
    <div className="grid gap-4">
      {/* Source lives in the Data Sources section; geographic level too. */}
      {transformCapable && transforms.length ? (
        <div className="grid gap-2">
          <Label htmlFor="comparison-transform">Transform</Label>
          <Select
            value={
              transforms.includes(config.transform)
                ? config.transform
                : transforms[0]
            }
            onValueChange={(transform) =>
              dispatch({ type: "SET_TRANSFORM", transform })
            }
          >
            <SelectTrigger id="comparison-transform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {transforms.map((transform) => (
                <SelectItem key={transform} value={transform}>
                  {TRANSFORM_LABELS[transform] || transform}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {transformCapable && canIndex ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="comparison-index">Index to base year</Label>
          <Switch
            id="comparison-index"
            checked={config.transform === "indexed"}
            onCheckedChange={(checked) =>
              dispatch({
                type: "SET_TRANSFORM",
                transform: checked ? "indexed" : "actual",
              })
            }
          />
        </div>
      ) : null}

      {transformCapable && config.transform !== "actual" ? (
        <NumberField
          id="comparison-base-year"
          label="Base year"
          value={config.period.baseYear}
          onChange={(value) =>
            dispatch({ type: "SET_PERIOD", key: "baseYear", value })
          }
        />
      ) : null}

      {/* Period (year, year range, or start/end pair) is set by the Year-range
          slider in the Data section. */}

      {config.chartType === "bar" ? (
        <NumberField
          id="comparison-top-n"
          label="Top N categories"
          value={config.filters.topN ?? 20}
          onChange={(value) =>
            dispatch({ type: "SET_FILTER", key: "topN", value })
          }
        />
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="comparison-benchmark">Benchmark label</Label>
        <Input
          id="comparison-benchmark"
          value={config.filters.benchmark || ""}
          placeholder="e.g. California"
          onChange={(event) =>
            dispatch({
              type: "SET_FILTER",
              key: "benchmark",
              value: event.target.value,
            })
          }
        />
      </div>
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function NumberField({ id, label, value, onChange }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? null : Number(next));
        }}
      />
    </div>
  );
}
