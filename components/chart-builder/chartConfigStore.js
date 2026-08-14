"use client";

/**
 * chartConfigStore.js — reducer and React context for chart-editor configuration.
 *
 * Props:
 *   schema        {Object}    — registered module schema
 *   initialConfig {Object}    — initial declarative chart configuration
 *   autoBind      {boolean}   — whether the store may choose fields on the
 *     reader's behalf (default true). The module workbench passes false: it
 *     seeds no bindings on open and seeds none on a chart-type switch, so the
 *     chart stays a skeleton until the reader sets each encoding themselves.
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

import { tabValues } from "@/lib/tabular/toSeries";
import {
  geometrySubsetFor,
  requiresGeometry,
} from "@/lib/visualization/chartAvailability";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { impliedBindings } from "@/lib/visualization/impliedRoles";
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
import {
  allowedTransforms,
  FIELD_KINDS,
  isMeasure,
} from "@/lib/visualization/fieldTypes";
import { transformOptions } from "@/lib/visualization/transformRegistry";
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

/**
 * Store behavior that differs per editor surface. `autoBind: false` is the
 * module workbench's manual-encoding rule (see the provider's prop docs); the
 * standalone Visualization Tool leaves it on.
 */
const DEFAULT_OPTIONS = Object.freeze({ autoBind: true });

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

