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

/* eslint-disable react/prop-types */

import React from "react";

import { AlertCircle, LoaderCircle } from "lucide-react";

import DataTableView from "@/components/charts/DataTableView";
import GraphTabs from "@/components/charts/GraphTabs";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/components/ui/utils";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";
import { CHART_HEIGHTS } from "@/lib/constants";
import { tabValues } from "@/lib/tabular/toSeries";

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
