"use client";

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
  getPreset,
  PRESET_ORDER,
  PRESETS,
} from "@/lib/visualization/presetRegistry";
import {
  allowedTransforms,
  isMeasure,
} from "@/lib/visualization/fieldTypes";
import { validateConfig } from "@/lib/visualization/validation";

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
  return {
    subset: Object.keys(schema.subsets || {})[0] || "",
    ...(schema.sources?.length ? { source: schema.sources[0] } : {}),
  };
}

function revalidate(config, schema) {
  return {
    ...config,
    validation: validateConfig(config, schema, {
      seriesCount: config.seriesCount,
    }),
  };
}

export function createChartConfig(schema, initialConfig = {}) {
  const preset = getPreset(initialConfig.preset) || PRESETS["trend-over-time"];
  const base = {
    version: 1,
    module: schema.id,
    preset: preset.id,
    chartType: preset.chartType,
    bindings: bindingsForPreset(preset, schema, initialConfig.bindings),
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
    referenceLines: [],
    layers: [],
    appearance: clone(getChartType(preset.chartType)?.defaults || {}),
  };

  return revalidate(
    {
      ...base,
      ...clone(initialConfig),
      bindings: { ...base.bindings, ...clone(initialConfig.bindings || {}) },
      period: { ...base.period, ...clone(initialConfig.period || {}) },
      filters: { ...base.filters, ...clone(initialConfig.filters || {}) },
      labels: { ...base.labels, ...clone(initialConfig.labels || {}) },
      appearance: { ...base.appearance, ...clone(initialConfig.appearance || {}) },
      referenceLines: clone(initialConfig.referenceLines || base.referenceLines),
      layers: clone(initialConfig.layers || base.layers),
    },
    schema,
  );
}

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

    case "SET_SERIES_COUNT":
      // Loaded-data size, fed back in so complexity validation can run.
      if (config.seriesCount === action.count) return config;
      next = { ...config, seriesCount: action.count };
      break;

    case "SET_APPEARANCE":
      next = {
        ...config,
        appearance: { ...config.appearance, [action.key]: action.value },
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
