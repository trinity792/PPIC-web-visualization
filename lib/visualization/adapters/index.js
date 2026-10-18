/**
 * adapters/index.js — turns observations into Plotly figures for the two map
 * types, and into the display table for the data table.
 *
 * Every other chart type draws with visx from a chart model
 * (lib/visualization/models); their Plotly adapters were removed in renderer
 * plan O, so `adaptObservations` reports any other type as unregistered.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   adaptObservations(input) — { data, layout, key, frame, ... } for a map, or
 *                              { table, observations } for the data table
 *   ADAPTER_IDS              — the chart types this module handles
 *
 * Data sources:
 *   - The same input as buildChartModel, via PreviewContext
 */

import { COLORS } from "@/lib/constants";

import { CHART_STYLE } from "../chartStyle";
import {
  classCountFor,
  classIndex,
  customBreaksFor,
  classesFor,
  classificationFor,
  scaleStops,
} from "../colorScale";
import { formatNumber, formatTableNumber, unavailableValueText } from "../formatters";
import { comparisonColors, defaultRampPalette, officialComparisonScheme } from "../palettes";
import { formatAxisNumber, numberFormatFor, sharedSettings } from "../models/sharedSettings";
import { displayTableFromObservations } from "@/lib/export/exportTable";

const ADAPTER_IDS = Object.freeze({
  choroplethMap: "choroplethMap",
  symbolMap: "symbolMap",
  dataTable: "dataTable",
});

function availableValue(row) {
  return row.status === "available" ? row.value : null;
}

function activeRows(observations, presentation, fallbackId) {
  const requested = presentation?.activeTab;
  const active = requested && presentation?.comparisonVisibility?.[requested] !== false
    ? requested
    : fallbackId;
  const comparisonRows = observations.filter((row) => row.comparisonId === active);
  const activePeriod = presentation?.activePeriod;
  return activePeriod == null
    ? comparisonRows
    : comparisonRows.filter((row) => row.period === activePeriod);
}

// ── Maps (renderer plan L) ───────────────────────────────────────────
//
// Plotly draws only the geography. The title, key, and source box are drawn
// by ChartFrame and ChartKey around it (owner, 2026-10-12), so the figure
// carries the key and the shared settings beside its traces. Places are colored
// by class (quantile, 5 by default) as PPIC's published maps are, or along the
// ramp when the reader picks Continuous (colorScale.js).

function mapRows({ observations, comparisons, presentation }) {
  const available = comparisons.filter(
    (comparison) => presentation?.comparisonVisibility?.[comparison.id] !== false,
  );
  return { available, rows: activeRows(observations, presentation, available[0]?.id) };
}

/** Classes or a continuous ramp for the map's values, and the key that names them. */
function mapColors(input, rows, { colored = true } = {}) {
  const { chartType, appearance = {} } = input;
  const shared = sharedSettings(input);
  const kind = appearance.colorScale === "diverging" ? "diverging" : "sequential";
  const stops = scaleStops(appearance, {
    kind,
    invert: Boolean(appearance.invertScale),
    fallback: defaultRampPalette(chartType, kind),
  });
  const numberFormat = numberFormatFor(rows, appearance, "vertical");
  const format = (value, decimals) =>
    numberFormat
      ? formatAxisNumber(value, numberFormat)
      : formatNumber(value, { type: "number", decimalPlaces: decimals ?? 0 });
  const values = rows.map(availableValue);
  const finite = values.filter(Number.isFinite);
  const classification = classificationFor(appearance);
  const domain = finite.length ? [Math.min(...finite), Math.max(...finite)] : [0, 1];
  const keyBase = {
    position: shared.key.position,
    title: rows[0]?.measureLabel || rows[0]?.measureId || null,
  };
  if (!colored) return { shared, stops, values, domain, numberFormat, format, key: null };
  if (classification === "continuous") {
    return {
      shared,
      stops,
      values,
      domain,
      numberFormat,
      format,
      continuous: true,
      key: finite.length
        ? {
            ...keyBase,
            entries: [],
            scale: {
              stops,
              minLabel: format(domain[0], numberFormat?.decimalPlaces),
              maxLabel: format(domain[1], numberFormat?.decimalPlaces),
            },
          }
        : null,
    };
  }
  const count = classCountFor(appearance);
  const { thresholds, classes } = classesFor(finite, {
    // Custom breaks that do not fit the class count fall back to quantiles.
    method: classification === "equalInterval" ? "equalInterval" : "quantile",
    count,
    stops,
    decimalPlaces: numberFormat?.decimalPlaces ?? null,
    breaks: classification === "custom" ? customBreaksFor(appearance, count) : null,
    format,
  });
  return {
    shared,
    stops,
    values,
    domain,
    numberFormat,
    format,
    classed: { thresholds, classes },
    key: classes.length
      ? {
          ...keyBase,
          // The breaks in use, so the editor can start custom breaks from them.
          breaks: thresholds,
          entries: classes.map((entry) => ({
            id: `class-${entry.index}`,
            label: entry.label,
            color: entry.color,
          })),
        }
      : null,
  };
}

