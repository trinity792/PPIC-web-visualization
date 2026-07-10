"use client";

/**
 * EncodingSection.js — field-binding and geographic-level controls for a chart.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *
 * UI Kit reference:
 *   - Implements graph-editor encoding controls and layer actions
 */

import React from "react";

import { Plus } from "lucide-react";

import LayerEditor from "@/components/chart-builder/LayerEditor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  CATALOG_ROLE_FOR_BINDING,
  getChartType,
} from "@/lib/visualization/chartRegistry";
import { isMeasure, supportsRole } from "@/lib/visualization/fieldTypes";
import { inlineFields } from "@/lib/visualization/inlineMapping";
import { getPreset } from "@/lib/visualization/presetRegistry";

const NONE = "__none__";

/**
 * Fields the encoding dropdowns bind to: a module's curated catalog, or — for
 * the standalone bring-your-own-data tool — the pasted/uploaded table's columns
 * (schema.inlineOnly). Modules keep their own catalog even in "Your data" mode.
 */
export function bindableFields(schema, config) {
  if (schema.inlineOnly && config.data?.source === "inline" && config.data.inline) {
    return inlineFields(config.data.inline);
  }
  return schema.fields;
}

export function roleLabel(role, chartType) {
  // The dot plot borrows the heatmap's x/y/color roles but reads more naturally
  // with dot-plot-specific labels (rows / dots / plotted value).
  if (chartType === "dotPlot") {
    const dotLabels = { y: "Category (rows)", x: "Series (dots)", color: "Value" };
    if (dotLabels[role]) return dotLabels[role];
  }
  const labels = {
    x: "X axis",
    y: "Y axis",
    series: "Compare by",
    color: "Color",
    benchmark: "Benchmark",
    facet: "Facet",
    category: "Category",
    group: "Group",
    geography: "Geography",
    period: "Period",
    start: "Start value",
    end: "End value",
    point: "Center point",
    unit: "Observation unit",
    size: "Bubble size",
  };
  return labels[role] || role;
}

export default function EncodingSection() {
  const { config, dispatch, schema } = useChartConfig();
  const chart = getChartType(config.chartType);
  const preset = getPreset(config.preset);
  // A preset's declared encoding list only applies to ITS OWN chart type. Once
  // the chart type has been switched away from the preset (e.g. to scatter,
  // bubble, dumbbell, slope, or heatmap — none of which any preset maps to),
  // fall back to the chart type's own roles so they're never hidden
  // (flagged issue 2).
  const declared =
    preset?.chartType === config.chartType ? preset?.sidebar?.encodings : null;
  const roles = declared?.length
    ? declared
    : [...chart.requiredRoles, ...chart.optionalRoles];

  // Inline (byod) fields carry no measure catalog, so only the kind filter
  // applies; module fields also honor the per-field catalog-role restriction.
  const catalog = bindableFields(schema, config);
  const inline = catalog !== schema.fields;

  return (
    <div className="grid gap-4">
      <GeographicLevelControl />
      {roles.map((role) => {
        const accepted = chart.roleConstraints[role] || [];
        const catalogRole = CATALOG_ROLE_FOR_BINDING[role];
        const fields = Object.entries(catalog).filter(([, field]) => {
          if (!accepted.includes(field.kind)) return false;
          if (inline) return true;
          return !isMeasure(field) || !catalogRole || supportsRole(field, catalogRole);
        });
        const required = chart.requiredRoles.includes(role);

        return (
          <div className="grid gap-2" key={role}>
            <Label htmlFor={`binding-${role}`}>
              {roleLabel(role, config.chartType)}
              {required ? <span className="text-destructive">*</span> : null}
            </Label>
            <Select
              value={config.bindings[role] || NONE}
              onValueChange={(field) =>
                dispatch({
                  type: "SET_BINDING",
                  role,
                  field: field === NONE ? null : field,
                })
              }
            >
              <SelectTrigger id={`binding-${role}`}>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {!required ? <SelectItem value={NONE}>Not set</SelectItem> : null}
                {fields.map(([name, field]) => (
                  <SelectItem key={name} value={name}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}

      {config.chartType === "line" ? (
        <LayerEditor
          trigger={
            <Button type="button" variant="outline" className="w-full">
              <Plus aria-hidden="true" />
              Add line
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function GeographicLevelControl() {
  const { config, dispatch, schema } = useChartConfig();
  const subsets =
    config.chartType === "choroplethMap" && schema.subsets?.Counties
      ? ["Counties"]
      : Object.keys(schema.subsets || {});

  if (!subsets.length) return null;

  function setSubset(value) {
    dispatch({ type: "SET_FILTER", key: "subset", value });
    const forcedSource = schema.subsetSource?.[value];
    if (forcedSource && schema.sources?.includes(forcedSource)) {
      dispatch({ type: "SET_FILTER", key: "source", value: forcedSource });
    } else if (value === "States" && schema.sources?.includes("Census")) {
      dispatch({ type: "SET_FILTER", key: "source", value: "Census" });
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="encoding-geographic-level">Geographic level</Label>
      <Select value={config.filters.subset || ""} onValueChange={setSubset}>
        <SelectTrigger id="encoding-geographic-level">
          <SelectValue placeholder="Choose a level" />
        </SelectTrigger>
        <SelectContent>
          {subsets.map((subset) => (
            <SelectItem key={subset} value={subset}>
              {subset}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
