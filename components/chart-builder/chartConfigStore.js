"use client";

/**
 * chartConfigStore.js — reducer and React context for chart-editor configuration.
 *
 * Props:
 *   schema        {Object}    — registered module schema
 *   initialConfig {Object}    — initial declarative chart configuration
 *   children      {ReactNode} — chart-builder consumers of the context
 *
 * Data sources:
 *   - Schema and initial configuration via props from ModuleEditor
 *
 * UI Kit reference:
 *   - None — state-management utility that does not render visible UI
 */

/* eslint-disable react/prop-types */

import {
  default as React,
  createContext,
  useContext,
  useMemo,
  useReducer,
} from "react";

import { getChartType } from "@/lib/visualization/chartRegistry";
import {
  autoMapInlineBindings,
  suggestChartType,
} from "@/lib/visualization/inlineMapping";
import {
  migrateSpec,
  normalizeSpec,
  SPEC_VERSION,
} from "@/lib/visualization/chartSpec";
import {
  getPreset,
  PRESET_ORDER,
  PRESETS,
} from "@/lib/visualization/presetRegistry";
import { DEFAULT_TIER } from "@/lib/visualization/settingsTiers";
import {
  allowedTransforms,
  isMeasure,
} from "@/lib/visualization/fieldTypes";
import { validateConfig } from "@/lib/visualization/validation";

/**
 * ======================================================================
 * Configuration Construction Helpers
 * ======================================================================
 */

