"use client";

/**
 * ViewDataStep.js — wizard step "View Data": the tabular data behind the current
 * chart, as a searchable/sortable/paginated table. A three-way "Data view"
 * selector chooses how wide the table is:
 *
 *   • Chart data      — only the columns this chart draws (the narrowed
 *                        display table). Instant: reuses the already-loaded
 *                        preview result, no fetch.
 *   • Source data      — every column of the cleaned CSV, limited to this
 *                        chart's geography / source / date range. For a module
 *                        this fetches the `view=table` API; for bring-your-own
 *                        data it's the full pasted/uploaded table.
 *   • Entire dataset   — the whole cleaned file, every row and column, ignoring
 *                        the chart's filters (module: `view=table&full=1`).
 *
 * The chart views (line/category/twoPeriod/…) each narrow the CSV to the bound
 * roles *server-side*, so the preview result alone can never show the other
 * columns — the two source modes fetch the un-narrowed table instead.
 *
 * Props:
 *   (none — reads useChartConfig() + usePreview())
 *
 * Data sources:
 *   - components/chart-builder/wizard/PreviewContext.js (loaded result + status)
 *   - GET <schema.apiPath>?view=table (full source table, modules only)
 *   - lib/export/exportTable.js (originalTable / displayTable)
 *   - components/charts/DataTableView.js (renderer)
 */

/* eslint-disable react/prop-types */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { AlertCircle, LoaderCircle } from "lucide-react";

import DataTableView from "@/components/charts/DataTableView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { ImportConfigButton } from "@/components/chart-builder/ConfigActions";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";
import StepShell from "@/components/chart-builder/wizard/StepShell";
import { displayTable, originalTable } from "@/lib/export/exportTable";

const MODES = [
  {
    value: "chart",
    label: "Chart data",
    hint: "Only the columns this chart draws — fastest.",
  },
  {
    value: "filtered",
    label: "Source data (current filters)",
    hint: "Every column, limited to this chart's geography, source, and dates.",
  },
  {
    value: "full",
    label: "Entire dataset",
    hint: "The whole cleaned file — every row and column. Largest.",
  },
];

/** A module chart draws from an API dataset; BYOD keeps its table client-side. */
function isModuleSource(config, schema) {
  return config.data?.source !== "inline" && Boolean(schema.apiPath);
}

/**
 * The `view=table` URL for a module's full source table, or null when the source
 * is inline (no server dataset). "full" ignores the chart's filters; "filtered"
 * mirrors the chart's geography/source/date window and any pinned locations.
 */
function moduleTableUrl(config, schema, mode) {
  if (!isModuleSource(config, schema)) return null;
  const params = new URLSearchParams({ view: "table" });
  if (config.filters.subset) params.set("subset", config.filters.subset);
  if (config.filters.source) params.set("source", config.filters.source);
  if (mode === "full") {
    params.set("full", "1");
  } else {
    if (config.period.startYear) params.set("startYear", config.period.startYear);
    if (config.period.endYear) params.set("endYear", config.period.endYear);
    if (config.period.startMonth) params.set("startMonth", config.period.startMonth);
    if (config.period.endMonth) params.set("endMonth", config.period.endMonth);
    const locations = [
      ...new Set(
        (config.layers || [])
          .filter((layer) => layer.type === "selectedPlaces")
          .flatMap((layer) => layer.values || []),
      ),
    ];
    if (locations.length) params.set("locations", locations.join(","));
  }
  return `${schema.apiPath}?${params}`;
}

/**
 * Fetch (and cache) a module's full source table for the current mode. Returns a
 * { status, table, error } envelope in the same vocabulary the preview uses, so
 * the renderer treats module and inline sources identically. No-op (idle) when
 * `url` is null — i.e. chart mode or an inline source, which read the preview.
 */
function useModuleTable(config, url) {
  const [state, setState] = useState({ status: "idle", table: null, error: null });
  const cache = useRef(new Map());

  useEffect(() => {
    if (!url) {
      setState({ status: "idle", table: null, error: null });
      return undefined;
    }
    const cached = cache.current.get(url);
    if (cached) {
      setState({ status: cached.rows?.length ? "ready" : "empty", table: cached, error: null });
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    setState({ status: "loading", table: null, error: null });
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "The source data could not be loaded.");
        }
        return body;
      })
      .then((body) => {
        if (!active) return;
        const table = originalTable(config, {
          response: { records: body.records || [] },
        });
        const resolved = table || { filename: "original-data.csv", columns: [], rows: [] };
        cache.current.set(url, resolved);
        setState({
          status: resolved.rows?.length ? "ready" : "empty",
          table: resolved,
          error: null,
        });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setState({ status: "error", table: null, error });
      });

    return () => {
      active = false;
      controller.abort();
    };
    // `url` encodes every config field that changes the request; `config` is only
    // read to re-key column types off the returned records, so it need not retrigger.
  }, [url]);

  return state;
}

