/**
 * chartData.js — API query construction and layered chart-data loading.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Module API routes selected through schema.apiPath
 *   - lib/tabular/toSeries.js for the "your data" (inline) source — shaped
 *     entirely client-side, no fetch
 *
 * UI Kit reference:
 *   - None — data-loading utility that does not render UI
 */

import { rankCategoryRecords } from "@/lib/data/query_shapes";
import { calculateChangeValue } from "@/lib/data/visualization/calculationRegistry";
import { buildShapes } from "@/lib/tabular/toSeries";
import { executeInlineQuestion } from "@/lib/tabular/toObservations";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { validateResponse } from "@/lib/visualization/observationContract";

const LEGACY_VIEW_BY_CHART = Object.freeze({
  line: "line",
  // A diverging bar is a `bar` with `appearance.diverging`, so it shares this
  // single-period category view; toPlotly re-anchors the same
  // {category, value} records around a center reference.
  bar: "category",
  pie: "category",
  dumbbell: "twoPeriod",
  // Forest plot shares the two-endpoint (CI low/high) two-period shape.
  forest: "twoPeriod",
  scatter: "pairs",
  bubble: "pairs",
  heatmap: "matrix",
  // Multi-series dot plot shares the heatmap's two-dimension matrix shape.
  dotPlot: "matrix",
  choroplethMap: "geo",
  // Symbol maps read the same per-place snapshot a choropleth does; the
  // difference is how toPlotly draws it, not what the API returns.
  symbolMap: "geo",
  // A data table shows the rows behind the chart, so it asks for the full table.
  dataTable: "table",
});

