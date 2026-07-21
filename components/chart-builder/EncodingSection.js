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

import React, { useState } from "react";

import { GripVertical, Plus } from "lucide-react";

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
import { tabValues } from "@/lib/tabular/toSeries";
import {
  CATALOG_ROLE_FOR_BINDING,
  getChartType,
} from "@/lib/visualization/chartRegistry";
import {
  FIELD_KINDS,
  isMeasure,
  supportsRole,
} from "@/lib/visualization/fieldTypes";
import { inlineFields } from "@/lib/visualization/inlineMapping";
import { getPreset } from "@/lib/visualization/presetRegistry";
import { isVisible } from "@/lib/visualization/settingsTiers";

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
  // Forest plot reads as study / CI bounds / estimate / weight.
  if (chartType === "forest") {
    const forestLabels = {
      category: "Study",
      start: "CI lower bound",
      end: "CI upper bound",
      point: "Estimate",
      size: "Study weight",
    };
    if (forestLabels[role]) return forestLabels[role];
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
  const roles = (declared?.length
    ? declared
    : [...chart.requiredRoles, ...chart.optionalRoles]
  ).filter((role) => !(chart.hiddenRoles || []).includes(role));

  // Inline (byod) fields carry no measure catalog, so only the kind filter
  // applies; module fields also honor the per-field catalog-role restriction.
  const catalog = bindableFields(schema, config);
  const inline = catalog !== schema.fields;

  return (
    <div className="grid gap-4">
      <GeographicLevelControl />
      <TabFilterControl />
      {roles.map((role) => {
        const accepted = chart.roleConstraints[role] || [];
        const catalogRole = CATALOG_ROLE_FOR_BINDING[role];
        const fields = Object.entries(catalog)
          .filter(([name, field]) => {
            if (!accepted.includes(field.kind)) return false;
            if (inline) return true;
            if (
              role === "group" &&
              (field.cardinality === "high" || name === "Source")
            ) {
              return false;
            }
            return !isMeasure(field) || !catalogRole || supportsRole(field, catalogRole);
          })
          .sort(([, a], [, b]) =>
            role === "group" ? Number(Boolean(b.isGroup)) - Number(Boolean(a.isGroup)) : 0,
          );
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

function TabFilterControl() {
  const { config, dispatch, schema } = useChartConfig();
  const [dragged, setDragged] = useState(null);
  const table = config.data?.inline;
  const inline = config.data?.source === "inline" && table;
  const columns = inline
    ? (table.columns || [])
        .filter((column) => ["group", "text", "date"].includes(column.type))
        .map((column) => ({
          name: column.name,
          label: column.name,
          isGroup: column.type === "group",
        }))
        .sort((a, b) => Number(b.isGroup) - Number(a.isGroup))
    : Object.entries(schema.fields || {})
        .filter(
          ([, field]) =>
            field.kind === FIELD_KINDS.DIMENSION && field.cardinality !== "high",
        )
        .map(([name, field]) => ({ name, label: field.label || name, isGroup: false }));
  if (!columns.length) return null;

  const tabColumn = config.filters?.tabColumn || null;
  const fieldValues =
    (schema.filterDimensions || []).find(
      (dimension) => dimension.column === tabColumn,
    )?.values || schema.fields?.[tabColumn]?.values || [];
  const moduleOptions = config.tabOptions?.length
    ? config.tabOptions
    : fieldValues.map((value) => String(value));
  const options = inline
    ? tabValues(table, tabColumn, config.filters?.tabOrder)
    : [
        ...(config.filters?.tabOrder || []).filter((value) =>
          moduleOptions.includes(value),
        ),
        ...moduleOptions.filter(
          (value) => !(config.filters?.tabOrder || []).includes(value),
        ),
      ];

  function move(source, targetIndex) {
    const sourceIndex = options.indexOf(source);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;
    const next = [...options];
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    dispatch({ type: "SET_FILTER", key: "tabOrder", value: next });
  }

  function drop(event, target) {
    event.preventDefault();
    const source = dragged || event.dataTransfer?.getData("text/plain");
    if (source) move(source, options.indexOf(target));
    setDragged(null);
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="encoding-tab-column">Tab by column</Label>
      <Select
        value={tabColumn || NONE}
        onValueChange={(value) =>
          dispatch({
            type: "SET_FILTER",
            key: "tabColumn",
            value: value === NONE ? null : value,
          })
        }
      >
        <SelectTrigger id="encoding-tab-column">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {columns.map((column) => (
            <SelectItem key={column.name} value={column.name}>
              {column.label}{column.isGroup ? " (Group)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {tabColumn && options.length > 1 && isVisible("tabOrder", config.tier) ? (
        <div className="grid gap-2 rounded-lg border bg-card p-3">
          <div className="grid gap-1">
            <span className="text-sm font-medium">Order tabs</span>
            <span className="text-xs text-muted-foreground">
              Drag values, or focus a handle and use the arrow keys.
            </span>
          </div>
          <div className="grid gap-1.5">
            {options.map((option, index) => (
              <div
                key={option}
                draggable
                onDragStart={(event) => {
                  setDragged(option);
                  event.dataTransfer?.setData("text/plain", option);
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragged(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => drop(event, option)}
                className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
              >
                <button
                  type="button"
                  aria-label={`Drag to reorder ${option}. Use arrow keys to move it.`}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp" && index > 0) {
                      event.preventDefault();
                      move(option, index - 1);
                    }
                    if (event.key === "ArrowDown" && index < options.length - 1) {
                      event.preventDefault();
                      move(option, index + 1);
                    }
                  }}
                  className="cursor-grab text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical aria-hidden="true" className="size-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm">{option}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
