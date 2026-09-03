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
 *   children           {ReactNode}
 *   deferInitialRender {boolean} — hold the first fetch until the reader touches
 *     a control, reporting status "idle" until then. The module workbench opts
 *     in so landing on `/[module]` costs no request and shows a skeleton; the
 *     standalone wizard leaves it off, because its Import step means the reader
 *     has already supplied data by the time a chart is in view.
 *
 * Statuses: idle | unconfigured | loading | invalid | empty | error | ready.
 * `unconfigured` is the manual-encoding counterpart to `idle` — a required
 * encoding is still unset (see `isUnconfigured`), so the pane draws the skeleton
 * and no request goes out. It is deliberately not `invalid`: on the module
 * workbench, which binds nothing on the reader's behalf, an unset role is where
 * every chart starts and where every chart-type switch can land.
 *
 * Data sources:
 *   - components/chart-builder/chartData.js (loadChartData; inline or API)
 *   - lib/visualization/toPlotly.js
 */

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
  axisRangesOf,
  categoryNamesOf,
  hasChartData,
  isChangeTransform,
  legendNamesOf,
  loadChartData,
  loadObservationGeometry,
  loadObservations,
  seriesCountOf,
  seriesNamesOf,
} from "@/components/chart-builder/chartData";
import { effectiveLabels } from "@/lib/visualization/deriveLabels";
import { toPlotly } from "@/lib/visualization/toPlotly";
import { adaptObservations } from "@/lib/visualization/adapters";
import { missingQuestionSelections } from "@/lib/visualization/questionReadiness";
import { hasBlockingErrors, isIncomplete } from "@/lib/visualization/validation";
import { inlineRenderBlock } from "@/lib/visualization/inlineMapping";

const PreviewContext = createContext(null);

export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error("usePreview must be used inside a PreviewProvider.");
  }
  return context;
}

/** Deferred, pre-arming state: no request has been made and none is pending. */
const IDLE = { status: "idle", result: null, error: null, notice: null };

/**
 * Settings still to be made: a required encoding is unbound. Distinct from
 * "invalid", which means a setting the reader *did* make cannot work.
 */
const UNCONFIGURED = {
  status: "unconfigured",
  result: null,
  error: null,
  notice: null,
};

const V3_MAP_TYPES = ["choroplethMap", "symbolMap"];

function v3QuestionKey(config) {
  return JSON.stringify(config.question);
}

function v3GeometryAdapter(config) {
  const chartType = config.presentation?.chartType;
  return V3_MAP_TYPES.includes(chartType) ? chartType : null;
}

function v3LoadKey(config) {
  return JSON.stringify({
    question: config.question,
    // The data question is chart-independent, but the client-side geography
    // artifact is not: choropleths need polygons and symbol maps need points.
    geometryAdapter: v3GeometryAdapter(config),
  });
}

function canHoldV3MapWhileLoading(state, config) {
  return Boolean(
    state?.result &&
      state.questionKey === v3QuestionKey(config) &&
      V3_MAP_TYPES.includes(state.chartType) &&
      V3_MAP_TYPES.includes(config.presentation?.chartType) &&
      state.chartType !== config.presentation?.chartType,
  );
}

function adaptV3Result(config, schema, result, chartType) {
  const summaries = new Map(
    (result.comparisons || []).map((entry) => [entry.id, entry]),
  );
  return adaptObservations({
    chartType: chartType || config.presentation?.chartType,
    observations: result.observations || [],
    comparisons: (config.question.comparisons || []).map((comparison) => ({
      ...comparison,
      label: summaries.get(comparison.id)?.label || comparison.label || comparison.id,
    })),
    presentation: config.presentation,
    labels: effectiveLabels(config, schema),
    appearance: config.presentation?.appearance || {},
    format: config.presentation?.format || {},
    geometry: result.geometry || null,
  });
}

/**
 * Is this chart simply unfinished rather than misconfigured?
 *
 * Only on a manual-encoding surface (`autoBind: false`, the module workbench).
 * Everywhere else the store has already bound every required role, so an
 * unbound one really is a fault and keeps its error. Bring-your-own-data is
 * excluded too: `inlineRenderBlock` already explains its unmapped columns, and
 * auto-mapping means an unset role there is a genuine dead end.
 */
function isUnconfigured(config, schema, autoBind) {
  if (autoBind !== false) return false;
  if (schema.inlineOnly && config.data?.source === "inline") return false;
  return isIncomplete(config.validation);
}