/** Load one v3 question without leaking presentation state into the request. */
export async function loadObservations(spec, { apiPath, signal } = {}) {
  if (spec?.question?.dataset?.kind === "inline") {
    const response = executeInlineQuestion(spec);
    return { ...response, blocked: response.status === "blocked" };
  }
  const request = { version: spec.version, question: spec.question };
  let response;
  try {
    const result = await fetch(apiPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    response = await result.json();
  } catch (error) {
    return {
      blocked: true,
      observations: [],
      comparisons: [],
      periods: [],
      issues: [{ code: "requestFailed", level: "blocking", comparisonId: null, message: error.message }],
    };
  }
  const validation = validateResponse(response);
  if (!validation.valid) {
    return {
      blocked: true,
      observations: [],
      comparisons: [],
      periods: [],
      issues: [{
        code: "invalidResponse",
        level: "blocking",
        comparisonId: null,
        message: validation.errors.join(" "),
      }],
    };
  }
  return { ...response, blocked: response.status === "blocked" };
}

// Transforms computed at the data layer rather than by transformRegistry: the
// single-period "category"/"geo" API views don't carry a base period, so a
// change transform needs the two-period shape instead (flagged issue 1).
const CHANGE_TRANSFORMS = new Set([
  "numericChange",
  "percentChange",
  "percentagePointChange",
]);

export function isChangeTransform(transformId) {
  return CHANGE_TRANSFORMS.has(transformId);
}

/**
 * Map two-period records ({category|location, start, end, ...}) to the
 * {..., value} shape barSpec/choroplethSpec already consume, computing
 * `value` as the requested change. Pure and fetch-free so it's directly
 * testable without stubbing fetch.
 *
 * @param {Array<{start: number|null, end: number|null}>} records
 * @param {"numericChange"|"percentChange"|"percentagePointChange"} transformId
 */
export function changeRecords(records, transformId) {
  return records.map(({ start, end, ...rest }) => {
    let value = null;
    if (start != null && end != null) value = calculateChangeValue(start, end, transformId);
    return { ...rest, value };
  });
}

/** "Counties" subset → the "counties" geometry level; anything else lowercased
 * (flagged issue 3 — the geometry level was previously hard-coded). */
function geometryLevelForSubset(subset) {
  if (!subset) return "counties";
  return subset === "Counties" ? "counties" : subset.toLowerCase();
}

/**
 * The places a request should be limited to. `filters.locations` is the
 * first-class selection the Geographic Level multi-select writes; the
 * `selectedPlaces` layer is the older path and still applies when no explicit
 * selection exists (saved views, and the standalone tool's layer editor).
 */
function selectedLocations(config) {
  if (Array.isArray(config.moduleLocations)) return config.moduleLocations;
  if (config.filters?.locations?.length) return [...new Set(config.filters.locations)];
  const places = (config.layers || [])
    .filter((layer) => layer.type === "selectedPlaces")
    .flatMap((layer) => layer.values || []);
  return [...new Set(places)];
}

/**
 * Split `filters.source` into the two query params the routes accept. It holds a
 * single dataset id for modules with a dataset toggle, and an array of
 * provenance labels for Population & Housing — one key, two shapes, because the
 * Datasets section owns both controls. `filters.sources` is read as a legacy
 * fallback so saved views from before the workbench overhaul still resolve.
 */
function sourceParams(config, overrides = {}) {
  const raw = overrides.source ?? config.filters?.source;
  if (Array.isArray(raw)) return { source: null, sources: raw };
  const legacy = overrides.sources || config.filters?.sources;
  return { source: raw || null, sources: Array.isArray(legacy) ? legacy : null };
}

function buildSearchParams(config, schema, overrides = {}) {
  const view = overrides.view || LEGACY_VIEW_BY_CHART[config.chartType];
  const params = new URLSearchParams({
    view,
    subset: overrides.subset || config.filters.subset,
  });
  const { source, sources } = sourceParams(config, overrides);
  if (source) params.set("source", source);

  // Provenance multi-select (Population & Housing): a comma list of Source labels;
  // omitted entirely when all are selected, which the API reads as "all" (B3).
  if (sources?.length) params.set("sources", sources.join(","));

  // Module-specific stratification filters (e.g. Age Group, Sex, Race/Ethnicity).
  for (const dimension of schema.filterDimensions || []) {
    const value = overrides[dimension.param] ?? config.filters[dimension.column];
    if (value) params.set(dimension.param, value);
  }

  const locations = overrides.locations || selectedLocations(config);
  if (locations?.length) params.set("locations", locations.join(","));
  const startYear = overrides.startYear ?? config.period.startYear;
  const endYear = overrides.endYear ?? config.period.endYear;
  if (startYear) params.set("startYear", startYear);
  if (endYear) params.set("endYear", endYear);
  const period = overrides.period ?? config.period.year;
  if (period) params.set("period", period);

  if (view === "pairs") {
    params.set("xMeasure", overrides.xMeasure || config.bindings.x);
    params.set("yMeasure", overrides.yMeasure || config.bindings.y);
    const size = overrides.sizeMeasure || config.bindings.size;
    if (size) params.set("sizeMeasure", size);
  } else {
    // Whichever role carries the measure on this chart type. `size` is here for
    // the symbol map, whose magnitude role is `size` and which declares no `y`
    // at all — without it the request went out with no `parameter` and every
    // module API answered "Invalid or missing 'parameter'". It sits after `y`
    // so no chart type that binds both changes which measure it asks for.
    const parameter =
      overrides.parameter ||
      config.bindings.y ||
      config.bindings.size ||
      config.bindings.color ||
      config.bindings.start;
    if (parameter) params.set("parameter", parameter);
  }

  if (view === "category") {
    const chart = getChartType(config.chartType);
    params.set(
      "topN",
      String(
        overrides.topN ??
          config.filters.topN ??
          chart?.limits?.recommendTopN ??
          20,
      ),
    );
    params.set("sort", config.appearance.sort || "value");
  }

  // Building Permits' API predates the shared query vocabulary: it names the
  // measure selector `permitType` (not `parameter`). Translate so the shared
  // encoding path drives the right measure instead of silently defaulting to
  // "Total". (Its monthly bounds and lack of a `category` view are handled by
  // that module's presets, which use only the line/twoPeriod/geoValues shapes.)
  if (schema.id === "building-permits" && params.has("parameter")) {
    params.set("permitType", params.get("parameter"));
    params.delete("parameter");
  }
  return params;
}

/**
 * The `view=table&full=1` URL: every row and column of a module's cleaned CSV,
 * ignoring the chart's geography, source, and date filters.
 *
 * Returns null for bring-your-own-data, which has no server dataset - that path
 * already holds the whole table client-side. `subset` and `source` are still
 * sent because the routes validate them, but `full=1` makes the query ignore
 * them when selecting rows.
 */
export function fullTableUrl(config, schema) {
  const inline =
    config?.question?.dataset?.kind === "inline" || config?.data?.source === "inline";
  if (!schema?.apiPath || inline) return null;
  const params = new URLSearchParams({ view: "table", full: "1" });
  const subset = config?.question?.geography?.subset || config?.filters?.subset;
  if (subset) params.set("subset", subset);
  const source = config?.question?.source || sourceParams(config).source;
  if (source) params.set("source", source);
  return `${schema.apiPath}?${params}`;
}

/**
 * Fetch the entire cleaned dataset as `{ records }`. Throws with the route's
 * `{ error, source }` message so callers can surface where it failed.
 */
export async function loadFullTable(config, schema, signal) {
  const url = fullTableUrl(config, schema);
  if (!url) return null;
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "The full dataset could not be loaded.");
    error.source = body.source;
    throw error;
  }
  return { records: body.records || [] };
}

async function requestData(config, schema, signal, overrides = {}) {
  const params = buildSearchParams(config, schema, overrides);
  const response = await fetch(`${schema.apiPath}?${params}`, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "The chart data request failed.");
    error.source = body.source;
    throw error;
  }
  return body;
}

function textValue(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

function orderedValues(values = [], savedOrder = []) {
  const firstSeen = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = textValue(raw);
    if (value == null || seen.has(value)) continue;
    seen.add(value);
    firstSeen.push(value);
  }
  const ordered = [];
  const used = new Set();
  for (const raw of savedOrder || []) {
    const value = textValue(raw);
    if (value == null || !seen.has(value) || used.has(value)) continue;
    used.add(value);
    ordered.push(value);
  }
  return [...ordered, ...firstSeen.filter((value) => !used.has(value))];
}

