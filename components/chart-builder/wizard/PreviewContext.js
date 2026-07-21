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
  categoryNamesOf,
  hasChartData,
  isChangeTransform,
  loadChartData,
  seriesCountOf,
  seriesNamesOf,
} from "@/components/chart-builder/chartData";
import { effectiveLabels } from "@/lib/visualization/deriveLabels";
import { toPlotly } from "@/lib/visualization/toPlotly";
import { hasBlockingErrors } from "@/lib/visualization/validation";
import { inlineRenderBlock } from "@/lib/visualization/inlineMapping";

const PreviewContext = createContext(null);

export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error("usePreview must be used inside a PreviewProvider.");
  }
  return context;
}

export function PreviewProvider({ children }) {
  const { dispatch, schema, workspace } = useChartConfig();
  const [previewState, setPreviewState] = useState({});
  // One graph div per chart slot; ExportMenu reads the active slot through the
  // compatibility `graphDivRef` below.
  const graphDivRefs = useRef({});

  const charts = workspace?.charts || [];
  const activeChartId = workspace?.activeChartId || charts[0]?.id;

  const requestKey = useMemo(
    () =>
      JSON.stringify(
        charts.map(({ id, config }) => {
          const fetchTransform =
            ["bar", "choroplethMap"].includes(config.chartType) &&
            isChangeTransform(config.transform)
              ? config.transform
              : null;
          return {
            id,
            chartType: config.chartType,
            bindings: config.bindings,
            period: config.period,
            filters: config.filters,
            layers: config.layers,
            sort: config.appearance.sort,
            data: config.data,
            fetchTransform,
          };
        }),
      ),
    [charts],
  );

  useEffect(() => {
    const controller = new AbortController();
    const initial = {};

    charts.forEach(({ id, config }) => {
      const isInline =
        schema.inlineOnly && config.data?.source === "inline" && config.data.inline;
      const inlineBlock = isInline
        ? inlineRenderBlock(config.chartType, config.data.inline, config.bindings)
        : null;
      const blocked = isInline
        ? Boolean(inlineBlock)
        : hasBlockingErrors(config.validation);

      if (blocked) {
        initial[id] = {
          status: "invalid",
          result: null,
          error: null,
          notice: inlineBlock,
        };
        return;
      }

      initial[id] = {
        status: "loading",
        result: null,
        error: null,
        notice: null,
      };

      loadChartData(config, schema, controller.signal)
        .then((next) => {
          dispatch({
            type: "SET_SERIES_COUNT",
            chartId: id,
            count: seriesCountOf(config.chartType, next),
            geoUnmatched: next.unmatched || [],
            seriesNames: seriesNamesOf(config.chartType, next),
            categoryNames: categoryNamesOf(config.chartType, next),
            ...(Object.hasOwn(next, "tabOptions")
              ? { tabOptions: next.tabOptions, tabValue: next.tabValue }
              : {}),
          });
          setPreviewState((current) => ({
            ...current,
            [id]: {
              status: hasChartData(config.chartType, next) ? "ready" : "empty",
              result: next,
              error: null,
              notice: null,
            },
          }));
        })
        .catch((nextError) => {
          if (nextError.name === "AbortError") return;
          setPreviewState((current) => ({
            ...current,
            [id]: {
              status: "error",
              result: null,
              error: nextError,
              notice: null,
            },
          }));
        });
    });

    setPreviewState((current) => {
      const next = {};
      for (const chart of charts) {
        next[chart.id] = initial[chart.id] || current[chart.id];
      }
      return next;
    });

    return () => {
      controller.abort();
      const ids = new Set(charts.map((chart) => chart.id));
      for (const id of Object.keys(graphDivRefs.current)) {
        if (!ids.has(id)) delete graphDivRefs.current[id];
      }
    };
  }, [requestKey, schema, dispatch]);

  const previews = useMemo(
    () =>
      charts.map(({ id, name, config }) => {
        const state = previewState[id] || {
          status: "loading",
          result: null,
          error: null,
          notice: null,
        };
        let plotly = null;
        let renderError = null;

        if (state.result) {
          try {
            const bindings =
              config.filters?.tabColumn &&
              config.filters.tabColumn === config.bindings?.group
                ? Object.fromEntries(
                    Object.entries(config.bindings).filter(([role]) => role !== "group"),
                  )
                : config.bindings;
            plotly = toPlotly({
              chartType: config.chartType,
              bindings,
              series: state.result.series,
              geometry: state.result.geometry,
              featureidkey: state.result.response?.featureidkey,
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
                startYear:
                  state.result.response?.startYear ?? config.period.startYear,
                endYear: state.result.response?.endYear ?? config.period.endYear,
              },
              referenceLines: config.referenceLines,
              layers: config.layers,
            });
          } catch (nextError) {
            renderError = nextError;
          }
        }

        return {
          id,
          name,
          config,
          active: id === activeChartId,
          graphDiv: graphDivRefs.current[id] || null,
          ...state,
          plotly,
          renderError,
        };
      }),
    [activeChartId, charts, previewState, schema],
  );

  const activePreview =
    previews.find((preview) => preview.id === activeChartId) || previews[0] || {};
  const graphDivRef = useMemo(
    () => ({
      get current() {
        return activePreview.id ? graphDivRefs.current[activePreview.id] : null;
      },
      set current(value) {
        if (activePreview.id) graphDivRefs.current[activePreview.id] = value;
      },
    }),
    [activePreview.id],
  );

  const value = useMemo(
    () => ({
      previews,
      status: activePreview.status || "loading",
      result: activePreview.result || null,
      error: activePreview.error || null,
      notice: activePreview.notice || null,
      plotly: activePreview.plotly || null,
      renderError: activePreview.renderError || null,
      graphDivRef,
      graphDivRefs,
      setGraphDiv(chartId, graphDiv) {
        if (chartId) graphDivRefs.current[chartId] = graphDiv;
      },
    }),
    [activePreview, graphDivRef, previews],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