/**
 * A stepped Plotly colorscale that colors each value by its class, so `z` keeps
 * the real values. Each class starts a hair below its threshold, so a value
 * equal to a threshold takes the class above it, as `classIndex` does.
 */
function steppedScale({ thresholds, classes }, [min, max]) {
  const span = max > min ? max - min : 1;
  const position = (value) => Math.min(1, Math.max(0, (value - min) / span - 1e-9));
  const starts = [0, ...thresholds.map(position)];
  return classes.flatMap((entry, index) => [
    [starts[index], entry.color],
    [index + 1 < classes.length ? starts[index + 1] : 1, entry.color],
  ]);
}

const MAP_BOUNDS_PADDING = 0.03;

/** Every [lon, lat] in a GeoJSON feature's polygons. */
function featurePoints(feature) {
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "MultiPolygon"
    ? geometry.coordinates
    : geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : [];
  return polygons.flat(2);
}

/**
 * The drawn places' extent as Plotly geo axis ranges, padded a little, or null
 * when there is no shape to measure. Plotly's own `fitbounds` fits a map
 * inside the world's 2:1 frame, which left California in a short strip with
 * empty bands above and below; explicit ranges let the frame take the
 * places' own shape, so the map fills the drawing area.
 */
function mapBounds(geojson, ids, points = []) {
  const wanted = new Set(ids.map(String));
  const coordinates = [
    ...(geojson?.features || [])
      .filter((feature) => wanted.has(String(feature.properties?.GEOID)))
      .flatMap(featurePoints),
    ...points,
  ].filter((point) => Array.isArray(point) && point.every(Number.isFinite));
  if (!coordinates.length) return null;
  const lons = coordinates.map((point) => point[0]);
  const lats = coordinates.map((point) => point[1]);
  const pad = (low, high) => {
    const span = Math.max(high - low, 0.5);
    return [low - span * MAP_BOUNDS_PADDING, high + span * MAP_BOUNDS_PADDING];
  };
  return {
    lon: pad(Math.min(...lons), Math.max(...lons)),
    lat: pad(Math.min(...lats), Math.max(...lats)),
  };
}

/** Mercator's vertical position for a latitude, in the units of longitude radians. */
function mercatorY(latitude) {
  return Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
}

/**
 * The map's own width over its height in Mercator, so the frame can size the
 * drawing to the map and set the key right beside it, as the guide's example
 * does, instead of centering the map in a wide area far from its key.
 */
function mapAspectRatio(bounds) {
  if (!bounds) return null;
  const width = ((bounds.lon[1] - bounds.lon[0]) * Math.PI) / 180;
  const height = mercatorY(bounds.lat[1]) - mercatorY(bounds.lat[0]);
  return width > 0 && height > 0 ? Math.round((width / height) * 1000) / 1000 : null;
}