function moduleTabOptions(schema, column, rows, savedOrder) {
  if (!column) return [];
  const filterDimension = (schema.filterDimensions || []).find(
    (dimension) => dimension.column === column,
  );
  const declared = filterDimension?.values || schema.fields?.[column]?.values || [];
  const values = declared.length ? declared : rows.map((row) => row?.[column]);
  return orderedValues(values, savedOrder);
}

function moduleDirectTabFilter(config, schema, column, value) {
  if (!column || value == null) return config;
  const filters = { ...config.filters, tabValue: value };
  const dimension = (schema.filterDimensions || []).find(
    (candidate) => candidate.column === column,
  );
  if (dimension) filters[column] = value;
  if (column === "Source") {
    // One key, two shapes: an array pins a provenance vintage, a string pins a
    // dataset (see sourceParams).
    if (schema.provenanceFilter) filters.source = [value];
    else if (schema.sources?.includes(value)) filters.source = value;
  }
  return { ...config, filters };
}

function isDirectModuleTab(schema, column) {
  return Boolean(
    (schema.filterDimensions || []).some(
      (dimension) => dimension.column === column,
    ) ||
      (column === "Source" && (schema.provenanceFilter || schema.sources?.length)),
  );
}

function filterModuleRows(rows, config, schema) {
  const { source, sources } = sourceParams(config);
  return (rows || []).filter((row) => {
    for (const dimension of schema.filterDimensions || []) {
      const selected = textValue(config.filters?.[dimension.column]);
      if (selected != null && textValue(row?.[dimension.column]) !== selected) {
        return false;
      }
    }
    if (
      schema.provenanceFilter &&
      sources?.length &&
      !sources.includes(textValue(row?.Source))
    ) {
      return false;
    }
    const selectedSource = textValue(source);
    if (
      schema.sources?.length &&
      selectedSource != null &&
      textValue(row?.Source) !== selectedSource
    ) {
      return false;
    }
    return true;
  });
}

function moduleLocation(row) {
  return textValue(row?.Location ?? row?.location ?? row?.Jurisdiction);
}

/**
 * Resolve module-only grouping/tab context from the same full-width table used
 * by View Data. The chart APIs stay the source of plotted values (so change
 * transforms, geographic joins, and line layers retain their existing paths);
 * this table supplies dimension values and, for a tab, the matching locations.
 */
async function prepareModuleFeatures(config, schema, signal) {
  const groupColumn = config.bindings?.group || null;
  const tabColumn = config.filters?.tabColumn || null;
  if (!groupColumn && !tabColumn) return null;

  let tabOptions = moduleTabOptions(
    schema,
    tabColumn,
    [],
    config.filters?.tabOrder,
  );
  const currentTab = textValue(config.filters?.tabValue);
  let tabValue = tabOptions.includes(currentTab)
    ? currentTab
    : tabOptions[0] ?? currentTab;
  let effectiveConfig = moduleDirectTabFilter(config, schema, tabColumn, tabValue);
  const groupDimension = (schema.filterDimensions || []).find(
    (dimension) => dimension.column === groupColumn,
  );
  const needsDimensionTable =
    (groupColumn && !groupDimension) ||
    (tabColumn && !isDirectModuleTab(schema, tabColumn));
  const table = needsDimensionTable
    ? await requestData(effectiveConfig, schema, signal, { view: "table" })
    : { records: [] };
  let rows = filterModuleRows(table.records || [], effectiveConfig, schema);
  if (!tabOptions.length) {
    tabOptions = moduleTabOptions(
      schema,
      tabColumn,
      rows,
      config.filters?.tabOrder,
    );
    tabValue = tabOptions.includes(currentTab) ? currentTab : tabOptions[0] ?? null;
    effectiveConfig = moduleDirectTabFilter(
      effectiveConfig,
      schema,
      tabColumn,
      tabValue,
    );
  }

  if (tabColumn && tabValue != null) {
    rows = rows.filter((row) => textValue(row?.[tabColumn]) === tabValue);
  }

  let allowedLocations = null;
  if (tabColumn && !isDirectModuleTab(schema, tabColumn)) {
    allowedLocations = orderedValues(rows.map(moduleLocation));
    effectiveConfig = { ...effectiveConfig, moduleLocations: allowedLocations };
  }

  const groupByLocation = new Map();
  const groupOrder = new Map();
  if (groupColumn && !groupDimension) {
    for (const row of rows) {
      const location = moduleLocation(row);
      const group = textValue(row?.[groupColumn]);
      if (location == null || group == null) continue;
      groupByLocation.set(location, group);
      if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
    }
  }

  return {
    config: effectiveConfig,
    tabOptions,
    tabValue,
    allowedLocations,
    groupByLocation,
    groupOrder,
    groupRequests: groupDimension
      ? (tabColumn === groupColumn && tabValue != null
          ? [tabValue]
          : orderedValues(
              groupDimension.values || schema.fields?.[groupColumn]?.values || [],
            )
        ).map((group) => ({
          group,
          config: {
            ...effectiveConfig,
            filters: { ...effectiveConfig.filters, [groupColumn]: group },
          },
        }))
      : [],
  };
}