/**
 * Unify the preview-backed (chart / inline) and server-backed (module source)
 * paths into one { status, table, error } the panels render from.
 */
function useResolvedTable(mode) {
  const { config, schema } = useChartConfig();
  const preview = usePreview();
  const url = useMemo(
    () => (mode === "chart" ? null : moduleTableUrl(config, schema, mode)),
    [mode, config, schema],
  );
  const moduleTable = useModuleTable(config, url);

  return useMemo(() => {
    // Module source, a source mode selected → the fetched full table.
    if (url) {
      return { status: moduleTable.status, table: moduleTable.table, error: moduleTable.error };
    }
    // Otherwise read the already-loaded preview result (chart mode, or inline).
    const { status, result, error, renderError } = preview;
    if (status !== "ready" || !result) {
      return { status, table: null, error: error || renderError };
    }
    const table =
      mode === "chart"
        ? displayTable(config, result)
        : originalTable(config, result) || displayTable(config, result);
    return { status: "ready", table, error: null };
  }, [url, moduleTable, preview, mode, config]);
}

function DataTable({ resolved, schemaLabel }) {
  const { status, table, error } = resolved;

  if (status === "loading" || status === "idle") {
    return (
      <div
        role="status"
        className="flex h-full min-h-96 items-center justify-center gap-2 text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        Loading {schemaLabel} data…
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

  if (status === "error") {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Data could not be loaded</AlertTitle>
        <AlertDescription>
          <p>{error?.message || "The data request failed."}</p>
          <p>Try refreshing or adjust the editor selections.</p>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "empty" || !table || !table.rows?.length) {
    return (
      <div className="flex h-full min-h-96 items-center justify-center text-center text-muted-foreground">
        No data is available for this combination of fields, source, and period.
      </div>
    );
  }

  return (
    <DataTableView
      table={table}
      appearance={{ search: true, sortable: true, pageSize: 50 }}
    />
  );
}

function DataSummary({ mode, setMode, resolved, schemaLabel }) {
  const { table } = resolved;
  const active = MODES.find((option) => option.value === mode) || MODES[0];

  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-2 rounded-lg border bg-card p-3">
        <Label className="font-medium">Data view</Label>
        <RadioGroup value={mode} onValueChange={setMode} className="gap-2">
          {MODES.map((option) => (
            <label
              key={option.value}
              htmlFor={`data-view-${option.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-md p-1"
            >
              <RadioGroupItem
                id={`data-view-${option.value}`}
                value={option.value}
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="font-medium leading-none">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <p className="text-muted-foreground">
        {mode === "chart"
          ? "The exact rows and columns behind this chart, after the current source, filters, and date range."
          : mode === "filtered"
          ? "The source data behind this chart — every column of the cleaned dataset, kept to the current geography, source, and date range."
          : "The complete cleaned dataset — every row and column in the file, regardless of this chart's filters."}
      </p>

      <div className="grid gap-1 rounded-lg border bg-card p-3">
        <div className="font-medium">{schemaLabel}</div>
        {table ? (
          <div className="text-xs text-muted-foreground">
            {(table.rows?.length || 0).toLocaleString()} rows ×{" "}
            {table.columns?.length || 0} columns · {active.label}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Loading…</div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Change the source, filters, or date range in the Edit step to update what
        you see here. Export the full table from the Export step.
      </p>

      <div className="grid gap-2 rounded-lg border bg-card p-3">
        <Label className="font-medium">Load a saved chart</Label>
        <p className="text-xs text-muted-foreground">
          Import a chart config or workspace JSON exported from the Edit step.
        </p>
        <div className="self-start">
          <ImportConfigButton />
        </div>
      </div>
    </div>
  );
}

export default function ViewDataStep() {
  const { schema } = useChartConfig();
  const [mode, setMode] = useState("filtered");
  const resolved = useResolvedTable(mode);

  return (
    <StepShell
      title="View Data"
      preview={<DataTable resolved={resolved} schemaLabel={schema.label} />}
    >
      <DataSummary
        mode={mode}
        setMode={setMode}
        resolved={resolved}
        schemaLabel={schema.label}
      />
    </StepShell>
  );
}
