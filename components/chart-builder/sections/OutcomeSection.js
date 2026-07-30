"use client";

/**
 * OutcomeSection.js — which variable is plotted, and what the chart type
 * already knows without asking (Workstream A, the "Outcome reframe").
 *
 * The mockup's "Axis" block, reframed: for a chart type where one axis is
 * already determined by context — a line's x is always time, a bar's category
 * is always the geographic level chosen above it — that role is not asked for
 * as a dropdown. It renders as a sentence naming the section that owns the
 * setting instead (`impliedRoleHint`), and the remaining "what is plotted"
 * choice reads as **Outcome** rather than Y-Axis. Series, Group, and
 * Tab-by-column still fill in beside it, and bar/diverging bar's orientation
 * toggle lives here too — the one degree of freedom Settings Reframing keeps as
 * an explicit control. Line, Bar, Scatter, and Bubble put their optional Color
 * binding in Appearance beside the palette; other chart types keep Color here.
 *
 * Roles come from the chart-type descriptor rather than a fixed x/y list, so a
 * forest plot asks for a study and its confidence bounds and a dot plot asks for
 * rows and series — the same control, relabelled by `roleLabel`.
 *
 * Geographic level is deliberately absent: it belongs to GeographySection, which
 * also owns the place selection it drives.
 *
 * Props:
 *   allowLayers {boolean} — render the line chart's "Add line" layer action.
 *     Off for the module workbench (layers are a standalone-tool feature), on
 *     for the wizard's Edit step.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - lib/visualization/inlineMapping.js for bring-your-own-data columns
 *   - lib/visualization/impliedRoles.js for what the chart type infers
 *
 * UI Kit reference:
 *   - Implements the select and draggable list-row patterns
 */

/* eslint-disable react/prop-types */

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
import { Switch } from "@/components/ui/switch";

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
import { impliedBindings, impliedRoleHint } from "@/lib/visualization/impliedRoles";
import { bindableFields } from "@/lib/visualization/inlineMapping";

const NONE = "__none__";

/**
 * Axis-block labels for the roles the mockup names directly. Anything not listed
 * falls through to the chart-type-aware labels in `roleLabel`.
 */
