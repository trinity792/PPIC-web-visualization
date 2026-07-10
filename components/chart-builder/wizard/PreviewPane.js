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
 *   (none — reads PreviewProvider via usePreview())
 *
 * Data sources:
 *   - components/chart-builder/wizard/PreviewContext.js
 */

import React from "react";

import { AlertCircle, LoaderCircle } from "lucide-react";

import PlotlyChart from "@/components/charts/PlotlyChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";

export default function PreviewPane() {
  const { status, error, plotly, renderError, graphDivRef } = usePreview();

  return (
    <div className="flex min-h-130 items-center justify-center overflow-hidden px-2 pt-2 sm:px-6">
      {status === "loading" ? (
        <div role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          Loading visualization…
        </div>
      ) : null}
      {status === "invalid" ? (
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
      {status === "ready" && plotly && !renderError ? (
        <PlotlyChart
          {...plotly}
          className="min-w-0 w-full"
          onGraphDiv={(graphDiv) => {
            graphDivRef.current = graphDiv;
          }}
        />
      ) : null}
    </div>
  );
}
