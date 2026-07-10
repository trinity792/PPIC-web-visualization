"use client";

/**
 * PreviewContext.js — shared live-preview state for the visualization wizard.
 *
 * Lifts the data-load + toPlotly pipeline that used to live inside
 * ModuleEditor's ChartWorkspace into a provider, so a single loaded result and
 * a single mounted Plotly graph div are shared across wizard steps. The Chart
 * Type / Edit steps render the chart through <PreviewPane>; the Export step
 * reads the same `result` and `graphDivRef` to drive ExportMenu — all off one
 * fetch and one graph div.
 *
 * Props (PreviewProvider):
 *   children {ReactNode}
 *
 * Data sources:
 *   - components/chart-builder/chartData.js (loadChartData; inline or API)
 *   - lib/visualization/toPlotly.js
 */

/* eslint-disable react/prop-types */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  hasChartData,
  isChangeTransform,
  loadChartData,
  seriesCountOf,
  seriesNamesOf,
} from "@/components/chart-builder/chartData";
import { effectiveLabels } from "@/lib/visualization/deriveLabels";
import { toPlotly } from "@/lib/visualization/toPlotly";
import { hasBlockingErrors } from "@/lib/visualization/validation";

const PreviewContext = createContext(null);

export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error("usePreview must be used inside a PreviewProvider.");
  }
  return context;
}

export function PreviewProvider({ children }) {
  const { config, dispatch, schema } = useChartConfig();
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  // The mounted Plotly graph div, handed up by PlotlyChart, so ExportMenu can
  // drive Plotly.toImage without importing Plotly itself.
  const graphDivRef = useRef(null);

  // Bar/choropleth change transforms alter WHAT is fetched (two-period data),
  // so the transform joins the request digest for those charts only.
  const fetchTransform =
    ["bar", "choroplethMap"].includes(config.chartType) &&
    isChangeTransform(config.transform)
      ? config.transform
      : null;

  const requestKey = useMemo(
    () =>
      JSON.stringify({
        chartType: config.chartType,
        bindings: config.bindings,
        period: config.period,
        filters: config.filters,
        layers: config.layers,
        sort: config.appearance.sort,
        data: config.data,
        fetchTransform,
      }),
    [
      config.appearance.sort,
      config.bindings,
      config.chartType,
      config.data,
      config.filters,
      config.layers,
      config.period,
      fetchTransform,
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
          geoUnmatched: next.unmatched || [],
          seriesNames: seriesNamesOf(config.chartType, next),
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
    // requestKey captures the config inputs that change the query; schema is stable.
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

  const value = useMemo(
    () => ({ status, result, error, plotly, renderError, graphDivRef }),
    [status, result, error, plotly, renderError],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
