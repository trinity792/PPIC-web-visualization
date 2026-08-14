"use client";

/**
 * LabelsSection.js — text and independent visibility for chart labels and legend.
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
import { Switch } from "@/components/ui/switch";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { deriveLabels } from "@/lib/visualization/deriveLabels";

// Label text key, editor label, appearance visibility key, visibility wording.
const LABEL_FIELDS = [
  ["title", "Title", "showTitle", "Show title"],
  ["subtitle", "Subtitle", "showSubtitle", "Show subtitle"],
  ["xAxis", "X-Axis Label", "showXAxisLabel", "Show X-axis label"],
  ["yAxis", "Y-Axis Label", "showYAxisLabel", "Show Y-axis label"],
  ["legend", "Legend Title", "showLegend", "Show legend"],
];

export default function LabelsSection() {
  const { config, dispatch, schema } = useChartConfig();
  // The live auto-labels the chart would use, shown as placeholders.
  const auto = deriveLabels(config, schema);
  const appearance = config.appearance || {};

  return (
    <div className="grid gap-4">
      {LABEL_FIELDS.map(([key, label, visibilityKey, visibilityLabel]) => {
        const isLegacyHiddenLegend =
          visibilityKey === "showLegend" && appearance.legendPosition === "hidden";
        const isVisible = appearance[visibilityKey] !== false && !isLegacyHiddenLegend;
        return (
          <div className="grid gap-2" key={key}>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`label-${key}`}>{label}</Label>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`label-${key}-visible`}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {visibilityLabel}
                </Label>
                <Switch
                  id={`label-${key}-visible`}
                  checked={isVisible}
                  onCheckedChange={(checked) => {
                    // `legendPosition: hidden` predates the dedicated switch.
                    // Turning the legend back on promotes that saved setting to
                    // the normal right-hand position before enabling it.
                    if (visibilityKey === "showLegend" && checked && isLegacyHiddenLegend) {
                      dispatch({
                        type: "SET_APPEARANCE",
                        key: "legendPosition",
                        value: "right",
                      });
                    }
                    dispatch({
                      type: "SET_APPEARANCE",
                      key: visibilityKey,
                      value: checked,
                    });
                  }}
                />
              </div>
            </div>
            <Input
              id={`label-${key}`}
              value={config.labels?.[key] || ""}
              disabled={!isVisible}
              // Never blank: a placeholder that reads "" would look like a broken
              // field rather than an inherited label.
              placeholder={auto[key] || label}
              onChange={(event) =>
                dispatch({ type: "SET_LABEL", key, value: event.target.value })
              }
            />
          </div>
        );
      })}
    </div>
  );
}
