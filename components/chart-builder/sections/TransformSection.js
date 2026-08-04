"use client";

/**
 * TransformSection.js — how a measure's values are expressed, and which slice of
 * the module's rows they are computed from.
 *
 * The mockup's "Transform" block: one radio per transform the bound measure
 * allows, with the base-year selector appearing inline beneath "Index to Base
 * Year". Radios rather than a dropdown because the options are few, mutually
 * exclusive, and worth seeing at a glance — a reader should be able to tell that
 * a chart is showing percent change without opening a menu.
 *
 * The module's stratification pins (Age group, Sex, Race/ethnicity, Tenure,
 * Income level) render below them, from `schema.filterDimensions`. They lived
 * under "Datasets" until July 2026, which was misleading: choosing renters aged
 * 65+ does not change which dataset you are reading, it changes which rows the
 * measure is computed over — the same kind of statement the transform radios
 * make. Housing Stress and RHNA Progress are the modules where the difference
 * was most visible, since a dataset toggle was the one thing they never had.
 *
 * The radio list is the measure's own `transforms`, so a rate measure offers
 * percentage-point change and never percent change (percent-of-a-percent is a
 * category error, not a formatting choice). Chart types that cannot express a
 * transform at all — scatter, pie, the range family — draw no radios rather than
 * a dead control (flagged issue 1), and on an unstratified module that leaves the
 * section with nothing at all.
 *
 * Imported data (the standalone Visualization Tool) gets the same section with a
 * two-radio list — Absolute Values or Index to 100 at Base Period — whose base
 * periods are the imported x column's own values rather than a module year
 * range. `transformOptions` in lib/visualization/transformRegistry.js owns both
 * lists, so what this section offers and what the reducer accepts cannot drift.
 *
 * That "nothing" is why `hasTransformControls` is exported: the sidebar registry
 * gates the *accordion header* on it, so a Range chart loses the whole "Transform"
 * block rather than showing a heading with an empty body underneath.
 *
 * Exports:
 *   default             — the section
 *   hasTransformControls — (config, schema) => boolean, the registry `when` gate
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements the radio-group, select, and text-input form patterns
 */

import React from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { transformOptions } from "@/lib/visualization/transformRegistry";

const TRANSFORM_LABELS = {
  actual: "Actual Value",
  indexed: "Index to Base Year",
  numericChange: "Numeric Change",
  percentChange: "Percentage Change",
  percentagePointChange: "Percentage-Point Change",
  differenceFromBenchmark: "Difference from Benchmark",
};

// Imported data indexes against whatever the x column holds — years in most
// pasted tables, but months, quarters, or waves just as often — so its two
// radios say "period" where a module's say "year", and name the 100 the reader
// is choosing between.
const INLINE_TRANSFORM_LABELS = {
  actual: "Absolute Values",
  indexed: "Index to 100 at Base Period",
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Whether this section has any control to offer — the registry's `when` gate.
 *
 * Stratification is checked first and independently of the chart type: pinning
 * renters or a single income level is a statement about the data, and stays
 * available on a data table or a symbol map, where no transform applies.
 *
 * The transform radios then need a chart type that can express a transform
 * (scatter, pie, and the range family cannot) plus a real choice of transforms
 * from `transformOptions`. One lone "Actual Value" radio reads as a broken
 * control, so it is never drawn — this is also why the deleted `benchmark`
 * role (Workstream D) can no longer prop the section open on its own.
 */
export function hasTransformControls(config, schema) {
  if (schema?.filterDimensions?.length) return true;
  const chart = getChartType(config.chartType);
  if (!chart?.transformCapable) return false;
  const { transforms } = transformOptions(config, schema);
  return transforms.length > 1;
}

// ── Section ──────────────────────────────────────────────────────────

export default function TransformSection() {
  const { config, dispatch, schema } = useChartConfig();
  const chart = getChartType(config.chartType);
  // The registry gates the header on the same predicate, so this is normally
  // unreachable. It stays because a section that can be mounted directly should
  // still know when it has nothing to say, rather than trusting its caller.
  if (!hasTransformControls(config, schema)) return null;

  const { transforms, basePeriods, inline } = transformOptions(config, schema);
  // A measure change can leave a transform stranded (a rate cannot express
  // percent change); fall back to the first allowed rather than showing a
  // selection that no radio matches.
  const active = transforms.includes(config.transform)
    ? config.transform
    : transforms[0];
  const labels = inline ? INLINE_TRANSFORM_LABELS : TRANSFORM_LABELS;
  const basePeriodLabel = inline ? "Base period" : "Base year";
  // Re-checks `transformCapable`, because stratification alone can open the
  // section now: a scatter plot on a stratified module gets the pins without
  // acquiring transform radios it cannot honour.
  const transformable = Boolean(chart?.transformCapable);
  const hasChoice = transformable && transforms.length > 1;

  return (
    <div className="grid gap-4">
      {hasChoice ? (
      <RadioGroup
        value={active}
        onValueChange={(transform) => dispatch({ type: "SET_TRANSFORM", transform })}
        className="grid gap-2"
      >
        {transforms.map((transform) => {
          const label = labels[transform] || TRANSFORM_LABELS[transform] || transform;
          return (
            <div key={transform} className="grid gap-2">
              <div className="flex items-center gap-2">
                {/* aria-label, not a wrapping <label>: RadioGroupItem renders a
                    button, which takes no name from an enclosing label. */}
                <RadioGroupItem
                  value={transform}
                  id={`transform-${transform}`}
                  aria-label={label}
                />
                <Label htmlFor={`transform-${transform}`} className="font-normal">
                  {label}
                </Label>
              </div>
              {transform === "indexed" && active === "indexed" && basePeriods.length ? (
                <div className="ml-6 grid gap-2">
                  <Label htmlFor="transform-base-year">{basePeriodLabel}</Label>
                  <Select
                    value={
                      config.period?.baseYear ? String(config.period.baseYear) : ""
                    }
                    onValueChange={(value) =>
                      dispatch({
                        type: "SET_PERIOD",
                        key: "baseYear",
                        value: Number(value),
                      })
                    }
                  >
                    <SelectTrigger id="transform-base-year">
                      {/* Left unset, the transform indexes each series to its own
                          first value — the placeholder says so rather than
                          implying nothing has happened. */}
                      <SelectValue
                        placeholder={
                          inline ? "First period in the data" : "Choose a year"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {basePeriods.map((period) => (
                        <SelectItem key={period} value={String(period)}>
                          {period}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          );
        })}
      </RadioGroup>
      ) : null}

      <StratificationFilters />
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

/**
 * The module's stratification pins, rendered from `schema.filterDimensions`.
 * Each writes one value the API applies before shaping, defaulting to the
 * precomputed aggregate row ("All Ages", "Both Sexes", "Total") rather than to
 * no filter at all, so a chart always reads a coherent slice.
 */
function StratificationFilters() {
  const { config, dispatch, schema } = useChartConfig();
  const dimensions = schema?.filterDimensions || [];
  if (!dimensions.length) return null;

  return dimensions.map((dimension) => (
    <div className="grid gap-2" key={dimension.column}>
      <Label htmlFor={`filter-${dimension.column}`}>{dimension.label}</Label>
      <Select
        value={config.filters?.[dimension.column] ?? dimension.default}
        onValueChange={(value) =>
          dispatch({ type: "SET_FILTER", key: dimension.column, value })
        }
      >
        <SelectTrigger id={`filter-${dimension.column}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dimension.values.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ));
}
