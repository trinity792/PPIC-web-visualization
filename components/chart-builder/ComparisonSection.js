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

import React, { useState } from "react";

import { GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { isVisible } from "@/lib/visualization/settingsTiers";

const TRANSFORM_LABELS = {
  actual: "Actual value",
  indexed: "Indexed to base year",
  numericChange: "Numeric change",
  percentChange: "Percent change",
  percentagePointChange: "Percentage-point change",
  differenceFromBenchmark: "Difference from benchmark",
};

const CATEGORY_SELECTION_CHART_TYPES = new Set(["line", "bar", "divergingBar"]);
const COLLAPSED_VALUE_COUNT = 5;

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
  const chart = getChartType(config.chartType);
  const transformCapable = Boolean(chart?.transformCapable);
  const hasRanking = Boolean(chart?.rankingCapable);
  const hasCategorySelection = CATEGORY_SELECTION_CHART_TYPES.has(config.chartType);
  const supportsBenchmark = [...(chart?.requiredRoles || []), ...(chart?.optionalRoles || [])]
    .includes("benchmark");

  function setRanking({
    topN = config.filters.topN ?? 20,
    sort = config.appearance.sort || "value",
  }) {
    dispatch({ type: "SET_RANKING", topN, sort });
  }

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

      {hasRanking ? (
        <div className="grid gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm font-medium">Ranked values</span>
          <div className="grid gap-2">
            <Label htmlFor="comparison-rank-direction">Show</Label>
            <Select
              value={config.appearance.sort === "ascending" ? "bottom" : "top"}
              onValueChange={(value) =>
                setRanking({ sort: value === "bottom" ? "ascending" : "value" })
              }
            >
              <SelectTrigger id="comparison-rank-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Top values</SelectItem>
                <SelectItem value="bottom">Bottom values</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumberField
            id="comparison-top-n"
            label="Number of values"
            min={1}
            value={config.filters.topN ?? 20}
            onChange={(topN) => setRanking({ topN })}
          />
        </div>
      ) : null}

      {hasCategorySelection &&
      isVisible("categorySelection", config.tier) &&
      (config.categoryNames || []).length ? (
        <RankedValuesControl
          categories={config.categoryNames}
          appearance={config.appearance}
          onChange={(key, value) =>
            dispatch({ type: "SET_APPEARANCE", key, value })
          }
        />
      ) : null}

      {supportsBenchmark ? (
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
      ) : null}
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function NumberField({ id, label, value, min, onChange }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          const number = Number(next);
          onChange(
            next === ""
              ? null
              : min == null
                ? number
                : Math.max(min, Math.trunc(number)),
          );
        }}
      />
    </div>
  );
}

function orderedCategories(categories, savedOrder) {
  const available = new Set(categories);
  const ordered = (savedOrder || []).filter((name) => available.has(name));
  const seen = new Set(ordered);
  return [...ordered, ...categories.filter((name) => !seen.has(name))];
}

function RankedValuesControl({ categories, appearance, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [dragged, setDragged] = useState(null);
  const ordered = orderedCategories(categories, appearance.categoryOrder);
  const visible = expanded ? ordered : ordered.slice(0, COLLAPSED_VALUE_COUNT);
  const hidden = new Set(appearance.hiddenCategories || []);

  function commitOrder(next) {
    onChange("categoryOrder", next);
  }

  function move(source, targetIndex) {
    const sourceIndex = ordered.indexOf(source);
    if (sourceIndex === -1 || targetIndex === sourceIndex) return;
    const next = [...ordered];
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    commitOrder(next);
  }

  function drop(event, target) {
    event.preventDefault();
    const source = dragged || event.dataTransfer?.getData("text/plain");
    if (source) move(source, ordered.indexOf(target));
    setDragged(null);
  }

  function toggle(name, checked) {
    const next = new Set(hidden);
    if (checked) next.delete(name);
    else next.add(name);
    onChange("hiddenCategories", [...next]);
  }

  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="grid gap-1">
        <span className="text-sm font-medium">Choose and order values</span>
        <span className="text-xs text-muted-foreground">
          Drag rows to reorder them. Use each switch to show or hide a value.
        </span>
      </div>
      <div className="grid gap-1.5">
        {visible.map((name) => {
          const index = ordered.indexOf(name);
          return (
            <div
              key={name}
              draggable
              onDragStart={(event) => {
                setDragged(name);
                event.dataTransfer?.setData("text/plain", name);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => drop(event, name)}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
            >
              <button
                type="button"
                draggable
                aria-label={`Drag to reorder ${name}. Use arrow keys to move it.`}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" && index > 0) {
                    event.preventDefault();
                    move(name, index - 1);
                  }
                  if (event.key === "ArrowDown" && index < ordered.length - 1) {
                    event.preventDefault();
                    move(name, index + 1);
                  }
                }}
                className="cursor-grab text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical aria-hidden="true" className="size-4" />
              </button>
              <Label
                htmlFor={`ranked-value-${index}`}
                className="min-w-0 flex-1 truncate text-sm font-normal"
              >
                {name}
              </Label>
              <Switch
                id={`ranked-value-${index}`}
                aria-label={`Show ${name}`}
                checked={!hidden.has(name)}
                onCheckedChange={(checked) => toggle(name, checked)}
              />
            </div>
          );
        })}
      </div>
      {ordered.length > COLLAPSED_VALUE_COUNT ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
          className="h-7 justify-self-start px-2 text-xs"
        >
          {expanded
            ? "Show less"
            : `Show more (${ordered.length - COLLAPSED_VALUE_COUNT})`}
        </Button>
      ) : null}
    </div>
  );
}
