"use client";

/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import PlotlyChart from "./PlotlyChart";
import { loadChartData } from "@/components/chart-builder/chartData";
import { getBuiltInView } from "@/lib/visualization/categoryRegistry";
import { effectiveLabels } from "@/lib/visualization/deriveLabels";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";
import { toPlotly } from "@/lib/visualization/toPlotly";

export default function ChartPreview({ viewId }) {
  const config = getBuiltInView(viewId);
  const schema = getModuleSchema(config.module);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const controller = new AbortController();
    loadChartData(config, schema, controller.signal)
      .then((next) => {
        setResult(next);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [config, schema]);

  const plotly = useMemo(() => {
    if (!result) return null;
    try {
      const normalized = toPlotly({
        ...config,
        labels: effectiveLabels(config, schema),
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
      });
      return {
        ...normalized,
        config: { ...normalized.config, displayModeBar: false },
      };
    } catch {
      // Unknown chart type / adapter — fall through to "Preview unavailable".
      return null;
    }
  }, [config, result, schema.fields]);

  if (status === "loading") {
    return (
      <div className="flex h-[420px] items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    );
  }
  if (status === "error" || !plotly) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
        Preview unavailable
      </div>
    );
  }

  return <PlotlyChart {...plotly} height={420} className="w-full" />;
}
