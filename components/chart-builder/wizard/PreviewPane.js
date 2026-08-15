"use client";

/**
 * PreviewPane.js — the wizard's right-column chart preview.
 *
 * Renders the shared PreviewContext state (loading / invalid / empty / error /
 * ready) and mounts the Plotly chart, handing its graph div up to the context
 * so the Export step can drive image export off the same rendered figure.
 * This is the extracted render half of ModuleEditor's former ChartWorkspace.
 *
 * Props:
 *   embedded {boolean} — whether the pane is rendering inside an iframe
 *
 * Data sources:
 *   - components/chart-builder/wizard/PreviewContext.js
 *
 * UI Kit reference:
 *   - Reuses GraphTabs for the shared pill-tab filter row
 */

import React from "react";

import {
  AlertCircle,
  ChartBar,
  ChartBarIncreasing,
  ChartColumnBig,
  ChartGantt,
  ChartNoAxesGantt,
  ChartPie,
  ChartScatter,
  Grid3x3,
  LoaderCircle,
  Table,
} from "lucide-react";

import CaliforniaCountiesOutline from "@/components/charts/CaliforniaCountiesOutline";
import DataTableView from "@/components/charts/DataTableView";
import GraphTabs from "@/components/charts/GraphTabs";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/components/ui/utils";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { roleLabel } from "@/components/chart-builder/sections/OutcomeSection";
import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";
import { CHART_HEIGHTS } from "@/lib/constants";
import { tabValues } from "@/lib/tabular/toSeries";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { unsetRoles } from "@/lib/visualization/validation";

/**
 * The skeleton a chart type draws while it waits (Workstream C). Bar is the
 * one type whose shape depends on config as well as descriptor: its declared
 * "bars" flips to "barsHorizontal" when the reader has set a horizontal
 * orientation, so a horizontal bar chart doesn't wait behind a vertical
 * placeholder. Falls back to "bars" for an unknown chart type rather than
 * throwing.
 */
function skeletonShapeFor(chartType, appearance = {}) {
  const declared = getChartType(chartType)?.skeletonShape || "bars";
  if (declared === "bars" && appearance.orientation === "horizontal") {
    return "barsHorizontal";
  }
  return declared;
}

/**
 * One oversized Lucide icon per shape. The icons carry the whole drawing, so
 * there is no hand-built geometry to keep in sync with the real renderers —
 * a skeleton only has to say "a chart of this kind is coming".
 *
 * `map` is deliberately absent: the two map types draw the California county
 * outline instead, which no icon set has.
 */
const SKELETON_SHAPE_ICONS = {
  bars: ChartColumnBig,
  barsHorizontal: ChartBar,
  line: ChartBarIncreasing,
  gantt: ChartGantt,
  ganttNoAxes: ChartNoAxesGantt,
  scatter: ChartScatter,
  grid: Grid3x3,
  pie: ChartPie,
  table: Table,
};

/**
 * The shape itself, scaled up and pulsing.
 *
 * Tinted with `text-muted-foreground/30` rather than the `bg-accent` the
 * `Skeleton` primitive uses: accent is tuned for large filled blocks and all
 * but disappears as a thin stroke, and every shape here is stroke art. The
 * stroke is thinned from Lucide's default 2 because these render ~10x their
 * design size, where an unscaled stroke reads as a heavy blob.
 */
function SkeletonShape({ shape }) {
  const Icon = SKELETON_SHAPE_ICONS[shape];
  return (
    <div
      data-skeleton-shape={shape}
      aria-hidden="true"
      className="flex min-h-0 flex-1 animate-pulse items-center justify-center text-muted-foreground/30"
    >
      {shape === "map" ? (
        <CaliforniaCountiesOutline className="h-60 w-60 max-h-full max-w-full" />
      ) : (
        <Icon className="h-52 w-52 max-h-full max-w-full" strokeWidth={1.25} />
      )}
    </div>
  );
}

/**
 * The pre-render placeholder: a shape naming the chart type waiting on
 * settings, so the container reads as *this* chart waiting rather than as a
 * failure, a stalled load, or (before Workstream C) a bar chart regardless of
 * what is actually selected. Shown where the provider defers its first fetch
 * and where the chart is not yet fully encoded (the module workbench); it is
 * decorative, hence aria-hidden with one status label.
 *
 * Props:
 *   shape   {string} — one of chartRegistry.js's SKELETON_SHAPES; defaults to
 *     "bars" so a fabricated/unknown chart type still renders something.
 *   message {string} — the caption under the frame; defaults to the generic
 *     prompt when nothing more specific is known.
 */
function ChartSkeleton({ shape = "bars", message }) {
  // An unregistered shape falls back to bars rather than rendering nothing —
  // the skeleton is the only thing on screen at this point.
  const resolved = shape === "map" || SKELETON_SHAPE_ICONS[shape] ? shape : "bars";
  return (
    <div
      role="status"
      aria-label="Chart preview — adjust a setting to build this chart"
      className="flex min-h-72 w-full flex-col justify-end gap-3 self-stretch p-4 sm:p-6"
    >
      <SkeletonShape shape={resolved} />
      <p className="text-center text-sm text-muted-foreground">
        {message || "Choose your settings to build this chart."}
      </p>
    </div>
  );
}

