/**
 * chartData.js — API query construction and layered chart-data loading.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Module API routes selected through schema.apiPath
 *
 * UI Kit reference:
 *   - None — data-loading utility that does not render UI
 */

import { getChartType } from "@/lib/visualization/chartRegistry";

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

function selectedLocations(config) {
  const places = config.layers
    .filter((layer) => layer.type === "selectedPlaces")
    .flatMap((layer) => layer.values || []);
  return [...new Set(places)];
}

function buildSearchParams(config, overrides = {}) {
  const view = QUERY_SHAPES[config.chartType];
  const params = new URLSearchParams({
    view,
    subset: overrides.subset || config.filters.subset,
  });
  const source = overrides.source || config.filters.source;
  if (source) params.set("source", source);

  const locations = overrides.locations || selectedLocations(config);
  if (locations?.length) params.set("locations", locations.join(","));
  if (config.period.startYear) params.set("startYear", config.period.startYear);
  if (config.period.endYear) params.set("endYear", config.period.endYear);
  if (config.period.year) params.set("period", config.period.year);

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
  return params;
}

async function requestData(config, schema, signal, overrides = {}) {
  const params = buildSearchParams(config, overrides);
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
  return { response: primary, series, geometry: null };
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

export async function loadChartData(config, schema, signal) {
  if (config.chartType === "line") {
    return loadLineData(config, schema, signal);
  }

  const responsePromise = requestData(config, schema, signal);
  const geometryPromise =
    config.chartType === "choroplethMap"
      ? loadGeometry("counties", signal)
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
  return { response, series, geometry };
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