function resultLocation(item, groupByLocation) {
  const raw = textValue(item?.location ?? item?.category ?? item?.label);
  if (raw == null) return null;
  if (groupByLocation.has(raw)) return raw;
  const base = raw.split(" · ")[0];
  return groupByLocation.has(base) ? base : raw;
}

function withModuleFeatures(result, config, context) {
  if (!context) return result;
  const { groupByLocation, groupOrder, tabOptions, tabValue } = context;
  let series = result.series;

  if (series && !Array.isArray(series) && Array.isArray(series.y)) {
    const hasExistingGroups = Array.isArray(series.groups);
    let rows = series.y.map((label, index) => ({
      label,
      values: series.z?.[index] || [],
      group:
        series.groups?.[index] ?? groupByLocation.get(textValue(label)) ?? null,
      index,
    }));
    if (context.allowedLocations) {
      const allowed = new Set(context.allowedLocations);
      rows = rows.filter((row) => allowed.has(textValue(row.label)));
    }
    if (groupByLocation.size) {
      rows.sort((a, b) => {
        const aRank = groupOrder.get(a.group) ?? Infinity;
        const bRank = groupOrder.get(b.group) ?? Infinity;
        return aRank - bRank || a.index - b.index;
      });
    }
    series = {
      ...series,
      y: rows.map((row) => row.label),
      z: rows.map((row) => row.values),
      ...(hasExistingGroups || groupByLocation.size
        ? { groups: rows.map((row) => row.group) }
        : {}),
    };
  } else if (Array.isArray(series)) {
    const allowed = context.allowedLocations
      ? new Set(context.allowedLocations)
      : null;
    const indexed = series
      .filter((item) => !allowed || allowed.has(resultLocation(item, groupByLocation)))
      .map((item, index) => {
        const location = resultLocation(item, groupByLocation);
        return {
          item: {
            ...item,
            ...(groupByLocation.size
              ? { group: groupByLocation.get(location) ?? null }
              : {}),
          },
          index,
        };
      });
    if (groupByLocation.size && GROUP_SECTIONING_RECORD_CHARTS.has(config.chartType)) {
      indexed.sort((a, b) => {
        const aRank = groupOrder.get(a.item.group) ?? Infinity;
        const bRank = groupOrder.get(b.item.group) ?? Infinity;
        return aRank - bRank || a.index - b.index;
      });
    }
    series = indexed.map(({ item }) => item);
  }

  const response = { ...result.response };
  if (config.chartType === "line") response.series = series;
  else if (config.chartType === "heatmap" || config.chartType === "dotPlot") {
    response.matrix = series;
  } else response.records = series;
  return { ...result, response, series, tabOptions, tabValue };
}

function mergeGroupedModuleResults(grouped, config) {
  if (!grouped.length) return null;
  const first = grouped[0].result;
  const matrixChart = config.chartType === "heatmap" || config.chartType === "dotPlot";
  let series;
  if (matrixChart) {
    const x = first.series?.x || [];
    series = {
      ...first.series,
      x,
      y: grouped.flatMap(({ result }) => result.series?.y || []),
      z: grouped.flatMap(({ result }) => result.series?.z || []),
      groups: grouped.flatMap(({ group, result }) =>
        (result.series?.y || []).map(() => group),
      ),
    };
  } else {
    series = grouped.flatMap(({ group, result }) =>
      (result.series || []).map((item) => ({ ...item, group })),
    );
  }

  const response = { ...first.response };
  if (config.chartType === "line") response.series = series;
  else if (matrixChart) response.matrix = series;
  else response.records = series;
  return {
    ...first,
    response,
    series,
    unmatched: [
      ...new Set(grouped.flatMap(({ result }) => result.unmatched || [])),
    ],
  };
}

function namedSeries(series, suffix) {
  return series.map((item) => ({
    ...item,
    location: `${item.location} · ${suffix}`,
  }));
}

/** Rank line series by their latest visible non-missing value. */
export function rankLineSeries(series, { topN = 20, sort = "value" } = {}) {
  const ranked = [...(series || [])];
  const latestValue = (item) => {
    for (let index = (item.values || []).length - 1; index >= 0; index -= 1) {
      const value = item.values[index];
      if (value != null && Number.isFinite(Number(value))) return Number(value);
    }
    return null;
  };
  ranked.sort((a, b) => {
    const aValue = latestValue(a);
    const bValue = latestValue(b);
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return sort === "ascending" ? aValue - bValue : bValue - aValue;
  });
  return topN && topN > 0 ? ranked.slice(0, topN) : ranked;
}

function finiteRankingValue(record, chartType) {
  if (chartType === "forest") {
    const explicit = [record.point, record.estimate].find((value) =>
      Number.isFinite(Number(value)),
    );
    if (explicit != null) return Number(explicit);
    const start = Number(record.start ?? record.startValue);
    const end = Number(record.end ?? record.endValue);
    if (Number.isFinite(start) && Number.isFinite(end)) return (start + end) / 2;
  }
  const candidates =
    chartType === "dumbbell"
      ? [record.end, record.endValue, record.value]
      : chartType === "scatter" || chartType === "bubble"
        ? [record.y, record.value]
        : [record.value, record.y];
  const match = candidates.find((value) => Number.isFinite(Number(value)));
  return match == null ? null : Number(match);
}