/** "X-Axis", "X-Axis and Y-Axis", "X-Axis, Y-Axis, and Series". */
function listLabels(labels) {
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * Name the encodings the chart is still waiting on, so the skeleton tells the
 * reader what to do rather than only that something is missing. Falls back to
 * the generic caption when the findings carry no role (a preset-level
 * requirement with no named role, say).
 */
function unconfiguredMessage(config) {
  const labels = unsetRoles(config.validation).map((role) =>
    roleLabel(role, config.chartType),
  );
  return labels.length ? `Set ${listLabels(labels)} to build this chart.` : null;
}

function gridClass(layout, count) {
  // 2x1 is "Stacked": one column, two rows. Only 1x2 and 2x2 go two-wide. This
  // must own the column count outright — a later `lg:grid-cols-1` override loses
  // the tie to `lg:grid-cols-2` in Tailwind's stylesheet order.
  if (count <= 1 || layout === "1x1" || layout === "2x1") return "grid-cols-1";
  return "grid-cols-1 lg:grid-cols-2";
}

function slotHeight(layout, count) {
  if (count <= 1) return CHART_HEIGHTS.default;
  if (layout === "2x2" || count > 2) return 300;
  return 380;
}

function ChartSlot({ preview, layout, multi, embedded, onGraphDiv }) {
  const { dispatch } = useChartConfig();
  const {
    id,
    name,
    active,
    config,
    status,
    error,
    notice,
    plotly,
    renderError,
  } = preview;
  const height = slotHeight(layout, multi ? 2 : 1);
  const tabColumn = config.filters?.tabColumn;
  const tabs = tabValues(
    config.data?.inline,
    tabColumn,
    config.filters?.tabOrder,
  );
  const resolvedTabs = tabs.length
    ? tabs
    : preview.result?.tabOptions || config.tabOptions || [];
  const tabValue =
    preview.result?.tabValue ?? config.filters?.tabValue ?? resolvedTabs[0];

  return (
    <div
      className={cn(
        "relative flex min-h-72 min-w-0 flex-col overflow-hidden rounded-lg border bg-background",
        active && !embedded
          ? "border-ppic-brand ring-2 ring-ppic-brand/25"
          : "border-border",
      )}
    >
      {multi && !embedded ? (
        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {name}
          </span>
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-xs transition-colors",
              active
                ? "bg-ppic-orange-100 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => dispatch({ type: "SET_ACTIVE_CHART", chartId: id })}
          >
            {active ? "Editing" : "Edit"}
          </button>
        </div>
      ) : null}

      {tabColumn && resolvedTabs.length ? (
        <GraphTabs
          options={resolvedTabs}
          value={tabValue}
          onValueChange={(value) =>
            dispatch({
              type: "SET_FILTER",
              chartId: id,
              key: "tabValue",
              value,
            })
          }
          ariaLabel={`Filter chart by ${tabColumn}`}
          className={cn("px-3 pt-2", embedded && "px-2")}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pt-2 sm:px-4">
        {status === "idle" ? (
          <ChartSkeleton shape={skeletonShapeFor(config.chartType, config.appearance)} />
        ) : null}
        {status === "unconfigured" ? (
          <ChartSkeleton
            shape={skeletonShapeFor(config.chartType, config.appearance)}
            message={unconfiguredMessage(config)}
          />
        ) : null}
        {status === "loading" ? (
          <div role="status" className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            Loading visualization…
          </div>
        ) : null}
        {status === "invalid" && notice ? (
          notice.incompatible ? (
            <Alert variant="destructive" className="max-w-xl">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>This chart doesn’t fit your data</AlertTitle>
              <AlertDescription>
                <p>{notice.message}</p>
                {notice.suggestion ? <p>{notice.suggestion}</p> : null}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="max-w-md text-center text-muted-foreground">
              {notice.message}
            </div>
          )
        ) : null}
        {status === "invalid" && !notice ? (
          <div className="max-w-md text-center text-muted-foreground">
            Resolve the configuration errors in the editor to render this view.
          </div>
        ) : null}
        {status === "empty" ? (
          <div className="max-w-md text-center text-muted-foreground">
            No data is available for this combination of fields, geography, source,
            and period.
          </div>
        ) : null}
        {status === "error" || renderError ? (
          <Alert variant="destructive" className="max-w-xl">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Visualization could not be loaded</AlertTitle>
            <AlertDescription>
              <p>{error?.message || renderError?.message}</p>
              {error?.source ? <p>Source: {error.source}</p> : null}
              {renderError ? <p>Source: chart rendering adapter</p> : null}
              <p>Try refreshing or adjust the editor selections.</p>
            </AlertDescription>
          </Alert>
        ) : null}
        {status === "ready" && plotly?.table && !renderError ? (
          <div className="h-full min-h-72 w-full">
            <DataTableView table={plotly.table} appearance={config.appearance} />
          </div>
        ) : null}
        {status === "ready" && plotly?.data && !renderError ? (
          <PlotlyChart
            {...plotly}
            // Embeds are read-only output: hide Plotly's modebar (zoom/pan/etc.)
            // so the shared chart shows no interactive editor controls.
            config={
              embedded
                ? { ...plotly.config, displayModeBar: false }
                : plotly.config
            }
            height={height}
            className="min-w-0 w-full"
            onGraphDiv={(graphDiv) => onGraphDiv(id, graphDiv)}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function PreviewPane({ embedded = false }) {
  const { workspace } = useChartConfig();
  const { previews, setGraphDiv } = usePreview();
  const charts = previews || [];
  const layout = workspace?.layout || "1x1";
  const multi = charts.length > 1;

  return (
    <div
      className={cn(
        "grid min-h-130 w-full gap-3 overflow-hidden",
        gridClass(layout, charts.length),
      )}
    >
      {charts.map((preview) => (
        <ChartSlot
          key={preview.id}
          preview={preview}
          layout={layout}
          multi={multi}
          embedded={embedded}
          onGraphDiv={setGraphDiv}
        />
      ))}
    </div>
  );
}
