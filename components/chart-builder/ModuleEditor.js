"use client";

/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/sidebar";
import PlotlyChart from "@/components/charts/PlotlyChart";
import { toPlotly } from "@/lib/visualization/toPlotly";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { hasBlockingErrors } from "@/lib/visualization/validation";
import ChartSidebar from "./ChartSidebar";
import {
  ChartConfigProvider,
  useChartConfig,
} from "./chartConfigStore";
import { hasChartData, loadChartData, seriesCountOf } from "./chartData";
import { deserialize, getView } from "./savedViews";

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

  const plotly = useMemo(() => {
    if (!result) return null;
    return toPlotly({
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
      labels: config.labels,
      appearance: config.appearance,
      period: {
        ...config.period,
        startYear: result.response?.startYear ?? config.period.startYear,
        endYear: result.response?.endYear ?? config.period.endYear,
      },
      referenceLines: config.referenceLines,
      layers: config.layers,
    });
  }, [config, result, schema.fields]);

  return (
    <SidebarInset className="min-w-0 overflow-x-hidden bg-muted/35">
      <header className="flex min-h-14 items-center gap-3 border-b bg-background px-4 sm:px-6">
        <SidebarTrigger />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-lg font-semibold">
            {config.labels.title || schema.label}
          </h1>
        </div>
        <Badge variant="outline" className="hidden sm:inline-flex">
          {config.chartType}
        </Badge>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <Card className="min-w-0 min-h-[calc(100svh-12rem)] overflow-hidden shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="size-5 text-(--ppic-brand)" />
              {schema.label}
            </CardTitle>
            <CardDescription>
              {config.labels.subtitle ||
                "Use the graph editor to configure fields, comparisons, and labels."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 min-h-130 items-center justify-center overflow-hidden px-2 pt-6 sm:px-6">
            {status === "loading" ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" />
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
            {status === "error" ? (
              <Alert variant="destructive" className="max-w-xl">
                <AlertCircle />
                <AlertTitle>Visualization could not be loaded</AlertTitle>
                <AlertDescription>
                  <p>{error?.message}</p>
                  {error?.source ? <p>Source: {error.source}</p> : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {status === "ready" && plotly ? (
              <PlotlyChart {...plotly} className="min-w-0 w-full" />
            ) : null}
          </CardContent>
        </Card>
      </main>
    </SidebarInset>
  );
}

export default function ModuleEditor({
  moduleId,
  initialConfig,
  viewId,
  hasBuiltInView = false,
}) {
  const schema = getModuleSchema(moduleId);
  return (
    <ChartConfigProvider schema={schema} initialConfig={initialConfig}>
      <SidebarProvider>
        <ViewHydrator viewId={viewId} hasBuiltInView={hasBuiltInView} />
        <ChartSidebar />
        <ChartWorkspace />
      </SidebarProvider>
    </ChartConfigProvider>
  );
}