const GROUP_SECTIONING_RECORD_CHARTS = new Set([
  "bar",
  "dumbbell",
  "forest",
]);

/** Rank category/range/point records by the value that visually defines them. */
export function rankChartRecords(
  chartType,
  records,
  { topN = 20, sort = "value" } = {},
) {
  const source = [...(records || [])];
  const groupOrder = new Map();
  for (const record of source) {
    if (!groupOrder.has(record.group)) groupOrder.set(record.group, groupOrder.size);
  }
  const compare = (a, b) => {
    const aValue = finiteRankingValue(a, chartType);
    const bValue = finiteRankingValue(b, chartType);
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return sort === "ascending" ? aValue - bValue : bValue - aValue;
  };
  const ranked = source.sort(compare);
  const selected = topN && topN > 0 ? ranked.slice(0, topN) : ranked;
  if (
    !GROUP_SECTIONING_RECORD_CHARTS.has(chartType) ||
    !selected.some((record) => record.group != null)
  ) {
    return selected;
  }
  // Ranking chooses the same Top/Bottom N as before, then restores source group
  // order while keeping the value sort inside each block.
  return selected
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const aRank = groupOrder.get(a.record.group) ?? Infinity;
      const bRank = groupOrder.get(b.record.group) ?? Infinity;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ record }) => record);
}

/** Rank heatmap/dot-plot rows by their last visible non-missing value. */
export function rankMatrixRows(matrix, { topN = 20, sort = "value" } = {}) {
  const groupOrder = new Map();
  const rows = (matrix?.y || []).map((label, index) => {
    const values = matrix?.z?.[index] || [];
    let value = null;
    for (let column = values.length - 1; column >= 0; column -= 1) {
      if (values[column] != null && Number.isFinite(Number(values[column]))) {
        value = Number(values[column]);
        break;
      }
    }
    const group = matrix?.groups?.[index] ?? null;
    if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
    return { label, values, value, group, index };
  });
  rows.sort((a, b) => {
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    return sort === "ascending" ? a.value - b.value : b.value - a.value;
  });
  const selected = (topN && topN > 0 ? rows.slice(0, topN) : rows).map(
    (row, rank) => ({ ...row, rank }),
  );
  if (matrix?.groups) {
    selected.sort((a, b) => {
      const aRank = groupOrder.get(a.group) ?? Infinity;
      const bRank = groupOrder.get(b.group) ?? Infinity;
      return aRank - bRank || a.rank - b.rank;
    });
  }
  return {
    ...matrix,
    y: selected.map((row) => row.label),
    z: selected.map((row) => row.values),
    ...(matrix?.groups ? { groups: selected.map((row) => row.group) } : {}),
  };
}

function applyRanking(config, response) {
  if (!getChartType(config.chartType)?.rankingCapable) return response;
  const options = {
    topN: config.filters.topN ?? 20,
    sort: config.appearance.sort || "value",
  };
  if (config.chartType === "line") {
    return { ...response, series: rankLineSeries(response.series, options) };
  }
  if (config.chartType === "heatmap" || config.chartType === "dotPlot") {
    return { ...response, matrix: rankMatrixRows(response.matrix, options) };
  }
  return {
    ...response,
    records: rankChartRecords(config.chartType, response.records, options),
  };
}

/** Resolve one trace layer to its (named) series; [] when not applicable. */
async function loadLayerSeries(layer, config, schema, signal) {
  if (layer.type === "secondMeasure" && layer.y) {
    const result = await requestData(config, schema, signal, { parameter: layer.y });
    return namedSeries(result.series, layer.label || layer.y);
  }
  if (layer.type === "secondSource" && schema.sources?.length) {
    const source = schema.sources.find(
      (candidate) => candidate !== config.filters.source,
    );
    if (!source) return [];
    const result = await requestData(config, schema, signal, { source });
    return namedSeries(result.series, layer.label || source);
  }
  if (layer.type === "benchmark" && layer.values?.length) {
    const result = await requestData(config, schema, signal, {
      locations: layer.values,
    });
    return namedSeries(result.series, layer.label);
  }
  return [];
}

async function loadLineData(config, schema, signal) {
  // Fetch the primary series and every layer concurrently; layers depend only on
  // the config, not on the primary response.
  const [primary, ...layerResults] = await Promise.all([
    requestData(config, schema, signal),
    ...config.layers.map((layer) => loadLayerSeries(layer, config, schema, signal)),
  ]);
  const primarySeries = rankLineSeries(primary.series, {
    topN: config.filters.topN ?? 20,
    sort: config.appearance.sort || "value",
  });
  // Explicit comparison/benchmark layers are not candidates for Top/Bottom N;
  // append them after ranking the primary location series.
  const series = [primarySeries, ...layerResults].flat();
  return { response: primary, series, geometry: null, unmatched: primary.unmatched || [] };
}

// Parsed geometry is static; cache per level so changing the measure/period on a
// choropleth doesn't re-fetch and re-parse the GeoJSON each time.
const geometryCache = new Map();