function mapGeo(bounds) {
  if (!bounds) return { fitbounds: "locations", visible: false };
  return {
    visible: false,
    projection: { type: "mercator" },
    lonaxis: { range: bounds.lon },
    lataxis: { range: bounds.lat },
  };
}

function mapLayout(shared, bounds) {
  return {
    font: { family: CHART_STYLE.text.axis.fontFamily, color: CHART_STYLE.text.axis.color },
    hoverlabel: {
      font: { family: CHART_STYLE.text.axis.fontFamily, size: shared.typography.dataLabel },
    },
    margin: { l: 0, r: 0, t: 0, b: 0 },
    showlegend: false,
    geo: mapGeo(bounds),
  };
}

/** What the map draws beside Plotly: the frame's settings, the key, and its shape. */
function mapExtras(shared, key, rows, chartType, bounds) {
  const measure = rows[0]?.measureLabel || rows[0]?.measureId || "values";
  const shape = chartType === "symbolMap" ? "Symbol map" : "Map";
  const classes = key?.entries?.length
    ? ` Key: ${key.entries.map((entry) => entry.label).join("; ")}.`
    : "";
  return {
    labels: shared.labels,
    typography: shared.typography,
    frame: shared.frame,
    key,
    aspectRatio: mapAspectRatio(bounds),
    summary: `${shape} of ${measure} for ${rows.length} ${rows.length === 1 ? "place" : "places"}.${classes}`,
  };
}

/** Hover text as the View Data table writes it, or in the chosen number format. */
function hoverText(rows, numberFormat) {
  return rows.map((row) => {
    const value = availableValue(row);
    if (!Number.isFinite(value)) return unavailableValueText(row.status);
    return numberFormat ? formatAxisNumber(value, numberFormat) : formatTableNumber(value);
  });
}

function mapFigure(input) {
  const { presentation, geometry } = input;
  const { available, rows } = mapRows(input);
  const comparisonId = rows[0]?.comparisonId || available[0]?.id;
  const colors = mapColors(input, rows);
  const bounds = mapBounds(geometry, rows.map((row) => row.geographyId));
  const { classed, values } = colors;
  const domain = colors.domain;
  const coloring = {
    z: values,
    zmin: domain[0],
    zmax: domain[1] > domain[0] ? domain[1] : domain[0] + 1,
    colorscale: classed ? steppedScale(classed, domain) : colors.stops,
  };
  return {
    data: [{
      type: "choropleth",
      geojson: geometry,
      featureidkey: "properties.GEOID",
      locations: rows.map((row) => row.geographyId),
      ...coloring,
      showscale: false,
      text: rows.map((row) => row.geographyLabel),
      customdata: hoverText(rows, colors.numberFormat),
      hovertemplate: "<b>%{text}</b><br>%{customdata}<extra></extra>",
      marker: { line: { color: CHART_STYLE.graphLine.color, width: 0.5 } },
      meta: { comparisonId },
    }],
    layout: mapLayout(colors.shared, bounds),
    tabs: {
      primary: { axis: presentation?.primaryTabAxis || "comparison" },
      secondary: { axis: "period", label: "Year" },
    },
    ...mapExtras(colors.shared, colors.key, rows, "choroplethMap", bounds),
  };
}

