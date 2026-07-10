"use client";

/**
 * ViewDataStep.js — wizard step "View Data": the tabular data behind the current
 * chart, as a searchable/sortable/paginated table. A "View original data" toggle
 * (on by default) switches between the data as it entered the tool (every
 * imported/fetched column) and the narrower table the chart actually renders.
 * Reuses the shared PreviewContext result (already loaded for the chart) so no
 * second fetch is needed; while that data is loading — e.g. a large module
 * dataset — a loading state shows instead.
 *
 * Props:
 *   (none — reads useChartConfig() + usePreview())
 *
 * Data sources:
 *   - components/chart-builder/wizard/PreviewContext.js (loaded result + status)
 *   - lib/export/exportTable.js (originalTable / displayTable)
 *   - components/charts/DataTableView.js (renderer)
 */

/* eslint-disable react/prop-types */

import React, { useMemo, useState } from "react";

import { AlertCircle, LoaderCircle } from "lucide-react";

import DataTableView from "@/components/charts/DataTableView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";
import StepShell from "@/components/chart-builder/wizard/StepShell";
import { displayTable, originalTable } from "@/lib/export/exportTable";

function tableForMode(config, result, showOriginal) {
  if (!result) {
    return { table: null, mode: showOriginal ? "original" : "chart", fallback: false };
  }
  const chartTable = displayTable(config, result);
  if (!showOriginal) return { table: chartTable, mode: "chart", fallback: false };

  const sourceTable = originalTable(config, result);
  return {
    table: sourceTable || chartTable,
    mode: sourceTable ? "original" : "chart",
    fallback: !sourceTable,
  };
}

function tableKey(table, mode) {
  const columns = (table?.columns || []).map((column) => column.name).join("|");
  return `${mode}:${columns}:${table?.rows?.length || 0}`;
}

function DataTable({ showOriginal }) {
  const { config, schema } = useChartConfig();
  const { status, result, error, renderError } = usePreview();

  const selected = useMemo(
    () => tableForMode(config, result, showOriginal),
    [config, result, showOriginal],
  );
  const table = selected.table;

  if (status === "loading") {
    return (
      <div
        role="status"
        className="flex h-full min-h-96 items-center justify-center gap-2 text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        Loading {schema.label} data…
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex h-full min-h-96 items-center justify-center text-center text-muted-foreground">
        Resolve the configuration errors to load this data.
      </div>
    );
  }

  if (status === "empty" || !table || !table.rows?.length) {
    return (
      <div className="flex h-full min-h-96 items-center justify-center text-center text-muted-foreground">
        No data is available for this combination of fields, source, and period.
      </div>
    );
  }

  if (status === "error" || renderError) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Data could not be loaded</AlertTitle>
        <AlertDescription>
          <p>{error?.message || renderError?.message}</p>
          <p>Try refreshing or adjust the editor selections.</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {selected.fallback ? (
        <p className="text-xs text-muted-foreground">
          No wider source table is available for this chart, so the viewer is
          showing the chart data.
        </p>
      ) : null}
      <DataTableView
        key={tableKey(table, selected.mode)}
        table={table}
        format={config.format}
        appearance={{ search: true, sortable: true, pageSize: 50 }}
      />
    </div>
  );
}

function DataSummary({ showOriginal, setShowOriginal }) {
  const { config, schema } = useChartConfig();
  const { result } = usePreview();

  const selected = result ? tableForMode(config, result, showOriginal) : null;
  const table = selected?.table || null;

  return (
    <div className="grid gap-3 text-sm">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="grid gap-0.5">
          <Label htmlFor="view-original-data" className="font-medium">
            View original data
          </Label>
          <span className="text-xs text-muted-foreground">
            {showOriginal
              ? "Every source column, before the chart"
              : "Only the columns this chart uses"}
          </span>
        </div>
        <Switch
          id="view-original-data"
          checked={showOriginal}
          onCheckedChange={setShowOriginal}
        />
      </div>
      <p className="text-muted-foreground">
        {selected?.fallback
          ? "A wider source table is not available for this chart type, so the viewer is showing the exact rows and columns behind the chart."
          : showOriginal
          ? "This is the source data as it entered the chart pipeline — the full table before it's narrowed to the fields your chart uses."
          : "This is the data being read to build your chart — the exact rows and columns behind it, after the current source, filters, and date range."}
      </p>
      <div className="grid gap-1 rounded-lg border bg-card p-3">
        <div className="font-medium">{schema.label}</div>
        {table ? (
          <div className="text-xs text-muted-foreground">
            {(table.rows?.length || 0).toLocaleString()} rows ×{" "}
            {table.columns?.length || 0} columns
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Loading…</div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Change the source, filters, or date range in the Edit step to update what
        you see here. Export the full table from the Export step.
      </p>
    </div>
  );
}

export default function ViewDataStep() {
  const [showOriginal, setShowOriginal] = useState(true);

  return (
    <StepShell title="View Data" preview={<DataTable showOriginal={showOriginal} />}>
      <DataSummary
        showOriginal={showOriginal}
        setShowOriginal={setShowOriginal}
      />
    </StepShell>
  );
}
