"use client";

/**
 * ModuleEditor.js — chart-builder orchestrator for one registered data module.
 *
 * Props:
 *   moduleId       {string}      — registered module identifier
 *   initialConfig  {Object}      — validated initial chart configuration
 *   viewId         {string|null} — saved or built-in deep-link view identifier
 *   hasBuiltInView {boolean}     — whether initialConfig already represents viewId
 *
 * Data sources:
 *   - Module schema from lib/visualization/moduleRegistry.js
 *   - Chart data through chartData.js and the module API route
 *   - Saved views from browser localStorage through savedViews.js
 *
 * UI Kit reference:
 *   - Composes the "Editor Sidebar", "Chart Container", and alert patterns
 */

/* eslint-disable react/prop-types */

import React, { useEffect, useMemo, useState } from "react";

import { AlertCircle, BarChart3, LoaderCircle } from "lucide-react";

import ChartSidebar from "@/components/chart-builder/ChartSidebar";
import {
  ChartConfigProvider,
  useChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  hasChartData,
  loadChartData,
  seriesCountOf,
} from "@/components/chart-builder/chartData";
import { deserialize, getView } from "@/components/chart-builder/savedViews";
import { effectiveLabels } from "@/lib/visualization/deriveLabels";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { toPlotly } from "@/lib/visualization/toPlotly";
import { hasBlockingErrors } from "@/lib/visualization/validation";

import { CHART_SIDEBAR } from "@/lib/constants";

const SIDEBAR_SCALE_KEY = "chartSidebarScale";

function clampScale(value) {
  if (!Number.isFinite(value)) return CHART_SIDEBAR.minScale;
  return Math.min(
    CHART_SIDEBAR.maxScale,
    Math.max(CHART_SIDEBAR.minScale, value),
  );
}

export default function ModuleEditor({
  moduleId,
  initialConfig,
  viewId,
  hasBuiltInView = false,
}) {
  const schema = getModuleSchema(moduleId);
  const [scale, setScale] = useState(CHART_SIDEBAR.minScale);

  // Restore persisted client-only state after hydration.
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(SIDEBAR_SCALE_KEY));
    if (saved) setScale(clampScale(saved));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_SCALE_KEY, String(scale));
  }, [scale]);

  return (
    <ChartConfigProvider schema={schema} initialConfig={initialConfig}>
      <SidebarProvider
        style={{
          "--sidebar-width": `${(CHART_SIDEBAR.baseRem * scale).toFixed(3)}rem`,
        }}
      >
        <ViewHydrator viewId={viewId} hasBuiltInView={hasBuiltInView} />
        <ChartSidebar scale={scale} onScaleChange={setScale} />
        <ChartWorkspace />
      </SidebarProvider>
    </ChartConfigProvider>
  );
}

/**
 * ======================================================================
 * Tightly Coupled Sub-components
 * ======================================================================
 */

function ViewHydrator({ viewId, hasBuiltInView }) {
  const { dispatch, schema } = useChartConfig();

  useEffect(() => {
    if (!viewId || hasBuiltInView) return;
    try {
      const local = getView(viewId, schema);
      if (local) {
        dispatch({ type: "LOAD_VIEW", config: local });
        return;
      }
      const imported = deserialize(decodeURIComponent(viewId), schema);
      dispatch({ type: "LOAD_VIEW", config: imported });
    } catch {
      // Unknown deep links fall back to the module's default preset.
    }
  }, [dispatch, hasBuiltInView, schema, viewId]);

  return null;
}

function ChartWorkspace() {
  const { config, dispatch, schema } = useChartConfig();
  const { state, isMobile, openMobile } = useSidebar();
  // Closed sidebar → show the reopen toggle (mobile tracks its own open state).
  const showOpenTrigger = isMobile ? !openMobile : state === "collapsed";
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        chartType: config.chartType,
        bindings: config.bindings,
        period: config.period,
        filters: config.filters,
        layers: config.layers,
        sort: config.appearance.sort,
      }),
    [
      config.appearance.sort,
      config.bindings,
      config.chartType,
      config.filters,
      config.layers,
      config.period,
    ],
  );

  useEffect(() => {
    if (hasBlockingErrors(config.validation)) {
      setStatus("invalid");
      setResult(null);
      return undefined;
    }

    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    loadChartData(config, schema, controller.signal)
      .then((next) => {
        dispatch({
          type: "SET_SERIES_COUNT",
          count: seriesCountOf(config.chartType, next),
        });
        if (!hasChartData(config.chartType, next)) {
          setStatus("empty");
          setResult(next);
          return;
        }
        setResult(next);
        setStatus("ready");
      })
      .catch((nextError) => {
        if (nextError.name === "AbortError") return;
        setError(nextError);
        setStatus("error");
      });
    return () => controller.abort();
  }, [requestKey, schema]);

  const { plotly, renderError } = useMemo(() => {
    if (!result) return { plotly: null, renderError: null };

    try {
      return {
        plotly: toPlotly({
          chartType: config.chartType,
          bindings: config.bindings,
          series: result.series,
          geometry: result.geometry,
          featureidkey: result.response?.featureidkey,
          field:
            schema.fields[
              config.bindings.y ||
                config.bindings.color ||
                config.bindings.start
            ],
          transforms: {
            id: config.transform,
            baseYear: config.period.baseYear,
          },
          labels: effectiveLabels(config, schema),
          appearance: config.appearance,
          period: {
            ...config.period,
            startYear: result.response?.startYear ?? config.period.startYear,
            endYear: result.response?.endYear ?? config.period.endYear,
          },
          referenceLines: config.referenceLines,
          layers: config.layers,
        }),
        renderError: null,
      };
    } catch (nextError) {
      return { plotly: null, renderError: nextError };
    }
  }, [config, result, schema.fields]);

  return (
    <SidebarInset className="min-w-0 overflow-x-hidden bg-muted/35">
      {/* When the sidebar is closed, a toggle parks at the left edge of the page
          to reopen it; the open-state toggle lives inside the sidebar itself. */}
      {showOpenTrigger ? (
        <SidebarTrigger className="fixed left-2 top-[calc(var(--sb-top)+0.5rem)] z-20 size-8 rounded-md border bg-background shadow-sm" />
      ) : null}

      <main className="flex-1 p-4 sm:p-6">
        <Card className="min-w-0 min-h-[calc(100svh-12rem)] overflow-hidden shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 aria-hidden="true" className="size-5 text-ppic-brand" />
              {schema.label}
            </CardTitle>
            <CardDescription>
              {config.labels.subtitle ||
                "Use the graph editor to configure fields, comparisons, and labels."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 min-h-130 items-center justify-center overflow-hidden px-2 pt-6 sm:px-6">
            {status === "loading" ? (
              <div
                role="status"
                className="flex items-center gap-2 text-muted-foreground"
              >
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                Loading visualization…
              </div>
            ) : null}
            {status === "invalid" ? (
              <div className="max-w-md text-center text-muted-foreground">
                Resolve the configuration errors in the graph editor to render
                this view.
              </div>
            ) : null}
            {status === "empty" ? (
              <div className="max-w-md text-center text-muted-foreground">
                No data is available for this combination of fields, geography,
                source, and period.
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
                  <p>Try refreshing or adjust the graph-editor selections.</p>
                </AlertDescription>
              </Alert>
            ) : null}
            {status === "ready" && plotly && !renderError ? (
              <PlotlyChart {...plotly} className="min-w-0 w-full" />
            ) : null}
          </CardContent>
        </Card>
      </main>
    </SidebarInset>
  );
}