const AXIS_LABELS = {
  x: "X-Axis",
  y: "Y-Axis",
  series: "Series",
  color: "Color",
  group: "Group",
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Fields the encoding dropdowns bind to: a module's curated catalog, or — for
 * the standalone bring-your-own-data tool — the pasted/uploaded table's columns
 * (schema.inlineOnly). Modules keep their own catalog even in "Your data" mode.
 */
export { bindableFields };

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
  // A chart type with any implied role has folded its axis choice into a
  // single "what is plotted" question — the Settings Reframing callout — so its
  // measure role reads as Outcome rather than Y-Axis. Descriptor-only: this does
  // not depend on whether the implied role actually resolves for this schema
  // (byod's line still shows a real X-Axis dropdown, but its Y-Axis reads
  // Outcome too, because the chart type itself is the same reframed kind).
  if (role === "y" && Object.keys(getChartType(chartType)?.impliedRoles || {}).length) {
    return "Outcome";
  }
  if (AXIS_LABELS[role]) return AXIS_LABELS[role];
  const labels = {
    benchmark: "Benchmark",
    facet: "Facet",
    category: "Category",
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

/**
 * The roles this chart type binds, in the order the section renders them.
 *
 * Read from the chart-type descriptor only, never from the active preset: a
 * preset's encoding list describes the chart it was written for, and honouring
 * it after a chart-type switch is what hid roles before (flagged issue 2).
 *
 * Group is appended for chart types that do not declare it, because the sidebar
 * offers grouping everywhere (decision 4) even where the descriptor treats it as
 * a chart-specific extra.
 *
 * A role the chart type implies AND the schema resolves is dropped from the
 * dropdown grid entirely — it renders as a hint sentence instead (see the
 * section body). A role the chart type implies but the schema cannot resolve
 * (byod: no temporal field, no geography field) stays a real dropdown, per
 * impliedRoles.js's "omit rather than guess" contract. A descriptor can also
 * place its Color binding in Appearance; this changes only where the control is
 * rendered, not the binding stored in config.
 */
function rolesFor(config, schema) {
  const chart = getChartType(config.chartType);
  if (!chart) return [];
  const declared = [...chart.requiredRoles, ...chart.optionalRoles].filter(
    (role) => !(chart.hiddenRoles || []).includes(role),
  );
  const withGroup = declared.includes("group") ? declared : [...declared, "group"];
  const implied = impliedBindings(config.chartType, schema);
  return withGroup.filter(
    (role) =>
      !implied[role] &&
      !(role === "color" && chart.colorBindingSection === "appearance"),
  );
}

/** Accepted field kinds for a role, defaulting Group to any dimension. */
function acceptedKinds(chart, role) {
  return chart.roleConstraints[role] || (role === "group" ? [FIELD_KINDS.DIMENSION] : []);
}

// ── Section ──────────────────────────────────────────────────────────

export default function OutcomeSection({ allowLayers = false }) {
  const { config, dispatch, schema } = useChartConfig();
  const chart = getChartType(config.chartType);
  const roles = rolesFor(config, schema);
  const implied = impliedBindings(config.chartType, schema);
  // Workstream B: a diverging bar is `appearance.diverging` on a plain `bar`
  // now, not a separate chart type. `chartType === "divergingBar"` is kept
  // alongside it only for a config that has not yet passed through
  // normalizeSpec's retirement rewrite.
  const diverging =
    config.chartType === "divergingBar" || Boolean(config.appearance?.diverging);

  // Inline (byod) fields carry no measure catalog, so only the kind filter
  // applies; module fields also honor the per-field catalog-role restriction.
  const catalog = bindableFields(schema, config);
  const inline = catalog !== schema.fields;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        {roles.map((role) => {
          const accepted = acceptedKinds(chart, role);
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
      </div>

      {/* Implied roles render as a sentence, not a disabled control: a disabled
          Select invites a click and then explains nothing, where a sentence
          naming the section that owns the setting is what a reader can act on. */}
      {Object.keys(implied).map((role) => (
        <p key={role} className="text-sm text-muted-foreground">
          {impliedRoleHint(role, config, schema)}
        </p>
      ))}

      {/* Orientation is the one degree of freedom Settings Reframing keeps as an
          explicit control: a bar/diverging-bar chart still lets the reader pick
          vertical vs. horizontal, because unlike category it is not implied by
          anything already chosen elsewhere. Plain `bar` defaults vertical and a
          diverging one defaults horizontal, so turning Diverging on below must
          NOT flip this control to match — after Workstream A the reader owns
          orientation directly, and silently moving a control they can see is
          precisely the auto-binding behaviour the workbench withdrew. A reader
          who wants a horizontal diverging bar sets orientation themselves, and
          the diverging presets keep supplying orientation: "horizontal" for
          the case where nobody wants to. */}
      {["bar", "divergingBar"].includes(config.chartType) ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-orientation">Orientation</Label>
          <Select
            value={config.appearance?.orientation || (diverging ? "horizontal" : "vertical")}
            onValueChange={(value) =>
              dispatch({ type: "SET_APPEARANCE", key: "orientation", value })
            }
          >
            <SelectTrigger id="appearance-orientation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">Horizontal</SelectItem>
              <SelectItem value="vertical">Vertical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Bar absorbs Diverging Bar (Workstream B): a variant flag, not a
          separate chart type, matching how `pie` already varies through
          `hole`. Not offered for the legacy `divergingBar` id itself — a
          config still carrying that id has not yet passed through
          normalizeSpec's retirement rewrite, so there is nothing for the
          switch to turn off. */}
      {config.chartType === "bar" ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="appearance-diverging">Diverging bars</Label>
          <Switch
            id="appearance-diverging"
            checked={diverging}
            onCheckedChange={(checked) =>
              dispatch({ type: "SET_APPEARANCE", key: "diverging", value: checked })
            }
          />
        </div>
      ) : null}

      <TabFilterControl />

      {allowLayers && config.chartType === "line" ? (
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

/**
 * Split the chart into tabs by one dimension's values — a filter the reader
 * operates, rather than one the author pins. The order list below controls the
 * tab order on the rendered chart.
 */
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
      <Label htmlFor="axis-tab-column">Tab by column</Label>
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
        <SelectTrigger id="axis-tab-column">
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
      {tabColumn && options.length > 1 ? (
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
