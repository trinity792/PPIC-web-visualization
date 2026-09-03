"use client";

/**
 * DatasetsSection.js — which dataset a chart reads.
 *
 * One control: a checkbox per dataset, exclusive. Checking one unchecks the
 * others, and the checked one cannot be unchecked. Drawn as checkboxes to match
 * the mockup, but a chart reads exactly one dataset, so the control writes the
 * same single `filters.source` a radio would.
 *
 * The section shows only where that is a real question, which after the July
 * 2026 pass is Components of Change alone. Two controls that used to live here
 * left because the heading was lying about them:
 *
 *   • Data vintage — Population & Housing's E-5 / E-8 / Aggregated multi-select
 *     was per-row provenance, not a dataset toggle, and the module has exactly
 *     one dataset. Removed outright; the API reads an absent filter as "all
 *     vintages", which is what the control defaulted to anyway. `provenanceFilter`
 *     stays on the schema because `chartData.js` still reads it to know that
 *     `filters.source` is an array shape for that module.
 *   • Stratification — Age group, Sex, Race/ethnicity, Tenure, Income level.
 *     These pin which rows a chart reads, so they moved to `TransformSection`
 *     rather than sitting under a heading about datasets.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/datasetLabels.js (public names for raw source ids)
 *
 * UI Kit reference:
 *   - Implements the checkbox-list form-control pattern
 */

import React from "react";

import { Checkbox } from "@/components/ui/checkbox";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { datasetOptions } from "@/lib/visualization/datasetLabels";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Whether this schema has anything for the section to render — a genuine choice
 * between two or more datasets. One dataset is not a choice, and a schema that
 * declares `datasets: []` has deliberately withdrawn the toggle (Age, Sex & Race
 * Projections does exactly that: its source is pinned by geographic level, so
 * offering it twice let a reader pick a contradiction the API rejects).
 */
export function hasDatasetControls(config, schema) {
  return datasetOptions(schema).length > 1;
}

// ── Section ──────────────────────────────────────────────────────────

export default function DatasetsSection() {
  const { config, dispatch, schema } = useChartConfig();
  const options = datasetOptions(schema);
  // The registry gates the header on the same predicate; this keeps the section
  // honest if it is ever mounted directly.
  if (!hasDatasetControls(config, schema)) return null;

  const v3 = config.version === 3;
  const active = v3
    ? config.question?.source ?? options[0]?.id
    : config.filters?.source ?? options[0]?.id;

  function selectDataset(source) {
    if (!v3) {
      dispatch({ type: "SET_FILTER", key: "source", value: source });
      return;
    }

    const geography = config.question?.geography || {};
    const compatibleSubsets = Object.entries(schema.subsetSource || {})
      .filter(([, subsetSource]) => subsetSource === source)
      .map(([subset]) => subset);
    const subset = compatibleSubsets.includes(geography.subset)
      ? geography.subset
      : compatibleSubsets[0] || geography.subset || "";
    dispatch({
      type: "SET_DATASET",
      source,
      geography: {
        subset,
        locations: subset === geography.subset ? geography.locations || [] : [],
      },
    });
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-1.5">
        {options.map((option) => {
          const checked = option.id === active;
          return (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              {/* Clicking the active dataset is a no-op rather than a clear: a
                  chart always reads from somewhere, and an empty state here
                  would render nothing at all. */}
              <Checkbox
                checked={checked}
                aria-label={option.label}
                onCheckedChange={() => {
                  if (checked) return;
                  selectDataset(option.id);
                }}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