async function loadGeometry(level, signal) {
  if (geometryCache.has(level)) return geometryCache.get(level);
  const response = await fetch(`/api/geography?level=${level}`, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "County geometry could not be loaded.");
    error.source = body.source;
    throw error;
  }
  geometryCache.set(level, body);
  return body;
}

// A symbol map's coordinates are derived and just as static as the polygons
// they come from; cache per level the same way loadGeometry does.
const pointsCache = new Map();

async function loadPoints(level, signal) {
  if (pointsCache.has(level)) return pointsCache.get(level);
  const response = await fetch(`/api/geography?level=${level}&type=points`, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "County coordinates could not be loaded.");
    error.source = body.source;
    throw error;
  }
  pointsCache.set(level, body);
  return body;
}

/** Load the geometry a v3 observation adapter needs without mixing it into the question. */
export async function loadObservationGeometry(chartType, subset, signal) {
  if (!subset) return null;
  const level = geometryLevelForSubset(subset);
  if (chartType === "choroplethMap") return loadGeometry(level, signal);
  if (chartType === "symbolMap") {
    const [points, geojson] = await Promise.all([
      loadPoints(level, signal),
      loadGeometry(level, signal),
    ]);
    return { points, geojson };
  }
  return null;
}

/**
 * Symbol map's GEOID -> [lon, lat] join. A record whose geoid has no
 * matching point is dropped from the plotted series and named in
 * `unmatched` instead — an unjoined record left with undefined coordinates
 * would render as one fewer point on the map with nothing telling the
 * reader why.
 */
function joinRecordsToPoints(records, points) {
  const series = [];
  const unmatched = [];
  for (const record of records) {
    const point = points[record.geoid];
    if (!point) {
      unmatched.push(record.location ?? record.category);
      continue;
    }
    series.push({ ...record, lon: point[0], lat: point[1] });
  }
  return { series, unmatched };
}

/** Bar-chart change transform: fetch the two-period shape instead of category. */
async function loadBarChangeData(config, schema, signal) {
  const response = await requestData(config, schema, signal, { view: "twoPeriod" });
  const chart = getChartType(config.chartType);
  const topN = config.filters.topN ?? chart?.limits?.recommendTopN ?? 20;
  const records = rankCategoryRecords(
    changeRecords(response.records || [], config.transform),
    { topN, sort: config.appearance.sort || "value" },
  );
  return {
    response: { ...response, records },
    series: records,
    geometry: null,
    unmatched: response.unmatched || [],
    transformApplied: config.transform,
  };
}

/**
 * Choropleth change transform: fetch the geo view at both periods in
 * parallel (geometry fetched once), join by location, and compute change.
 */
async function loadChoroplethChangeData(config, schema, signal) {
  const level = geometryLevelForSubset(config.filters.subset);
  // Unset bounds fall back to the schema's full year range — without this,
  // both fetches would default to the latest period and every change would
  // compute as zero.
  const [rangeStart, rangeEnd] = schema.yearRange || [];
  const startPeriod = config.period.startYear ?? rangeStart;
  const endPeriod = config.period.endYear ?? rangeEnd;
  const [startResponse, endResponse, geometry] = await Promise.all([
    requestData(config, schema, signal, { period: startPeriod }),
    requestData(config, schema, signal, { period: endPeriod }),
    loadGeometry(level, signal),
  ]);
  const endByLocation = new Map(
    (endResponse.records || []).map((record) => [record.location, record]),
  );
  const joined = (startResponse.records || [])
    .filter((record) => endByLocation.has(record.location))
    .map((record) => ({
      ...record,
      start: record.value,
      end: endByLocation.get(record.location).value,
    }));
  const records = changeRecords(joined, config.transform);
  return {
    response: { ...endResponse, records },
    series: records,
    geometry,
    unmatched: [
      ...new Set([...(startResponse.unmatched || []), ...(endResponse.unmatched || [])]),
    ],
    transformApplied: config.transform,
  };
}

/**
 * Inline ("your data") path: shaped entirely client-side via
 * lib/tabular/toSeries.js — no fetch, matching the same
 * `{ response, series, geometry, unmatched }` envelope the module fetch
 * paths return so every downstream consumer (toPlotly, validation) is
 * unaware which source produced the data.
 *
 * TODO(Phase 4 follow-up): the bar/choropleth change-transform two-period
 * fetches (loadBarChangeData/loadChoroplethChangeData) and line's layer
 * fetches (loadLineData's benchmark/secondSource/secondMeasure layers) have
 * no inline equivalent yet — an inline chart with a change transform or
 * comparison layers simply renders the untransformed/layer-less shape.
 */
function loadInlineData(config) {
  const built = buildShapes(config.data.inline, config);
  const response = applyRanking(config, built);
  const series = response.series || response.records || response.matrix || [];
  return { response, series, geometry: null, unmatched: response.unmatched || [] };
}

