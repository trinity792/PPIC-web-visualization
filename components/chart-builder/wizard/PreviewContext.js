"use client";

/**
 * PreviewContext.js — shared live-preview state for the visualization wizard.
 *
 * Lifts the question-load + observation-adapter pipeline into a provider, so
 * a single loaded answer and a single mounted Plotly graph div are shared
 * across wizard steps. The Chart Type / Edit steps render the chart through
 * <PreviewPane>; the Export step reads the same `result` and `graphDivRef` to
 * drive ExportMenu — all off one request and one graph div.
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
 * `unconfigured` is the counterpart to `idle` — the question still has a
 * selection to make (see `missingQuestionSelections`), so the pane draws the
 * skeleton and no request goes out. It is deliberately not `invalid`: the
 * editors choose nothing on the reader's behalf, so an unanswered question is
 * where every chart starts and where every chart-type switch can land.
 *
 * Each preview's drawable result is tagged with the renderer that produced it
 * (`chart.renderer`, "plotly" or "visx"; renderer plan Workstream B). The
 * registry's `rendererFor` picks it per chart type. A `renderer=visx|plotly`
 * page address parameter asks for a preview drawing; it is ignored in embed
 * mode (`embed=1`), so a shared embed always shows the default.
 *
 * Data sources:
 *   - components/chart-builder/chartData.js (loadObservations; inline or API)
 *   - lib/visualization/adapters (observations → Plotly figure)
 *   - lib/visualization/models (observations → visx chart model)
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
  loadObservationGeometry,
  loadObservations,
} from "@/components/chart-builder/chartData";
import { adaptObservations } from "@/lib/visualization/adapters";
import { rendererFor } from "@/lib/visualization/chartRegistry";
import { buildChartModel } from "@/lib/visualization/models";
import { previewInput } from "@/lib/visualization/previewInput";
import { missingQuestionSelections } from "@/lib/visualization/questionReadiness";

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

/**
 * The renderer preview request in the page address, or null. Read after mount
 * (never during render), so server and first client render agree and no router
 * hook is needed. Embeds never honor it.
 */
function previewRendererRequest() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "1") return null;
  return params.get("renderer");
}

function adaptV3Result(config, schema, result, chartType, previewRenderer) {
  const input = previewInput(config, schema, result, chartType);
  const renderer = rendererFor(input.chartType, previewRenderer);
  if (renderer === "visx") {
    return {
      renderer,
      chartType: input.chartType,
      model: buildChartModel(input),
      // What ChartFrame draws around a visx chart. Plotly charts keep their
      // titles inside Plotly until export can draw the frame (Workstream M).
      frame: {
        labels: input.labels,
        appearance: input.appearance,
        observations: input.observations,
        // The topic's full citations, for the source line.
        sourceCitations: schema?.sourceCitations || null,
      },
    };
  }
  return { ...adaptObservations(input), renderer, chartType: input.chartType };
}

export function PreviewProvider({ children, deferInitialRender = false }) {
  const { canUndo, dispatch, schema, workspace } = useChartConfig();
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
  const [previewRenderer, setPreviewRenderer] = useState(null);
  useEffect(() => {
    setPreviewRenderer(previewRendererRequest());
  }, []);

  const charts = workspace?.charts || [];
  const activeChartId = workspace?.activeChartId || charts[0]?.id;

  const requestKey = useMemo(
    () =>
      JSON.stringify(
        charts.map(({ id, config }) => ({ id, loadKey: v3LoadKey(config) })),
      ),
    [charts],
  );

  useEffect(() => {
    // Deferred and untouched: report idle and issue no request at all. This is
    // the whole point — landing on a module page must not fetch.
    if (!armed) {
      setPreviewState(
        Object.fromEntries(charts.map((chart) => [chart.id, IDLE])),
      );
      return undefined;
    }

    const controller = new AbortController();
    const initial = {};

    charts.forEach(({ id, config }) => {
      const loadKey = v3LoadKey(config);
      // Nothing to ask the server for until the reader has said what to plot.
      // This is what keeps a half-set chart on the skeleton instead of firing a
      // request that could only fail, and it is why switching chart type on the
      // workbench raises no error.
      if (missingQuestionSelections(config, schema).length > 0) {
        initial[id] = UNCONFIGURED;
        return;
      }
      if (
        !config.question?.outcome?.measureId ||
        !config.question?.comparisons?.length
      ) {
        initial[id] = {
          status: "invalid",
          result: null,
          error: null,
          notice: null,
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

      const load = Promise.all([
        loadObservations(config, {
          apiPath: schema.apiPath,
          signal: controller.signal,
        }),
        loadObservationGeometry(
          config.presentation?.chartType,
          config.question?.geography?.subset,
          controller.signal,
        ),
      ]).then(([result, geometry]) => ({ ...result, geometry }));
      load
        .then((next) => {
          let seriesNames = [];
          if (next.observations?.length) {
            // Series names come from the Plotly adapter's traces whichever
            // renderer draws the chart; they feed the editor, not the drawing.
            const figure = adaptObservations(previewInput(config, schema, next));
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
          // A blocked v3 answer says why in its blocking issues; show those
          // words rather than the generic "resolve the configuration errors".
          const blockingMessage = next.blocked
            ? (next.issues || [])
                .filter((issue) => issue.level === "blocking" && issue.message)
                .map((issue) => issue.message)
                .join(" ")
            : "";
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
              notice: blockingMessage ? { message: blockingMessage } : null,
              loadKey,
              questionKey: v3QuestionKey(config),
              chartType: config.presentation?.chartType,
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
  }, [armed, requestKey, schema, dispatch]);

  const previews = useMemo(
    () =>
      charts.map(({ id, name, config }) => {
        // An unfinished chart reads as unconfigured immediately, ahead of any
        // state the effect has yet to overwrite — clearing a binding must show
        // the skeleton on the same commit, not flash the previous chart until
        // the load effect catches up. Otherwise: a slot the effect has not
        // reached yet is loading, unless the provider is still deferred.
        let state =
          missingQuestionSelections(config, schema).length > 0
            ? UNCONFIGURED
            : previewState[id] ||
              (armed
                ? { status: "loading", result: null, error: null, notice: null }
                : IDLE);
        let renderChartType = config.presentation?.chartType;
        if (state.result && state.loadKey !== v3LoadKey(config)) {
          if (canHoldV3MapWhileLoading(state, config)) {
            // Keep the fully drawn map mounted until the other geometry
            // artifact arrives. Purging a geo plot while Plotly is still
            // settling its projection can leave an asynchronous autorange
            // callback pointed at a graph div that no longer exists.
            renderChartType = state.chartType;
          } else {
            state = {
              status: "loading",
              result: null,
              error: null,
              notice: null,
            };
          }
        }
        let plotly = null;
        let renderError = null;

        if (state.result) {
          try {
            plotly = adaptV3Result(
              config,
              schema,
              state.result,
              renderChartType,
              previewRenderer,
            );
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
    [activeChartId, armed, charts, previewRenderer, previewState, schema],
  );

  const activePreview =
    previews.find((preview) => preview.id === activeChartId) ||
    previews[0] ||
    {};
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

  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}