function symbolMapFigure(input) {
  const { comparisons, presentation, geometry, appearance } = input;
  const { available, rows } = mapRows(input);
  // v3 supplies both layers: representative points carry the data marks, and
  // the same GeoJSON used by Choropleth supplies geographic context beneath
  // them. Continue accepting a plain point map for saved/in-memory callers.
  const points = geometry?.points || geometry || {};
  const geojson = geometry?.geojson || null;
  const joined = rows
    .map((row) => ({ row, point: points[row.geographyId] }))
    .filter(({ point }) => Array.isArray(point) && point.length >= 2);
  const joinedRows = joined.map(({ row }) => row);
  const gradient = Boolean(appearance?.symbolGradient);
  const colors = mapColors(input, joinedRows, { colored: gradient });
  const values = colors.values;
  const finite = values.filter(Number.isFinite);
  const maximum = finite.length ? Math.max(...finite.map(Math.abs)) : 1;
  const comparisonId = rows[0]?.comparisonId || available[0]?.id;
  const bounds = mapBounds(
    geojson,
    joinedRows.map((row) => row.geographyId),
    joined.map(({ point }) => point),
  );
  const boundaryLon = [];
  const boundaryLat = [];
  for (const feature of geojson?.features || []) {
    const polygons = feature.geometry?.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : feature.geometry?.type === "Polygon"
        ? [feature.geometry.coordinates]
        : [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const point of ring) {
          boundaryLon.push(point[0]);
          boundaryLat.push(point[1]);
        }
        boundaryLon.push(null);
        boundaryLat.push(null);
      }
    }
  }
  const boundaryTrace = boundaryLon.length
    ? [{
        type: "scattergeo",
        mode: "lines",
        lon: boundaryLon,
        lat: boundaryLat,
        line: { color: CHART_STYLE.graphLine.color, width: CHART_STYLE.graphLine.width },
        hoverinfo: "skip",
        showlegend: false,
        meta: { role: "geography-background" },
      }]
    : [];
  // Off: every symbol takes its comparison's one color and area alone carries
  // the value. On: symbols are colored by class (or along the ramp) too.
  let markerColor;
  if (!gradient) {
    markerColor = comparisonColors(comparisons, appearance)[comparisonId] ||
      officialComparisonScheme(1)[0];
  } else if (colors.classed) {
    markerColor = values.map((value) =>
      Number.isFinite(value)
        ? colors.classed.classes[classIndex(value, colors.classed.thresholds)]?.color ?? null
        : null,
    );
  } else {
    markerColor = values;
  }
  return {
    data: [...boundaryTrace, {
      type: "scattergeo",
      mode: "markers",
      name:
        rows[0]?.comparisonLabel ||
        available.find((comparison) => comparison.id === rows[0]?.comparisonId)?.label,
      showlegend: false,
      lon: joined.map(({ point }) => point[0]),
      lat: joined.map(({ point }) => point[1]),
      text: joinedRows.map((row) => row.geographyLabel),
      customdata: hoverText(joinedRows, colors.numberFormat),
      hovertemplate: "<b>%{text}</b><br>%{customdata}<extra></extra>",
      marker: {
        color: markerColor,
        ...(gradient && colors.continuous
          ? {
              colorscale: colors.stops,
              cmin: colors.domain[0],
              cmax: colors.domain[1],
            }
          : {}),
        size: values.map((value) =>
          Number.isFinite(value) ? Math.max(5, Math.sqrt(Math.abs(value) / maximum) * 34) : 0,
        ),
        sizemode: "diameter",
        opacity: 0.85,
        line: { color: COLORS.white, width: 1 },
        showscale: false,
      },
      meta: { comparisonId: rows[0]?.comparisonId },
    }],
    layout: mapLayout(colors.shared, bounds),
    tabs: {
      primary: { axis: presentation?.primaryTabAxis || "comparison" },
      secondary: { axis: "period", label: "Year" },
    },
    ...mapExtras(colors.shared, colors.key, joinedRows, "symbolMap", bounds),
  };
}

export function adaptObservations(input) {
  const chartType = ADAPTER_IDS[input.chartType];
  if (chartType === "choroplethMap") return mapFigure(input);
  if (chartType === "symbolMap") return symbolMapFigure(input);
  if (chartType === "dataTable") {
    return {
      table: displayTableFromObservations({
        observations: input.observations,
        presentation: input.presentation,
      }),
      observations: input.observations,
    };
  }
  throw new Error(`No observation adapter is registered for ${input.chartType}.`);
}

export { ADAPTER_IDS };