async function loadModuleChartData(config, schema, signal) {
  if (config.chartType === "line") {
    return loadLineData(config, schema, signal);
  }
  if (config.chartType === "bar" && isChangeTransform(config.transform)) {
    return loadBarChangeData(config, schema, signal);
  }
  if (config.chartType === "choroplethMap" && isChangeTransform(config.transform)) {
    return loadChoroplethChangeData(config, schema, signal);
  }

  const responsePromise = requestData(config, schema, signal);
  const geometryPromise =
    config.chartType === "choroplethMap"
      ? loadGeometry(geometryLevelForSubset(config.filters.subset), signal)
      : Promise.resolve(null);
  const pointsPromise =
    config.chartType === "symbolMap"
      ? loadPoints(geometryLevelForSubset(config.filters.subset), signal)
      : Promise.resolve(null);

  const [rawResponse, geometry, points] = await Promise.all([
    responsePromise,
    geometryPromise,
    pointsPromise,
  ]);
  const response = applyRanking(config, rawResponse);
  let series =
    response.series ||
    response.records ||
    response.matrix ||
    [];
  let unmatched = response.unmatched || [];

  if (config.chartType === "symbolMap" && points) {
    const joined = joinRecordsToPoints(series, points);
    series = joined.series;
    unmatched = [...unmatched, ...joined.unmatched];
  }

  return { response, series, geometry, unmatched };
}

function emptyModuleResult(config, context) {
  const matrix = { x: [], y: [], z: [] };
  const matrixChart = config.chartType === "heatmap" || config.chartType === "dotPlot";
  const series = matrixChart ? matrix : [];
  return {
    response: matrixChart ? { matrix } : { records: [] },
    series,
    geometry: null,
    unmatched: [],
    tabOptions: context.tabOptions,
    tabValue: context.tabValue,
  };
}

export async function loadChartData(config, schema, signal) {
  if (config.data?.source === "inline") {
    return loadInlineData(config);
  }
  const context = await prepareModuleFeatures(config, schema, signal);
  if (context?.allowedLocations && context.allowedLocations.length === 0) {
    return emptyModuleResult(config, context);
  }
  const effectiveConfig = context?.config || config;
  const groupRequests = context?.groupRequests || [];
  const result = groupRequests.length
    ? mergeGroupedModuleResults(
        await Promise.all(
          groupRequests.map(async ({ group, config: groupConfig }) => ({
            group,
            result: await loadModuleChartData(groupConfig, schema, signal),
          })),
        ),
        effectiveConfig,
      )
    : await loadModuleChartData(effectiveConfig, schema, signal);
  return withModuleFeatures(result, effectiveConfig, context);
}

/**
 * Load the chart-shaped data for export using the active data-selection settings
 * except the visual Top/Bottom N cap. A zero cap is the existing ranking
 * helpers' "unlimited" value, so the exported table retains the configured
 * filters, dates, grouping, sort direction, and comparison inputs while
 * including rows the rendered chart omits for readability.
 */
export function loadChartExportData(config, schema, signal) {
  return loadChartData(
    {
      ...config,
      filters: { ...(config.filters || {}), topN: 0 },
    },
    schema,
    signal,
  );
}

export function hasChartData(chartType, result) {
  if (!result) return false;
  // Matrix-shaped results (heatmap + multi-series dot plot) carry {x,y,z}.
  if (chartType === "heatmap" || chartType === "dotPlot") {
    return Boolean(result.series?.y?.length);
  }
  return Array.isArray(result.series) && result.series.length > 0;
}

/** Number of series/categories/rows a result holds (for complexity validation). */
export function seriesCountOf(chartType, result) {
  if (!result) return 0;
  if (chartType === "heatmap" || chartType === "dotPlot") {
    return result.series?.y?.length || 0;
  }
  return Array.isArray(result.series) ? result.series.length : 0;
}

/**
 * Distinct series/trace names a result will render, for the palette
 * per-series override rows (PalettePicker.js). Best-effort: derived from the
 * same fields toPlotly's builders use to name a trace, so the palette rows
 * line up with what's on the chart.
 */
export function seriesNamesOf(chartType, result) {
  if (!result) return [];
  if (chartType === "heatmap") return result.series?.y || [];
  // Dot plot colours by series = the matrix columns (x), one trace each.
  if (chartType === "dotPlot") return result.series?.x || [];
  const records = Array.isArray(result.series)
    ? result.series
    : result.series?.records || [];
  if (chartType === "line") {
    return [...new Set(records.map((item) => item.location || item.label).filter(Boolean))];
  }
  if (chartType === "bar") {
    return [...new Set(records.map((item) => item.color || item.series).filter(Boolean))];
  }
  if (chartType === "scatter" || chartType === "bubble") {
    return [...new Set(records.map((item) => item.group || item.color).filter(Boolean))];
  }
  if (chartType === "dumbbell" || chartType === "forest") {
    return [...new Set(records.map((item) => item.category || item.location).filter(Boolean))];
  }
  return [];
}

function legendValue(row, binding, fallbacks = []) {
  for (const key of [binding, ...fallbacks]) {
    if (!key || row?.[key] == null || String(row[key]).trim() === "") continue;
    return String(row[key]);
  }
  return null;
}

/**
 * Distinct names rendered as discrete legend items. Unlike `seriesNamesOf`,
 * this follows each Plotly builder's actual legend contract: pies use slice
 * labels, Range charts use endpoint names, and continuous color scales have no
 * individually renameable entries.
 */