const ChartConfigContext = createContext(null);
export const MAX_CHARTS = 4;
export const CHART_LAYOUTS = Object.freeze(["1x1", "1x2", "2x1", "2x2"]);
const HISTORY_LIMIT = 50;
const COMPUTED_ACTIONS = new Set(["SET_SERIES_COUNT"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function chartCapacity(layout) {
  if (layout === "2x2") return 4;
  if (layout === "1x2" || layout === "2x1") return 2;
  return 1;
}

export function layoutForCount(count) {
  if (count <= 1) return "1x1";
  if (count === 2) return "1x2";
  return "2x2";
}

function chartId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `chart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function stripComputed(config) {
  const next = normalizeSpec(config);
  return clone(next);
}

function createWorkspace(schema, initialConfig = {}) {
  const config = createChartConfig(schema, initialConfig);
  return {
    activeChartId: "chart-1",
    layout: "1x1",
    charts: [{ id: "chart-1", name: "Chart 1", config }],
  };
}

function activeChart(workspace) {
  return (
    workspace.charts.find((chart) => chart.id === workspace.activeChartId) ||
    workspace.charts[0]
  );
}

function updateChart(workspace, chartId, updater) {
  let changed = false;
  const charts = workspace.charts.map((chart) => {
    if (chart.id !== chartId) return chart;
    const next = updater(chart);
    changed = changed || next !== chart;
    return next;
  });
  return changed ? { ...workspace, charts } : workspace;
}

function sameWorkspace(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Roles that bind to a measure and should each get a distinct default field.
const MEASURE_ROLES = new Set(["x", "y", "size", "color", "start", "end"]);
const DISTINCT_MEASURE_ROLES = new Set(["x", "y", "size"]);

function firstFieldForRole(schema, chartType, role, preferred, exclude = new Set()) {
  if (preferred && schema.fields[preferred]) return preferred;
  const acceptedKinds = getChartType(chartType)?.roleConstraints?.[role] || [];
  const entries = Object.entries(schema.fields);
  const matching = entries.filter(([, field]) => acceptedKinds.includes(field.kind));
  // Prefer fields not already used by another role (so scatter/bubble don't
  // default x, y, and size to the same measure), falling back to all matches.
  const available = matching.filter(([name]) => !exclude.has(name));
  const pool = available.length ? available : matching;

  if (MEASURE_ROLES.has(role)) {
    return pool.find(([, field]) => field.curated)?.[0] || pool[0]?.[0];
  }

  return pool[0]?.[0];
}

function bindingsForPreset(preset, schema, previous = {}) {
  const chart = getChartType(preset.chartType);
  const presetRequired = preset.requiredRoles || [];
  const roles = [
    ...new Set([
      ...chart.requiredRoles,
      ...presetRequired,
      ...chart.optionalRoles,
    ]),
  ];
  const bindings = {};
  // Measures already assigned to a distinct-measure role (x/y/size), so the
  // next such role defaults to a different field.
  const usedMeasures = new Set();

  for (const role of roles) {
    const prior = previous[role];
    const acceptedKinds = chart.roleConstraints[role] || [];
    if (prior && acceptedKinds.includes(schema.fields[prior]?.kind)) {
      bindings[role] = prior;
      if (DISTINCT_MEASURE_ROLES.has(role) && isMeasure(schema.fields[prior])) {
        usedMeasures.add(prior);
      }
      continue;
    }

    const preferred = preset.defaults?.[role]?.default;
    const isRequired =
      chart.requiredRoles.includes(role) || presetRequired.includes(role);
    if (preferred || isRequired) {
      const exclude = DISTINCT_MEASURE_ROLES.has(role) ? usedMeasures : undefined;
      const field = firstFieldForRole(
        schema,
        preset.chartType,
        role,
        preferred,
        exclude,
      );
      if (field) {
        bindings[role] = field;
        if (DISTINCT_MEASURE_ROLES.has(role) && isMeasure(schema.fields[field])) {
          usedMeasures.add(field);
        }
      }
    }
  }

  if (chart.sameMetricBothEnds && bindings.start) {
    bindings.end = bindings.start;
  }

  return bindings;
}

function defaultFilters(schema) {
  const stratification = {};
  for (const dimension of schema.filterDimensions || []) {
    stratification[dimension.column] = dimension.default;
  }
  return {
    subset: Object.keys(schema.subsets || {})[0] || "",
    ...(schema.sources?.length ? { source: schema.sources[0] } : {}),
    ...stratification,
  };
}

function revalidate(config, schema) {
  return {
    ...config,
    validation: validateConfig(config, schema, {
      seriesCount: config.seriesCount,
      geoUnmatched: config.geoUnmatched,
    }),
  };
}

export function createChartConfig(schema, initialConfig = {}) {
  // Accept v1 shapes (including the legacy wire shape that folded
  // transform/chartType/appearance into `filters`) via the spec migration.
  const initial = migrateSpec(initialConfig) || {};
  // A module may declare a `defaultPreset` (e.g. a snapshot-only module that opens
  // on the ranking view rather than a trend line); fall back to trend-over-time.
  const preset =
    getPreset(initial.preset) || getPreset(schema.defaultPreset) || PRESETS["trend-over-time"];
  const base = {
    version: SPEC_VERSION,
    module: schema.id,
    preset: preset.id,
    chartType: preset.chartType,
    data: { source: "module" },
    bindings: bindingsForPreset(preset, schema, initial.bindings),
    period: {},
    filters: defaultFilters(schema),
    labels: {
      // Left blank so the title auto-derives from the bound variables
      // (deriveLabels/effectiveLabels); a user-typed title overrides it.
      title: "",
      subtitle: "",
      xAxis: "",
      yAxis: "",
      legend: "",
      tooltip: "",
    },
    transform: preset.defaults?.transform || "actual",
    comparisonMode: preset.defaults?.comparisonMode || "places",
    format: {},
    annotations: [],
    referenceLines: [],
    layers: [],
    appearance: clone(getChartType(preset.chartType)?.defaults || {}),
    tier: DEFAULT_TIER,
  };

  return revalidate(
    {
      ...base,
      ...clone(initial),
      version: SPEC_VERSION,
      data: { ...base.data, ...clone(initial.data || {}) },
      bindings: { ...base.bindings, ...clone(initial.bindings || {}) },
      period: { ...base.period, ...clone(initial.period || {}) },
      filters: { ...base.filters, ...clone(initial.filters || {}) },
      labels: { ...base.labels, ...clone(initial.labels || {}) },
      format: { ...base.format, ...clone(initial.format || {}) },
      appearance: { ...base.appearance, ...clone(initial.appearance || {}) },
      annotations: clone(initial.annotations || base.annotations),
      referenceLines: clone(initial.referenceLines || base.referenceLines),
      layers: clone(initial.layers || base.layers),
      tier: initial.tier || base.tier,
    },
    schema,
  );
}

/**
 * ======================================================================
 * Configuration Reducer
 * ======================================================================
 */

function presetForChartType(chartType) {
  const id = PRESET_ORDER.find((presetId) => PRESETS[presetId].chartType === chartType);
  return id ? PRESETS[id] : null;
}

export function reduceChartConfig(config, action, schema) {
  let next = config;

  switch (action.type) {
    case "SET_PRESET": {
      const preset = getPreset(action.preset);
      if (!preset) return config;
      next = {
        ...config,
        preset: preset.id,
        chartType: preset.chartType,
        bindings: bindingsForPreset(preset, schema, config.bindings),
        transform: preset.defaults?.transform || "actual",
        comparisonMode: preset.defaults?.comparisonMode || config.comparisonMode,
        appearance: {
          ...clone(getChartType(preset.chartType)?.defaults || {}),
          ...clone(preset.defaults || {}),
        },
        // Keep the user's labels; the title stays derived (or their override)
        // rather than being reset to the preset's static name.
        labels: { ...config.labels },
        filters: {
          ...config.filters,
          ...(preset.chartType === "choroplethMap" &&
          schema.subsets?.Counties
            ? { subset: "Counties" }
            : {}),
        },
      };
      break;
    }

    case "SET_CHART_TYPE": {
      const chart = getChartType(action.chartType);
      if (!chart) return config;
      const preset = presetForChartType(chart.id);
      // Bring-your-own-data (byod) auto-maps the pasted columns onto the new
      // chart's roles by name/type so switching chart types "just works";
      // modules keep their catalog-driven preset defaults.
      const inlineTable = schema.inlineOnly ? config.data?.inline : null;
      next = {
        ...config,
        chartType: chart.id,
        preset: preset?.id || config.preset,
        bindings: inlineTable
          ? autoMapInlineBindings(chart.id, inlineTable, config.bindings)
          : bindingsForPreset(
              preset || { chartType: chart.id, defaults: {} },
              schema,
              config.bindings,
            ),
        appearance: clone(chart.defaults || {}),
        filters: {
          ...config.filters,
          ...(chart.id === "choroplethMap" && schema.subsets?.Counties
            ? { subset: "Counties" }
            : {}),
        },
      };
      break;
    }

    case "SET_BINDING": {
      const bindings = { ...config.bindings };
      if (action.field) bindings[action.role] = action.field;
      else delete bindings[action.role];
      const chart = getChartType(config.chartType);
      // Modules force both range endpoints to the same metric; bring-your-own-
      // data binds two distinct columns (Lower/Upper), so don't mirror there.
      if (
        chart?.sameMetricBothEnds &&
        !schema.inlineOnly &&
        ["start", "end"].includes(action.role)
      ) {
        bindings.start = action.field;
        bindings.end = action.field;
      }
      const selected = schema.fields[action.field];
      const transforms = isMeasure(selected)
        ? allowedTransforms(selected)
        : null;
      next = {
        ...config,
        bindings,
        transform:
          transforms && !transforms.includes(config.transform)
            ? transforms[0]
            : config.transform,
      };
      break;
    }

    case "ADD_LAYER":
      next = { ...config, layers: [...config.layers, clone(action.layer)] };
      break;

    case "REMOVE_LAYER":
      next = {
        ...config,
        layers: config.layers.filter((layer) => layer.id !== action.id),
      };
      break;

    case "SET_FILTER":
      next = {
        ...config,
        filters: { ...config.filters, [action.key]: action.value },
      };
      break;

    case "SET_RANKING":
      next = {
        ...config,
        filters: { ...config.filters, topN: action.topN },
        appearance: {
          ...config.appearance,
          sort: action.sort,
          // A new ranked result has a different candidate order; discard the
          // prior manual arrangement/visibility rather than applying it to a
          // potentially unrelated Top/Bottom set.
          categoryOrder: [],
          hiddenCategories: [],
        },
      };
      break;

    case "SET_PERIOD":
      next = {
        ...config,
        period: { ...config.period, [action.key]: action.value },
      };
      break;

    case "SET_LABEL":
      next = {
        ...config,
        labels: { ...config.labels, [action.key]: action.value },
      };
      break;

    case "SET_TRANSFORM":
      next = { ...config, transform: action.transform };
      break;

    case "SET_SERIES_COUNT": {
      // Loaded-data size, fed back in so complexity validation can run, plus
      // any geographic-join fallout (geoUnmatched) and the live trace names
      // (seriesNames, used by the palette per-series override rows) — all
      // load-derived values are computed keys (chartSpec.js COMPUTED_KEYS),
      // never serialized config.
      const geoUnmatched = action.geoUnmatched || [];
      const seriesNames = action.seriesNames || [];
      const categoryNames = action.categoryNames || [];
      const previousUnmatched = config.geoUnmatched || [];
      const previousSeriesNames = config.seriesNames || [];
      const previousCategoryNames = config.categoryNames || [];
      const countUnchanged = config.seriesCount === action.count;
      const geoUnchanged =
        geoUnmatched.length === previousUnmatched.length &&
        geoUnmatched.every((name, index) => name === previousUnmatched[index]);
      const seriesUnchanged =
        seriesNames.length === previousSeriesNames.length &&
        seriesNames.every((name, index) => name === previousSeriesNames[index]);
      const categoriesUnchanged =
        categoryNames.length === previousCategoryNames.length &&
        categoryNames.every((name, index) => name === previousCategoryNames[index]);
      if (countUnchanged && geoUnchanged && seriesUnchanged && categoriesUnchanged) {
        return config;
      }
      next = {
        ...config,
        seriesCount: action.count,
        geoUnmatched,
        seriesNames,
        categoryNames,
      };
      break;
    }

    case "SET_APPEARANCE":
      next = {
        ...config,
        appearance: { ...config.appearance, [action.key]: action.value },
      };
      break;

    case "SET_DATA_SOURCE": {
      // { source: "module" | "inline", inline?, defaultChart? }
      if (action.source !== "inline") {
        next = { ...config, data: { source: "module" } };
        break;
      }
      const inlineTable = action.inline;
      const isByod = schema.inlineOnly && inlineTable;
      // On a FRESH byod import (defaultChart), pick a chart type that fits the
      // columns so the tool lands on something renderable; a plain table edit
      // keeps the current chart type. Either way, auto-map columns onto roles.
      const chartType =
        isByod && action.defaultChart ? suggestChartType(inlineTable) : config.chartType;
      const chart = getChartType(chartType);
      const preset = presetForChartType(chartType);
      const bindings = isByod
        ? autoMapInlineBindings(chartType, inlineTable, config.bindings)
        : config.bindings;
      next = {
        ...config,
        data: { source: "inline", inline: clone(inlineTable) },
        chartType,
        ...(chartType !== config.chartType
          ? {
              preset: preset?.id || config.preset,
              appearance: clone(chart?.defaults || {}),
            }
          : {}),
        bindings,
      };
      break;
    }

    case "SET_FORMAT": {
      // { field, format } — format=null clears the field's override.
      const format = { ...config.format };
      if (action.format) format[action.field] = clone(action.format);
      else delete format[action.field];
      next = { ...config, format };
      break;
    }

    case "SET_PALETTE":
      next = {
        ...config,
        appearance: { ...config.appearance, palette: action.palette },
      };
      break;

    case "SET_SERIES_COLOR": {
      // { seriesName, token } — token=null clears the override.
      const seriesColors = { ...(config.appearance.seriesColors || {}) };
      if (action.token) seriesColors[action.seriesName] = action.token;
      else delete seriesColors[action.seriesName];
      next = {
        ...config,
        appearance: { ...config.appearance, seriesColors },
      };
      break;
    }

    case "SET_SERIES_VISIBILITY": {
      // { seriesName, hidden } — persists which legend items are hidden so the
      // choice survives re-render and export (unlike Plotly's interactive
      // legend clicks, which live only in the rendered figure).
      const hidden = new Set(config.appearance.hiddenSeries || []);
      if (action.hidden) hidden.add(action.seriesName);
      else hidden.delete(action.seriesName);
      next = {
        ...config,
        appearance: { ...config.appearance, hiddenSeries: [...hidden] },
      };
      break;
    }

    case "ADD_ANNOTATION":
      next = {
        ...config,
        annotations: [...(config.annotations || []), clone(action.annotation)],
      };
      break;

    case "REMOVE_ANNOTATION":
      next = {
        ...config,
        annotations: (config.annotations || []).filter(
          (annotation) => annotation.id !== action.id,
        ),
      };
      break;

    case "SET_TIER":
      // Tiers only change which controls render — never the config's effect.
      if (config.tier === action.tier) return config;
      next = { ...config, tier: action.tier };
      break;

    case "LOAD_SPEC":
      // Code-mode apply: the parsed spec replaces the config as-is (already
      // validated by parseSpec), keeping the loaded seriesCount for
      // complexity checks. Unlike LOAD_VIEW, no preset re-seeding happens —
      // the code is the truth.
      next = {
        ...normalizeSpec({ ...action.spec, module: config.module }, schema),
        seriesCount: config.seriesCount,
        geoUnmatched: config.geoUnmatched,
        seriesNames: config.seriesNames,
        categoryNames: config.categoryNames,
      };
      break;

    case "LOAD_VIEW":
      next = createChartConfig(schema, action.config);
      break;

    case "RESET":
      return createChartConfig(schema, action.config);

    default:
      return config;
  }

  return revalidate(next, schema);
}

function addChart(workspace, schema) {
  if (workspace.charts.length >= MAX_CHARTS) return workspace;
  const current = activeChart(workspace);
  const id = chartId();
  const chartNumber = workspace.charts.length + 1;
  const base = stripComputed(current.config);
  const config = revalidate(
    {
      ...base,
      labels: { ...base.labels },
    },
    schema,
  );
  const charts = [
    ...workspace.charts,
    { id, name: `Chart ${chartNumber}`, config },
  ];
  return {
    ...workspace,
    activeChartId: id,
    layout: layoutForCount(charts.length),
    charts,
  };
}

function removeChart(workspace, chartIdToRemove) {
  if (workspace.charts.length <= 1) return workspace;
  const removeIndex = workspace.charts.findIndex(
    (chart) => chart.id === chartIdToRemove,
  );
  if (removeIndex === -1) return workspace;
  const charts = workspace.charts.filter((chart) => chart.id !== chartIdToRemove);
  const nextActive =
    workspace.activeChartId === chartIdToRemove
      ? charts[Math.max(0, removeIndex - 1)]?.id || charts[0].id
      : workspace.activeChartId;
  return {
    ...workspace,
    activeChartId: nextActive,
    layout:
      chartCapacity(workspace.layout) >= charts.length
        ? workspace.layout
        : layoutForCount(charts.length),
    charts,
  };
}

/**
 * Replace the whole workspace from a deserialized embed payload: fresh ids per
 * chart, capacity-clamped to MAX_CHARTS, layout honored only if it can hold the
 * chart count (else derived). Returns null when there are no charts to load.
 */
function loadWorkspace(schema, incoming) {
  const source = Array.isArray(incoming?.charts) ? incoming.charts : [];
  const charts = source.slice(0, MAX_CHARTS).map((chart, index) => ({
    id: chartId(),
    name: chart.name || `Chart ${index + 1}`,
    config: createChartConfig(schema, chart.config),
  }));
  if (!charts.length) return null;
  const layout =
    CHART_LAYOUTS.includes(incoming.layout) &&
    chartCapacity(incoming.layout) >= charts.length
      ? incoming.layout
      : layoutForCount(charts.length);
  return { activeChartId: charts[0].id, layout, charts };
}

function reduceWorkspace(workspace, action, schema) {
  switch (action.type) {
    case "LOAD_WORKSPACE": {
      const loaded = loadWorkspace(schema, action.workspace);
      return loaded || workspace;
    }

    case "SET_ACTIVE_CHART":
      return workspace.charts.some((chart) => chart.id === action.chartId)
        ? { ...workspace, activeChartId: action.chartId }
        : workspace;

    case "ADD_CHART":
      return addChart(workspace, schema);

    case "REMOVE_CHART":
      return removeChart(workspace, action.chartId || workspace.activeChartId);

    case "SET_CHART_LAYOUT":
      return CHART_LAYOUTS.includes(action.layout) &&
        chartCapacity(action.layout) >= workspace.charts.length
        ? { ...workspace, layout: action.layout }
        : workspace;

    case "SET_SERIES_COUNT": {
      const targetId = action.chartId || workspace.activeChartId;
      return updateChart(workspace, targetId, (chart) => ({
        ...chart,
        config: reduceChartConfig(chart.config, action, schema),
      }));
    }

    case "SET_DATA_SOURCE":
      if (schema.inlineOnly) {
        return {
          ...workspace,
          charts: workspace.charts.map((chart) => ({
            ...chart,
            config: reduceChartConfig(chart.config, action, schema),
          })),
        };
      }
      break;

    default:
      break;
  }

  const current = activeChart(workspace);
  if (!current) return workspace;
  return updateChart(workspace, current.id, (chart) => ({
    ...chart,
    config: reduceChartConfig(chart.config, action, schema),
  }));
}

function createHistoryState(schema, initialConfig) {
  return {
    past: [],
    present: createWorkspace(schema, initialConfig),
    future: [],
  };
}

function historyReducer(state, action, schema) {
  if (action.type === "UNDO") {
    if (!state.past.length) return state;
    const present = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "REDO") {
    if (!state.future.length) return state;
    const present = state.future[0];
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present,
      future: state.future.slice(1),
    };
  }

  const next = reduceWorkspace(state.present, action, schema);
  if (sameWorkspace(state.present, next)) return state;

  const isUndoable =
    !COMPUTED_ACTIONS.has(action.type) && action.type !== "SET_ACTIVE_CHART";
  if (!isUndoable) {
    return { ...state, present: next };
  }

  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

/**
 * ======================================================================
 * Context Provider and Hook
 * ======================================================================
 */

export function ChartConfigProvider({ schema, initialConfig, children }) {
  const [state, dispatch] = useReducer(
    (current, action) => historyReducer(current, action, schema),
    initialConfig,
    (initial) => createHistoryState(schema, initial),
  );
  const workspace = state.present;
  const selected = activeChart(workspace);
  const config = selected?.config || createChartConfig(schema, initialConfig);

  const value = useMemo(
    () => ({
      config,
      dispatch,
      schema,
      workspace,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [config, schema, state.future.length, state.past.length, workspace],
  );

  return (
    <ChartConfigContext.Provider value={value}>
      {children}
    </ChartConfigContext.Provider>
  );
}

export function useChartConfig() {
  const context = useContext(ChartConfigContext);
  if (!context) {
    throw new Error("useChartConfig must be used inside ChartConfigProvider.");
  }
  return context;
}
