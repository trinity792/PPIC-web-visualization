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

import { getChartType } from "@/lib/visualization/chartRegistry";
import { buildShapes } from "@/lib/tabular/toSeries";

const QUERY_SHAPES = Object.freeze({
  line: "line",
  bar: "category",
  dumbbell: "twoPeriod",
  slope: "twoPeriod",
  scatter: "pairs",
  bubble: "pairs",
  heatmap: "matrix",
  choroplethMap: "geo",
});

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
    if (start != null && end != null) {
      value =
        transformId === "percentChange"
          ? start === 0
            ? null
            : ((end - start) / start) * 100
          : end - start; // numericChange, percentagePointChange
    }
    return { ...rest, value };
  });
}

/** "Counties" subset → the "counties" geometry level; anything else lowercased
 * (flagged issue 3 — the geometry level was previously hard-coded). */
function geometryLevelForSubset(subset) {
  if (!subset) return "counties";
  return subset === "Counties" ? "counties" : subset.toLowerCase();
}

function selectedLocations(config) {
  const places = config.layers
    .filter((layer) => layer.type === "selectedPlaces")
    .flatMap((layer) => layer.values || []);
  return [...new Set(places)];
}

function buildSearchParams(config, schema, overrides = {}) {
  const view = overrides.view || QUERY_SHAPES[config.chartType];
  const params = new URLSearchParams({
    view,
    subset: overrides.subset || config.filters.subset,
  });
  const source = overrides.source || config.filters.source;
  if (source) params.set("source", source);

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
    const parameter =
      overrides.parameter ||
      config.bindings.y ||
      config.bindings.color ||
      config.bindings.start;
    if (parameter) params.set("parameter", parameter);
  }

  if (view === "category") {
    const chart = getChartType(config.chartType);
    params.set(
      "topN",
      String(
        overrides.topN ||
          config.filters.topN ||
          chart?.limits?.recommendTopN ||
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

function namedSeries(series, suffix) {
  return series.map((item) => ({
    ...item,
    location: `${item.location} · ${suffix}`,
  }));
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
  const series = [primary.series, ...layerResults].flat();
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

/** Bar-chart change transform: fetch the two-period shape instead of category. */
async function loadBarChangeData(config, schema, signal) {
  const response = await requestData(config, schema, signal, { view: "twoPeriod" });
  const chart = getChartType(config.chartType);
  const topN = config.filters.topN || chart?.limits?.recommendTopN || 20;
  const records = changeRecords(response.records || [], config.transform).slice(0, topN);
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
  const response = buildShapes(config.data.inline, config);
  const series = response.series || response.records || response.matrix || [];
  return { response, series, geometry: null, unmatched: response.unmatched || [] };
}

export async function loadChartData(config, schema, signal) {
  if (config.data?.source === "inline") {
    return loadInlineData(config);
  }
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

  const [response, geometry] = await Promise.all([
    responsePromise,
    geometryPromise,
  ]);
  const series =
    response.series ||
    response.records ||
    response.matrix ||
    [];
  return { response, series, geometry, unmatched: response.unmatched || [] };
}

export function hasChartData(chartType, result) {
  if (!result) return false;
  if (chartType === "heatmap") return Boolean(result.series?.y?.length);
  return Array.isArray(result.series) && result.series.length > 0;
}

/** Number of series/categories/rows a result holds (for complexity validation). */
export function seriesCountOf(chartType, result) {
  if (!result) return 0;
  if (chartType === "heatmap") return result.series?.y?.length || 0;
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
  const records = Array.isArray(result.series)
    ? result.series
    : result.series?.records || [];
  if (chartType === "line") {
    return [...new Set(records.map((item) => item.location || item.label).filter(Boolean))];
  }
  if (chartType === "bar") {
    return [...new Set(records.map((item) => item.group || item.series).filter(Boolean))];
  }
  if (chartType === "scatter" || chartType === "bubble") {
    return [...new Set(records.map((item) => item.group || item.color).filter(Boolean))];
  }
  if (chartType === "dumbbell" || chartType === "slope") {
    return [...new Set(records.map((item) => item.category || item.location).filter(Boolean))];
  }
  return [];
}