function createWorkspace(schema, initialConfig = {}, options = DEFAULT_OPTIONS) {
  const config = createChartConfig(schema, initialConfig, options);
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

/** Accepted field kinds for a role, defaulting Group to any dimension. */
function acceptedKinds(chart, role) {
  return (
    chart.roleConstraints?.[role] ||
    (role === "group" ? [FIELD_KINDS.DIMENSION] : [])
  );
}

/**
 * The reader's own field choices, carried onto a chart type — and nothing else.
 *
 * This is `bindingsForPreset` with the seeding half removed: a role the new
 * chart type accepts keeps whatever the reader had bound to it, and a role
 * they never filled (or one whose field the new type cannot accept, e.g. Year
 * as a scatter's x) is left unset rather than defaulted to the catalog's first
 * curated measure. Roles the new chart type does not declare at all fall away,
 * since `acceptedKinds` returns nothing for them.
 */
function carriedBindings(chartTypeId, schema, previous = {}) {
  const chart = getChartType(chartTypeId);
  if (!chart) return {};
  const bindings = {};
  for (const [role, field] of Object.entries(previous || {})) {
    if (!field) continue;
    if (!acceptedKinds(chart, role).includes(schema.fields?.[field]?.kind)) continue;
    bindings[role] = field;
  }
  if (chart.sameMetricBothEnds && bindings.start) {
    bindings.end = bindings.start;
  }
  return bindings;
}

/**
 * Implied roles filled in, without disturbing anything the reader chose.
 *
 * Spread first so an explicit binding always wins — a saved view or deep link
 * naming its own `category` overrides the geography inference, and a chart-type
 * switch that carried a compatible choice across keeps it. This is not seeding
 * on the reader's behalf: an implied role has exactly one valid answer, declared
 * by the chart type, that the reader can see and change (Date Range, Geographic
 * Level) rather than one this store guessed among several.
 */
function withImpliedBindings(bindings, chartTypeId, schema) {
  return { ...impliedBindings(chartTypeId, schema), ...bindings };
}

/**
 * A map-shaped chart moved to the level we hold geometry for.
 *
 * Both map types need this, not just the choropleth: a symbol map's points are
 * derived from the same county polygons, so leaving a reader who was on Regions
 * or Metros where they stood asks the geography API for a level it does not
 * have and fails the whole load. Pinning the *select* (GeographySection) is not
 * enough — the level lives in `filters.subset`, and nothing else writes it.
 *
 * The place selection is cleared with it, for the reason
 * `GeographySection.setSubset` clears it: a region name is not a county name,
 * so a carried-over selection would filter every row away.
 */
function withGeometrySubset(chartTypeId, schema, filters) {
  if (!requiresGeometry(chartTypeId)) return filters;
  const subset = geometrySubsetFor(schema);
  if (!subset || filters?.subset === subset) return filters;
  return { ...filters, subset, locations: [] };
}

function defaultFilters(schema) {
  const stratification = {};
  for (const dimension of schema.filterDimensions || []) {
    stratification[dimension.column] = dimension.default;
  }
  return {
    subset: Object.keys(schema.subsets || {})[0] || "",
    // No explicit place selection: the ranking controls decide what to draw
    // until the user picks places in the Geographic Level section.
    locations: [],
    ...(schema.sources?.length ? { source: schema.sources[0] } : {}),
    ...stratification,
    tabColumn: null,
    tabValue: null,
    tabOrder: [],
  };
}

function orderedTabOptions(values = [], savedOrder = []) {
  const firstSeen = [];
  const seen = new Set();
  for (const raw of values || []) {
    if (raw == null || String(raw).trim() === "") continue;
    const value = String(raw).trim();
    if (seen.has(value)) continue;
    seen.add(value);
    firstSeen.push(value);
  }
  const ordered = [];
  const used = new Set();
  for (const raw of savedOrder || []) {
    if (raw == null) continue;
    const value = String(raw).trim();
    if (!seen.has(value) || used.has(value)) continue;
    used.add(value);
    ordered.push(value);
  }
  return [...ordered, ...firstSeen.filter((value) => !used.has(value))];
}

function schemaTabOptions(schema, column, savedOrder = []) {
  if (!column || !schema?.fields?.[column]) return [];
  const dimension = (schema.filterDimensions || []).find(
    (candidate) => candidate.column === column,
  );
  return orderedTabOptions(
    dimension?.values || schema.fields[column]?.values || [],
    savedOrder,
  );
}

function availableTabOptions(config, schema, column, savedOrder = []) {
  if (config.data?.source === "inline") {
    return tabValues(config.data?.inline, column, savedOrder);
  }
  const loaded = config.filters?.tabColumn === column ? config.tabOptions : [];
  return orderedTabOptions(
    loaded?.length ? loaded : schemaTabOptions(schema, column),
    savedOrder,
  );
}

function synchronizeTabFilters(filters, table, schema) {
  const column = filters?.tabColumn || null;
  if (!column) {
    return { ...filters, tabColumn: null, tabValue: null, tabOrder: [] };
  }
  const inline = Boolean(table);
  const exists = inline
    ? (table?.columns || []).some((item) => item.name === column)
    : Boolean(schema?.fields?.[column]);
  if (!exists) {
    return { ...filters, tabColumn: null, tabValue: null, tabOrder: [] };
  }
  const options = inline
    ? tabValues(table, column, filters.tabOrder)
    : schemaTabOptions(schema, column, filters.tabOrder);
  const current = filters.tabValue == null ? null : String(filters.tabValue).trim();
  return {
    ...filters,
    tabColumn: column,
    // Some module dimensions (Region, Cycle) are populated from the loaded
    // source table rather than a static schema list. Preserve their saved
    // value/order until the loader reports the values that actually exist.
    tabValue: options.length
      ? options.includes(current)
        ? current
        : options[0]
      : current,
    tabOrder: options.length ? options : filters.tabOrder || [],
  };
}

/**
 * Drop an imported-data transform the current chart can no longer express, so
 * the config never claims a view the renderer would silently ignore — switching
 * an indexed line to a bar (no time axis, so nothing to index against), or
 * re-importing a table that now holds a single period.
 *
 * Imported data only. A module keeps a stranded transform and surfaces
 * TRANSFORM_NOT_ALLOWED instead: there, the field catalog is the reader's own to
 * fix, and rewriting the config would hide the notice that explains it.
 */
function withExpressibleTransform(config, schema) {
  const transform = config?.transform;
  if (!transform || transform === "actual") return config;
  const { transforms, inline } = transformOptions(config, schema);
  if (!inline || transforms.includes(transform)) return config;
  return { ...config, transform: "actual" };
}

// Workstream E: `presets: autoBind` — the module workbench (autoBind: false)
// has no preset picker and never binds a field on the reader's behalf, so a
// preset requirement it cannot show must not be reported either
// (MISSING_PRESET_ROLE was surfacing on a surface with no way to satisfy it).
// The wizard (autoBind: true) keeps today's behavior. `autoBind` is editor
// state threaded as a parameter rather than stored on the config — the same
// reasoning that keeps Advanced Mode out of `config`.
function revalidate(rawConfig, schema, autoBind = true) {
  const config = withExpressibleTransform(rawConfig, schema);
  return {
    ...config,
    validation: validateConfig(config, schema, {
      seriesCount: config.seriesCount,
      geoUnmatched: config.geoUnmatched,
      presets: autoBind,
    }),
  };
}

export function createChartConfig(schema, initialConfig = {}, options = DEFAULT_OPTIONS) {
  const { autoBind = true } = options || {};
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
    // With autoBind off nothing is seeded: a module opens with every encoding
    // unset, and a stored view supplies its own bindings through the merge
    // below. Any binding the caller did pass still carries, kind permitting.
    bindings: withImpliedBindings(
      autoBind
        ? bindingsForPreset(preset, schema, initial.bindings)
        : carriedBindings(preset.chartType, schema, initial.bindings),
      preset.chartType,
      schema,
    ),
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
  };

  const merged = {
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
  };
  // Settings tiers were removed in the workbench overhaul; a stored view may
  // still carry the key, and it must not travel back into the live config.
  delete merged.tier;
  merged.filters = synchronizeTabFilters(
    merged.filters,
    merged.data?.source === "inline" ? merged.data?.inline : null,
    schema,
  );
  return revalidate(merged, schema, autoBind);
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

export function reduceChartConfig(config, action, schema, options = DEFAULT_OPTIONS) {
  const { autoBind = true } = options || {};
  let next = config;

  switch (action.type) {
    case "SET_PRESET": {
      const preset = getPreset(action.preset);
      if (!preset) return config;
      next = {
        ...config,
        preset: preset.id,
        chartType: preset.chartType,
        bindings: withImpliedBindings(
          bindingsForPreset(preset, schema, config.bindings),
          preset.chartType,
          schema,
        ),
        transform: preset.defaults?.transform || "actual",
        comparisonMode: preset.defaults?.comparisonMode || config.comparisonMode,
        appearance: {
          ...clone(getChartType(preset.chartType)?.defaults || {}),
          ...clone(preset.defaults || {}),
        },
        // Keep the user's labels; the title stays derived (or their override)
        // rather than being reset to the preset's static name.
        labels: { ...config.labels },
        filters: withGeometrySubset(preset.chartType, schema, config.filters),
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
      // Manual encoding (the module workbench): a chart-type switch carries the
      // reader's compatible choices across and fills in nothing. Whatever the
      // new type needs and did not inherit stays unset, which the preview reads
      // as "unconfigured" and draws as the skeleton rather than as an error.
      const nextBindings = withImpliedBindings(
        inlineTable
          ? autoMapInlineBindings(chart.id, inlineTable, config.bindings)
          : autoBind
            ? bindingsForPreset(
                preset || { chartType: chart.id, defaults: {} },
                schema,
                config.bindings,
              )
            : carriedBindings(chart.id, schema, config.bindings),
        chart.id,
        schema,
      );
      next = {
        ...config,
        chartType: chart.id,
        preset: preset?.id || config.preset,
        bindings: nextBindings,
        appearance: clone(chart.defaults || {}),
        filters: withGeometrySubset(chart.id, schema, config.filters),
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
      if (action.key === "tabColumn") {
        const tabColumn = action.value || null;
        const options = availableTabOptions(config, schema, tabColumn);
        next = {
          ...config,
          tabOptions: options,
          filters: {
            ...config.filters,
            tabColumn,
            tabValue: options[0] ?? null,
            tabOrder: options,
          },
        };
        break;
      }
      if (action.key === "tabOrder") {
        const tabOrder = availableTabOptions(
          config,
          schema,
          config.filters?.tabColumn,
          action.value,
        );
        next = {
          ...config,
          tabOptions: tabOrder,
          filters: { ...config.filters, tabOrder },
        };
        break;
      }
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
      // any geographic-join fallout (geoUnmatched), live trace names, and
      // discrete legend names — all load-derived values are computed keys
      // (chartSpec.js COMPUTED_KEYS), never serialized config.
      const geoUnmatched = action.geoUnmatched || [];
      const seriesNames = action.seriesNames || [];
      const legendNames = action.legendNames || [];
      const categoryNames = action.categoryNames || [];
      const hasTabMetadata = Object.hasOwn(action, "tabOptions");
      const tabOptions = hasTabMetadata
        ? orderedTabOptions(action.tabOptions, config.filters?.tabOrder)
        : config.tabOptions || [];
      const requestedTabValue =
        action.tabValue == null ? null : String(action.tabValue).trim();
      const tabValue = hasTabMetadata
        ? tabOptions.includes(requestedTabValue)
          ? requestedTabValue
          : tabOptions[0] ?? null
        : config.filters?.tabValue ?? null;
      const previousUnmatched = config.geoUnmatched || [];
      const previousSeriesNames = config.seriesNames || [];
      const previousLegendNames = config.legendNames || [];
      const previousCategoryNames = config.categoryNames || [];
      const countUnchanged = config.seriesCount === action.count;
      const geoUnchanged =
        geoUnmatched.length === previousUnmatched.length &&
        geoUnmatched.every((name, index) => name === previousUnmatched[index]);
      const seriesUnchanged =
        seriesNames.length === previousSeriesNames.length &&
        seriesNames.every((name, index) => name === previousSeriesNames[index]);
      const legendsUnchanged =
        legendNames.length === previousLegendNames.length &&
        legendNames.every((name, index) => name === previousLegendNames[index]);
      const categoriesUnchanged =
        categoryNames.length === previousCategoryNames.length &&
        categoryNames.every((name, index) => name === previousCategoryNames[index]);
      const previousTabOptions = config.tabOptions || [];
      const tabsUnchanged =
        !hasTabMetadata ||
        (tabOptions.length === previousTabOptions.length &&
          tabOptions.every((name, index) => name === previousTabOptions[index]) &&
          tabValue === (config.filters?.tabValue ?? null));
      if (
        countUnchanged &&
        geoUnchanged &&
        seriesUnchanged &&
        legendsUnchanged &&
        categoriesUnchanged &&
        tabsUnchanged
      ) {
        return config;
      }
      next = {
        ...config,
        seriesCount: action.count,
        geoUnmatched,
        seriesNames,
        legendNames,
        categoryNames,
        ...(hasTabMetadata
          ? {
              tabOptions,
              filters: {
                ...config.filters,
                tabValue,
                tabOrder: tabOptions,
              },
            }
          : {}),
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
        next = {
          ...config,
          data: { source: "module" },
          filters: synchronizeTabFilters(config.filters, null, schema),
        };
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
        filters: synchronizeTabFilters(config.filters, inlineTable, schema),
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

    case "SET_LEGEND_LABEL": {
      // The map remains keyed by the raw data/trace name. Clearing an input
      // removes its override so the legend resumes following the source data.
      const legendLabels = { ...(config.appearance.legendLabels || {}) };
      if (typeof action.label === "string" && action.label.trim()) {
        legendLabels[action.seriesName] = action.label;
      } else {
        delete legendLabels[action.seriesName];
      }
      next = {
        ...config,
        appearance: { ...config.appearance, legendLabels },
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

    // SET_TIER is deliberately unhandled: the Basic/Moderate/Advanced switch was
    // removed and every control is now visible to every user. Old code or a
    // stored macro dispatching it falls through to `default` and changes
    // nothing, rather than reintroducing a key the spec no longer carries.

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
        legendNames: config.legendNames,
        categoryNames: config.categoryNames,
        tabOptions: config.tabOptions,
      };
      break;

    case "LOAD_VIEW":
      next = createChartConfig(schema, action.config, options);
      break;

    case "RESET":
      return createChartConfig(schema, action.config, options);

    default:
      return config;
  }

  return revalidate(next, schema, autoBind);
}

function addChart(workspace, schema, options = DEFAULT_OPTIONS) {
  if (workspace.charts.length >= MAX_CHARTS) return workspace;
  const { autoBind = true } = options || {};
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
    autoBind,
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
function loadWorkspace(schema, incoming, options = DEFAULT_OPTIONS) {
  const source = Array.isArray(incoming?.charts) ? incoming.charts : [];
  const charts = source.slice(0, MAX_CHARTS).map((chart, index) => ({
    id: chartId(),
    name: chart.name || `Chart ${index + 1}`,
    config: createChartConfig(schema, chart.config, options),
  }));
  if (!charts.length) return null;
  const layout =
    CHART_LAYOUTS.includes(incoming.layout) &&
    chartCapacity(incoming.layout) >= charts.length
      ? incoming.layout
      : layoutForCount(charts.length);
  return { activeChartId: charts[0].id, layout, charts };
}

function reduceWorkspace(workspace, action, schema, options = DEFAULT_OPTIONS) {
  switch (action.type) {
    case "LOAD_WORKSPACE": {
      const loaded = loadWorkspace(schema, action.workspace, options);
      return loaded || workspace;
    }

    case "SET_ACTIVE_CHART":
      return workspace.charts.some((chart) => chart.id === action.chartId)
        ? { ...workspace, activeChartId: action.chartId }
        : workspace;

    case "ADD_CHART":
      return addChart(workspace, schema, options);

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
        config: reduceChartConfig(chart.config, action, schema, options),
      }));
    }

    case "SET_FILTER":
      if (action.chartId) {
        return updateChart(workspace, action.chartId, (chart) => ({
          ...chart,
          config: reduceChartConfig(chart.config, action, schema, options),
        }));
      }
      break;

    case "SET_DATA_SOURCE":
      if (schema.inlineOnly) {
        return {
          ...workspace,
          charts: workspace.charts.map((chart) => ({
            ...chart,
            config: reduceChartConfig(chart.config, action, schema, options),
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
    config: reduceChartConfig(chart.config, action, schema, options),
  }));
}

function createHistoryState(schema, initialConfig, options = DEFAULT_OPTIONS) {
  return {
    past: [],
    present: createWorkspace(schema, initialConfig, options),
    future: [],
  };
}

function historyReducer(state, action, schema, options = DEFAULT_OPTIONS) {
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

  const next = reduceWorkspace(state.present, action, schema, options);
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

export function ChartConfigProvider({
  schema,
  initialConfig,
  autoBind = true,
  children,
}) {
  // Read fresh on every dispatch, so the surface's binding policy travels with
  // the action instead of being baked into the initial reducer closure.
  const options = useMemo(() => ({ autoBind }), [autoBind]);
  const [state, dispatch] = useReducer(
    (current, action) => historyReducer(current, action, schema, options),
    initialConfig,
    (initial) => createHistoryState(schema, initial, options),
  );
  const workspace = state.present;
  const selected = activeChart(workspace);
  const config =
    selected?.config || createChartConfig(schema, initialConfig, options);

  const value = useMemo(
    () => ({
      config,
      dispatch,
      schema,
      workspace,
      // Consumers read this to tell "the reader has not chosen this yet" apart
      // from "this is wrong": PreviewContext draws the skeleton instead of
      // fetching, and ValidationNotice stays quiet about unset roles.
      autoBind,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [autoBind, config, schema, state.future.length, state.past.length, workspace],
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