export function legendNamesOf(config, result) {
  if (!result) return [];
  const chartType = config?.chartType;
  const bindings = config?.bindings || {};
  const records = Array.isArray(result.series)
    ? result.series
    : result.series?.records || [];
  const unique = (values) => [...new Set(values.filter(Boolean).map(String))];

  if (chartType === "line") {
    const baseNames = records.map((item) => item.location || item.label);
    const derivedNames = (config.layers || [])
      .filter((layer) => layer.type === "derivedComparison" && layer.transform)
      .flatMap((layer) =>
        baseNames.filter(Boolean).map((name) => `${name} · ${layer.label}`),
      );
    return unique([...baseNames, ...derivedNames]);
  }
  if (chartType === "bar") {
    return unique(
      records.map(
        (row) => legendValue(row, bindings.color, ["color", "series"]) || "Value",
      ),
    );
  }
  if (chartType === "scatter" || chartType === "bubble") {
    return unique(
      records.map(
        (row) =>
          legendValue(row, bindings.color, ["group", "color"]) || "Observations",
      ),
    );
  }
  if (chartType === "pie") {
    return unique(
      records.map((row) =>
        legendValue(row, bindings.category, ["category", "label", "location"]),
      ),
    );
  }
  if (chartType === "dotPlot") return unique(result.series?.x || []);
  if (chartType === "dumbbell" || chartType === "forest") {
    const distinctEndpoints =
      Boolean(bindings.start) &&
      Boolean(bindings.end) &&
      bindings.start !== bindings.end;
    const startName = distinctEndpoints
      ? bindings.start
      : result.response?.startYear ??
        config.period?.startYear ??
        bindings.start ??
        "Start";
    const endName = distinctEndpoints
      ? bindings.end
      : result.response?.endYear ??
        config.period?.endYear ??
        bindings.end ??
        "End";
    const pointName =
      chartType === "forest"
        ? [bindings.point || "Estimate"]
        : bindings.point
          ? [bindings.point]
          : [];
    return unique([startName, endName, ...pointName]);
  }
  return [];
}

/** Loaded labels for the Advanced line/bar value manager. */
export function categoryNamesOf(chartType, result) {
  if (!result || !["line", "bar"].includes(chartType)) return [];
  const records = Array.isArray(result.series)
    ? result.series
    : result.series?.records || [];
  return [
    ...new Set(
      records
        .map((item) => item.category || item.location || item.label)
        .filter(Boolean),
    ),
  ];
}

// ── Loaded numeric axis ranges ──────────────────────────────────────

function numericExtent(values) {
  const finite = values
    .flat(Infinity)
    .filter((value) => value != null && value !== "")
    .map((value) => Number(value))
    .filter(Number.isFinite);
  if (!finite.length) return null;
  return { min: Math.min(...finite), max: Math.max(...finite) };
}

function loadedValue(record, binding, fallbacks = []) {
  for (const key of [binding, ...fallbacks]) {
    if (key && record?.[key] != null && record[key] !== "") return record[key];
  }
  return null;
}

/**
 * Numeric extents on the physical x/y axes of the loaded chart. These are
 * runtime metadata for safely gating manual tick increments; categorical text
 * produces no extent and therefore no numeric tick control.
 */
export function axisRangesOf(config, result) {
  if (!result) return {};
  const bindings = config.bindings || {};
  const appearance = config.appearance || {};
  const records = Array.isArray(result.series)
    ? result.series
    : result.series?.records || [];
  let horizontal = [];
  let vertical = [];

  switch (config.chartType) {
    case "line":
      horizontal = records.flatMap((series) => series.years || []);
      vertical = records.flatMap((series) => series.values || []);
      break;
    case "bar": {
      const categories = records.map((record) =>
        loadedValue(record, bindings.category, ["category", "location", "year"]),
      );
      const values = records.map((record) =>
        loadedValue(record, bindings.y, ["value", "y"]),
      );
      const horizontalBars = appearance.diverging
        ? appearance.orientation !== "vertical"
        : appearance.orientation === "horizontal";
      horizontal = horizontalBars ? values : categories;
      vertical = horizontalBars ? categories : values;
      break;
    }
    case "dumbbell":
    case "forest":
      horizontal = records.flatMap((record) => [
        loadedValue(record, bindings.start, ["start", "startValue"]),
        loadedValue(record, bindings.end, ["end", "endValue"]),
        loadedValue(record, bindings.point, ["point"]),
      ]);
      break;
    case "dotPlot":
      horizontal = result.series?.z || [];
      break;
    case "scatter":
    case "bubble":
      horizontal = records.map((record) =>
        loadedValue(record, bindings.x, ["x"]),
      );
      vertical = records.map((record) =>
        loadedValue(record, bindings.y, ["y"]),
      );
      break;
    case "heatmap":
      horizontal = result.series?.x || [];
      vertical = result.series?.y || [];
      break;
    default:
      break;
  }

  return {
    horizontal: numericExtent(horizontal),
    vertical: numericExtent(vertical),
  };
}
