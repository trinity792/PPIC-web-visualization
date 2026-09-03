"use client";

/**
 * ChartContainer.js — the module workbench's right-hand card.
 *
 * The module title, a body that shows either the chart or the data behind it,
 * and the action footer.
 *
 * **View Data shows the entire cleaned dataset** — every row and every column of
 * the module's CSV, fetched once via `?view=table&full=1` and cached for the
 * session. Not the narrowed table the chart draws: a reader who switches to the
 * data is asking what is in the file, and the chart's own columns are already
 * visible as the chart. Bring-your-own-data has no server dataset, so it shows
 * the full pasted table with no request.
 *
 * Props:
 *   embedded {boolean} — iframe mode: the chart only, no title and no footer
 *
 * Data sources:
 *   - components/chart-builder/wizard/PreviewContext.js (status + loaded result)
 *   - components/chart-builder/chartData.js (loadFullTable → ?view=table&full=1)
 *   - lib/export/exportTable.js (originalTable)
 *   - lib/visualization/topicRegistry.js (hardcoded topic documentation routes)
 *
 * UI Kit reference:
 *   - Implements the "Chart Container" pattern
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AlertCircle, LoaderCircle } from "lucide-react";

import DataTableView from "@/components/charts/DataTableView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { loadFullTable } from "@/components/chart-builder/chartData";
import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";
import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import ChartContainerFooter from "@/components/chart-builder/workbench/ChartContainerFooter";
import { originalTable } from "@/lib/export/exportTable";
import { getTopicDocumentationHref } from "@/lib/visualization/topicRegistry";

// ── The full-dataset table ───────────────────────────────────────────

/**
 * Load the whole cleaned dataset for View Data, lazily and once.
 *
 * Deliberately not fetched until the reader first opens the data view: it is the
 * entire file, and most sessions never look at it. Cached per component so
 * toggling back and forth costs nothing.
 */
function useFullTable(active) {
  const { config, schema } = useChartConfig();
  const [state, setState] = useState({ status: "idle", table: null, error: null });
  const loadedRef = useRef(false);

  const inline =
    config.question?.dataset?.kind === "inline" || config.data?.source === "inline";

  useEffect(() => {
    if (!active || loadedRef.current) return undefined;

    // Bring-your-own-data already holds the whole table in the config.
    if (inline) {
      loadedRef.current = true;
      const table = originalTable(config, { response: { records: [] } });
      setState({
        status: table?.rows?.length ? "ready" : "empty",
        table,
        error: null,
      });
      return undefined;
    }

    let live = true;
    const controller = new AbortController();
    setState({ status: "loading", table: null, error: null });

    loadFullTable(config, schema, controller.signal)
      .then((body) => {
        if (!live || !body) return;
        loadedRef.current = true;
        const table = originalTable(config, { response: body });
        setState({
          status: table?.rows?.length ? "ready" : "empty",
          table,
          error: null,
        });
      })
      .catch((error) => {
        if (!live || error.name === "AbortError") return;
        setState({ status: "error", table: null, error });
      });

    return () => {
      live = false;
      controller.abort();
    };
    // `config`/`schema` are read to build the request and re-key column types;
    // the dataset itself does not change with the chart's settings, so opening
    // the view is the only trigger.
  }, [active]);

  return state;
}

function FullDataTable({ status, table, error, schemaLabel }) {
  if (status === "loading" || status === "idle") {
    return (
      <div
        role="status"
        className="flex h-full min-h-96 items-center justify-center gap-2 text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        Loading the full {schemaLabel} dataset…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full min-h-96 items-center justify-center">
        <Alert variant="destructive" className="max-w-xl">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>The dataset could not be loaded</AlertTitle>
          <AlertDescription>
            <p>{error?.message || "The data request failed."}</p>
            {error?.source ? <p>Source: {error.source}</p> : null}
            <p>Try refreshing, or switch back to the chart.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (status === "empty" || !table?.rows?.length) {
    return (
      <div className="flex h-full min-h-96 items-center justify-center text-center text-muted-foreground">
        This dataset returned no rows.
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

// ── Component ────────────────────────────────────────────────────────

/**
 * Hold the body at the height the chart view renders at, so toggling to the data
 * view does not resize the card.
 *
 * Measured rather than hard-coded: the chart view's height is PreviewPane's
 * `min-h-130` floor or the taller of the plot, its border and its tab row,
 * depending on chart type — a constant here would drift the moment any of those
 * changed. The data table is bounded instead of allowed to grow, because it
 * paginates 50 rows and would otherwise make both the card and the sidebar that
 * stretches to it jump on every toggle.
 *
 * Re-measures when the preview status changes, since the skeleton, the spinner
 * and a rendered chart are not all the same height. Also re-measures when the
 * chart grid itself changes shape (a chart added/removed, or the layout
 * switched) — F4: a 2x2 grid measures a different height than a single chart,
 * and that height must not stay pinned to whatever a prior grid measured.
 */
function useChartViewHeight(viewMode, status, workspace) {
  const bodyRef = useRef(null);
  const [height, setHeight] = useState(null);

  useLayoutEffect(() => {
    if (viewMode !== "chart") return;
    // 0 in jsdom, which has no layout; the CSS floor stands in.
    const measured = bodyRef.current?.offsetHeight;
    if (measured) setHeight(measured);
  }, [viewMode, status, workspace?.charts?.length, workspace?.layout]);

  return { bodyRef, height };
}

export default function ChartContainer({ embedded = false }) {
  const { schema, workspace } = useChartConfig();
  const { status, result, graphDivRef, graphDivRefs, previews } = usePreview();
  const [viewMode, setViewMode] = useState("chart");
  const documentationHref = getTopicDocumentationHref(schema.id);
  // Lifted above the toggle so the loaded dataset survives switching back to the
  // chart — the table unmounts, but the fetch must not repeat.
  const dataset = useFullTable(viewMode === "data");
  const { bodyRef, height } = useChartViewHeight(viewMode, status, workspace);

  if (embedded) return <PreviewPane embedded />;

  return (
    <Card className="min-w-0 p-4 sm:p-6">
      <h2 className="mb-4 text-center font-heading text-xl font-semibold">
        <span className="inline-block border-b-2 border-ppic-brand pb-1">
          {schema.label}
        </span>
      </h2>

      <div
        ref={bodyRef}
        className="min-h-130 min-w-0 overflow-hidden rounded-lg border p-2 sm:p-3"
        style={viewMode === "data" && height ? { height } : undefined}
      >
        {viewMode === "chart" ? (
          <PreviewPane />
        ) : (
          // h-full so DataTableView fills the pinned box: it is already a flex
          // column that scrolls its own body and keeps the pager in view.
          <div className="h-full">
            <FullDataTable {...dataset} schemaLabel={schema.label} />
          </div>
        )}
      </div>

      <ChartContainerFooter
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        status={status}
        graphDivRef={graphDivRef}
        loaded={result}
        previews={previews}
        graphDivRefs={graphDivRefs}
        documentationHref={documentationHref}
      />
    </Card>
  );
}
