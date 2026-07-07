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

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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
  const preset = getPreset(initial.preset) || PRESETS["trend-over-time"];
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
      title: preset.title,
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
        labels: { ...config.labels, title: preset.title },
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
      next = {
        ...config,
        chartType: chart.id,
        preset: preset?.id || config.preset,
        bindings: bindingsForPreset(
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
      if (chart?.sameMetricBothEnds && ["start", "end"].includes(action.role)) {
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
      // three are computed keys (chartSpec.js COMPUTED_KEYS), never config.
      const geoUnmatched = action.geoUnmatched || [];
      const seriesNames = action.seriesNames || [];
      const previousUnmatched = config.geoUnmatched || [];
      const countUnchanged = config.seriesCount === action.count;
      const geoUnchanged =
        geoUnmatched.length === previousUnmatched.length &&
        geoUnmatched.every((name, index) => name === previousUnmatched[index]);
      if (countUnchanged && geoUnchanged) return config;
      next = {
        ...config,
        seriesCount: action.count,
        geoUnmatched,
        seriesNames,
      };
      break;
    }

    case "SET_APPEARANCE":
      next = {
        ...config,
        appearance: { ...config.appearance, [action.key]: action.value },
      };
      break;

    case "SET_DATA_SOURCE":
      // { source: "module" | "inline", inline?: { columns, rows, meta } }
      next = {
        ...config,
        data:
          action.source === "inline"
            ? { source: "inline", inline: clone(action.inline) }
            : { source: "module" },
      };
      break;

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

/**
 * ======================================================================
 * Context Provider and Hook
 * ======================================================================
 */

export function ChartConfigProvider({ schema, initialConfig, children }) {
  const [config, dispatch] = useReducer(
    (state, action) => reduceChartConfig(state, action, schema),
    initialConfig,
    (initial) => createChartConfig(schema, initial),
  );

  const value = useMemo(
    () => ({ config, dispatch, schema }),
    [config, schema],
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
