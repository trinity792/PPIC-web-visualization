"use client";

/**
 * LabelsSection.js — the chart's title, subtitle, axis titles, and legend title.
 *
 * Each field placeholders the label the chart would derive from its bindings, so
 * an author sees what they are overriding before they type. A blank field means
 * "keep the derived label", which is why the placeholder and not a pre-filled
 * value carries it: a derived title keeps tracking the data when a binding
 * changes, a typed one deliberately stops.
 *
 * The tooltip template moved to Appearance in the workbench overhaul — it is a
 * formatting power control, not one of the five labels the mockup names.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/deriveLabels.js (the placeholder text)
 *
 * UI Kit reference:
 *   - Implements the text-input form pattern
 */

import React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { deriveLabels } from "@/lib/visualization/deriveLabels";

// Config key → the label the mockup gives it.
const LABEL_FIELDS = [
  ["title", "Title"],
  ["subtitle", "Subtitle"],
  ["xAxis", "X-Axis Label"],
  ["yAxis", "Y-Axis Label"],
  ["legend", "Legend Title"],
];

export default function LabelsSection() {
  const { config, dispatch, schema } = useChartConfig();
  // The live auto-labels the chart would use, shown as placeholders.
  const auto = deriveLabels(config, schema);

  return (
    <div className="grid gap-4">
      {LABEL_FIELDS.map(([key, label]) => (
        <div className="grid gap-2" key={key}>
          <Label htmlFor={`label-${key}`}>{label}</Label>
          <Input
            id={`label-${key}`}
            value={config.labels?.[key] || ""}
            // Never blank: a placeholder that reads "" would look like a broken
            // field rather than an inherited label.
            placeholder={auto[key] || label}
            onChange={(event) =>
              dispatch({ type: "SET_LABEL", key, value: event.target.value })
            }
          />
        </div>
      ))}
    </div>
  );
}