export function PreviewProvider({ children, deferInitialRender = false }) {
  const { autoBind, canUndo, dispatch, schema, workspace } = useChartConfig();
  const [previewState, setPreviewState] = useState({});
  // `canUndo` is the store's own record that a user-initiated, workspace-changing
  // action landed — undo history deliberately excludes COMPUTED_ACTIONS, so the
  // loader's own SET_SERIES_COUNT feedback cannot arm the chart and cause the
  // very fetch loop this defers. Sticky: undoing back to the start leaves the
  // chart rendered rather than blanking it.
  const [armed, setArmed] = useState(!deferInitialRender);
  useEffect(() => {
    if (!armed && canUndo) setArmed(true);
  }, [armed, canUndo]);
  // One graph div per chart slot; ExportMenu reads the active slot through the
  // compatibility `graphDivRef` below.
  const graphDivRefs = useRef({});

  const charts = workspace?.charts || [];
  const activeChartId = workspace?.activeChartId || charts[0]?.id;

  const requestKey = useMemo(
    () =>
      JSON.stringify(
        charts.map(({ id, config }) => {
          if (config.version === 3) {
            return { id, loadKey: v3LoadKey(config) };
          }
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
    // Deferred and untouched: report idle and issue no request at all. This is
    // the whole point — landing on a module page must not fetch.
    if (!armed) {
      setPreviewState(Object.fromEntries(charts.map((chart) => [chart.id, IDLE])));
      return undefined;
    }

    const controller = new AbortController();
    const initial = {};

    charts.forEach(({ id, config }) => {
      const v3 = config.version === 3;
      const loadKey = v3 ? v3LoadKey(config) : null;
      const unfinishedQuestion = v3 && missingQuestionSelections(config, schema).length > 0;
      // Nothing to ask the server for until the reader has said what to plot.
      // This is what keeps a half-set chart on the skeleton instead of firing a
      // request that could only fail, and it is why switching chart type on the
      // workbench raises no error.
      if ((!v3 && isUnconfigured(config, schema, autoBind)) || unfinishedQuestion) {
        initial[id] = UNCONFIGURED;
        return;
      }

      const isInline = !v3 &&
        schema.inlineOnly && config.data?.source === "inline" && config.data.inline;
      const inlineBlock = isInline
        ? inlineRenderBlock(config.chartType, config.data.inline, config.bindings)
        : null;
      const blocked = v3
        ? !config.question?.outcome?.measureId || !config.question?.comparisons?.length
        : isInline
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
        loadKey,
      };

      const load = v3
        ? Promise.all([
            loadObservations(config, {
              apiPath: schema.apiPath,
              signal: controller.signal,
            }),
            loadObservationGeometry(
              config.presentation?.chartType,
              config.question?.geography?.subset,
              controller.signal,
            ),
          ]).then(([result, geometry]) => ({ ...result, geometry }))
        : loadChartData(config, schema, controller.signal);
      load
        .then((next) => {
          if (v3) {
            let seriesNames = [];
            if (next.observations?.length) {
              const figure = adaptV3Result(config, schema, next);
              seriesNames = (figure.data || [])
                .map((trace) => trace.name)
                .filter((name) => name != null && name !== "");
            }
            dispatch({
              type: "SET_SERIES_COUNT",
              chartId: id,
              count: seriesNames.length,
              seriesNames,
              legendNames: seriesNames,
              issues: next.issues || [],
            });
            setPreviewState((current) => ({
              ...current,
              [id]: {
                status: next.blocked
                  ? "invalid"
                  : next.observations?.length
                    ? "ready"
                    : "empty",
                result: next,
                error: null,
                notice: null,
                loadKey,
                questionKey: v3QuestionKey(config),
                chartType: config.presentation?.chartType,
              },
            }));
            return;
          }
          dispatch({
            type: "SET_SERIES_COUNT",
            chartId: id,
            count: seriesCountOf(config.chartType, next),
            geoUnmatched: next.unmatched || [],
            seriesNames: seriesNamesOf(config.chartType, next),
            legendNames: legendNamesOf(config, next),
            categoryNames: categoryNamesOf(config.chartType, next),
            axisRanges: axisRangesOf(config, next),
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
              loadKey,
            },
          }));
        });
    });

    setPreviewState((current) => {
      const next = {};
      for (const chart of charts) {
        const pending = initial[chart.id];
        next[chart.id] =
          pending?.status === "loading" &&
          canHoldV3MapWhileLoading(current[chart.id], chart.config)
            ? current[chart.id]
            : pending || current[chart.id];
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
  }, [armed, autoBind, requestKey, schema, dispatch]);

  const previews = useMemo(
    () =>
      charts.map(({ id, name, config }) => {
        // An unfinished chart reads as unconfigured immediately, ahead of any
        // state the effect has yet to overwrite — clearing a binding must show
        // the skeleton on the same commit, not flash the previous chart until
        // the load effect catches up. Otherwise: a slot the effect has not
        // reached yet is loading, unless the provider is still deferred.
        let state = (
          config.version === 3
            ? missingQuestionSelections(config, schema).length > 0
            : isUnconfigured(config, schema, autoBind)
        )
          ? UNCONFIGURED
          : previewState[id] ||
            (armed
              ? { status: "loading", result: null, error: null, notice: null }
              : IDLE);
        let renderChartType =
          config.presentation?.chartType || config.chartType;
        if (
          config.version === 3 &&
          state.result &&
          state.loadKey !== v3LoadKey(config)
        ) {
          if (canHoldV3MapWhileLoading(state, config)) {
            // Keep the fully drawn map mounted until the other geometry
            // artifact arrives. Purging a geo plot while Plotly is still
            // settling its projection can leave an asynchronous autorange
            // callback pointed at a graph div that no longer exists.
            renderChartType = state.chartType;
          } else {
            state = { status: "loading", result: null, error: null, notice: null };
          }
        }
        let plotly = null;
        let renderError = null;

        if (state.result) {
          try {
            if (config.version === 3) {
              plotly = adaptV3Result(config, schema, state.result, renderChartType);
            } else {
            const activeLegacyTabColumn = config.filters?.["tabColumn"];
            const bindings =
              activeLegacyTabColumn &&
              activeLegacyTabColumn === config.bindings?.group
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
            }
          } catch (nextError) {
            renderError = nextError;
          }
        }

        return {
          id,
          name,
          config,
          renderChartType,
          active: id === activeChartId,
          graphDiv: graphDivRefs.current[id] || null,
          ...state,
          plotly,
          renderError,
        };
      }),
    [activeChartId, armed, autoBind, charts, previewState, schema],
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
      status: activePreview.status || (armed ? "loading" : "idle"),
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
    [activePreview, armed, graphDivRef, previews],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
