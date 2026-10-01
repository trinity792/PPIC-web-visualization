import { PALETTES, assignComparisonColors, rampFor, seriesColor } from "../palettes";
import { getChartType } from "../chartRegistry";
import { colorsForLineSeries, lineSeries, visibleComparisons } from "../lineSeries";
import { barSeries } from "../barSeries";
import { numberFormatFor } from "../models/sharedSettings";
import { displayTableFromObservations } from "@/lib/export/exportTable";

const ADAPTER_IDS = Object.freeze({
  line: "line",
  bar: "bar",
  choroplethMap: "choroplethMap",
  heatmap: "heatmap",
  dumbbell: "dumbbell",
  dotPlot: "dotPlot",
  forest: "forest",
  scatter: "scatter",
  bubble: "bubble",
  pie: "pie",
  symbolMap: "symbolMap",
  dataTable: "dataTable",
});

function availableValue(row) {
  return row.status === "available" ? row.value : null;
}

// The number type and decimal places are read by sharedSettings.js, the one
// owner for both renderers; this turns them into Plotly's d3 format.
function verticalNumberFormat(observations, appearance = {}) {
  const numberFormat = numberFormatFor(observations, appearance, "vertical");
  if (!numberFormat) return null;
  return {
    d3: `,.${numberFormat.decimalPlaces}f`,
    prefix: numberFormat.type === "usd" ? "$" : "",
    suffix: numberFormat.type === "percent" ? "%" : "",
  };
}

function formattedValueToken(token, numberFormat) {
  const formatted = token.replace(/\}$/, `:${numberFormat.d3}}`);
  return `${numberFormat.prefix}${formatted}${numberFormat.suffix}`;
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

function colorsFor(comparisons, appearance = {}) {
  const overrides = Object.fromEntries(
    comparisons.filter((entry) => entry.color).map((entry) => [entry.id, entry.color]),
  );
  const assigned = assignComparisonColors(comparisons, {
    existing: appearance.comparisonColors || {},
    overrides,
  });
  const paletteSelected = PALETTES[appearance.palette]?.kind === "categorical";
  return Object.fromEntries(
    comparisons.map((comparison, index) => [
      comparison.id,
      comparison.color || !paletteSelected
        ? assigned[comparison.id]
        : seriesColor(appearance, comparison.label || comparison.id, index),
    ]),
  );
}

const NUMERIC_AXIS_TICK_POSITIONS = 6;

function uniqueAxisPositions(data, axis) {
  return new Set(
    data.flatMap((trace) => (Array.isArray(trace?.[axis]) ? trace[axis] : []))
      .filter((value) => value != null && value !== "")
      .map((value) => String(value)),
  ).size;
}

function linePositionCounts(chartType, data) {
  const xCount = Math.max(1, uniqueAxisPositions(data, "x"));
  const yCount = Math.max(1, uniqueAxisPositions(data, "y"));
  if (chartType === "line") {
    return { horizontal: Math.max(1, data.length), vertical: xCount };
  }
  if (chartType === "bar") {
    const horizontalBars = data[0]?.orientation === "h";
    return horizontalBars
      ? { horizontal: yCount, vertical: NUMERIC_AXIS_TICK_POSITIONS }
      : { horizontal: NUMERIC_AXIS_TICK_POSITIONS, vertical: xCount };
  }
  if (["dumbbell", "forest", "dotPlot"].includes(chartType)) {
    return { horizontal: yCount, vertical: NUMERIC_AXIS_TICK_POSITIONS };
  }
  return { horizontal: yCount, vertical: xCount };
}

function pixelPadding(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(100, Math.round(number));
}

function withLinePaddingMeta(result, chartType, appearance = {}) {
  if (!result?.layout || !getChartType(chartType)?.lineAxes) return result;
  const counts = linePositionCounts(chartType, result.data || []);
  return {
    ...result,
    layout: {
      ...result.layout,
      meta: {
        ...(result.layout.meta || {}),
        ppicLinePadding: {
          horizontal: pixelPadding(appearance.horizontalLinePadding),
          vertical: pixelPadding(appearance.verticalLinePadding),
          horizontalCount: counts.horizontal,
          verticalCount: counts.vertical,
        },
      },
    },
  };
}

function categoryOf(row) {
  return row.categoryLabel || row.geographyLabel || row.comparisonLabel;
}

function layoutFor(appearance = {}, labels = {}, base = {}) {
  const configured = appearance.layout || {};
  const xaxis = { ...(base.xaxis || {}), ...(configured.xaxis || {}) };
  const yaxis = { ...(base.yaxis || {}), ...(configured.yaxis || {}) };
  if (labels.xAxis) xaxis.title = { text: labels.xAxis };
  if (labels.yAxis) yaxis.title = { text: labels.yAxis };
  if (appearance.hideXAxis) xaxis.visible = false;
  return {
    ...base,
    ...configured,
    ...(labels.title ? { title: { text: labels.title } } : {}),
    ...(Object.keys(xaxis).length ? { xaxis } : {}),
    ...(Object.keys(yaxis).length ? { yaxis } : {}),
  };
}

function lineFigure({ observations, comparisons, presentation, appearance, labels }) {
  const series = lineSeries(observations, comparisons, presentation);
  const colors = colorsForLineSeries(series, appearance);
  const numberFormat = verticalNumberFormat(observations, appearance);
  return {
    data: series.map((entry) => {
      const { rows } = entry;
      const color = colors[entry.id];
      return {
        type: "scatter",
        // Change calculations intentionally return one derived observation per
        // geography. A one-point trace in `lines` mode is invisible.
        // Markers only when saved "on", matching the Markers switch and the
        // visx line chart (renderer plan D; the style guide avoids them).
        mode:
          rows.length === 1
            ? "markers"
            : appearance?.markerMode === "on"
              ? "lines+markers"
              : "lines",
        name: entry.label,
        x: rows.map((row) => row.period),
        y: rows.map(availableValue),
        connectgaps: false,
        line: { color },
        marker: { color, size: 6 },
        ...(numberFormat
          ? {
              // The Tooltip template control was removed (renderer plan C);
              // an old saved `labels.tooltip` is ignored.
              hovertemplate:
                `%{x}<br>${formattedValueToken("%{y}", numberFormat)}` +
                "<extra>%{fullData.name}</extra>",
            }
          : {}),
        meta: {
          comparisonId: entry.comparisonId,
          geographyId: entry.geographyId,
          seriesId: entry.id,
        },
      };
    }),
    layout: layoutFor(appearance, labels, {
      showlegend: series.length > 1,
      ...(numberFormat
        ? {
            yaxis: {
              hoverformat: numberFormat.d3,
              tickformat: numberFormat.d3,
              ...(numberFormat.prefix ? { tickprefix: numberFormat.prefix } : {}),
              ...(numberFormat.suffix ? { ticksuffix: numberFormat.suffix } : {}),
            },
          }
        : {}),
    }),
  };
}

function barFigure({ observations, comparisons, presentation, appearance, labels }) {
  // Shared with the visx bar model, so both renderers draw the same series.
  const series = barSeries(observations, comparisons, presentation);
  const colors = colorsForLineSeries(series, appearance);
  return {
    data: series.map((entry) => ({
        type: "bar",
        name: entry.label,
        x: entry.rows.map(categoryOf),
        y: entry.rows.map(availableValue),
        marker: { color: colors[entry.id] },
        meta: {
          comparisonId: entry.comparisonId,
          period: entry.period,
          seriesId: entry.id,
        },
      })),
    layout: layoutFor(appearance, labels, {
      barmode:
        (presentation?.stackMode || appearance?.stackMode) === "stacked"
          ? "stack"
          : "group",
      showlegend: series.length > 1,
    }),
  };
}

function rangeFigure({ observations, comparisons, appearance, labels }) {
  const groups = new Map();
  for (const row of observations) {
    const category = row.categoryLabel || row.geographyLabel || row.comparisonLabel;
    const key = `${row.comparisonId}|${row.categoryId || row.geographyId || category}`;
    if (!groups.has(key)) groups.set(key, { category, comparisonId: row.comparisonId, rows: [] });
    groups.get(key).rows.push(row);
  }
  const ranges = [...groups.values()].map((group) => ({
    ...group,
    rows: [...group.rows].sort((a, b) => Number(a.period) - Number(b.period)),
  }));
  const colors = colorsFor(comparisons, appearance);
  const connectorX = [];
  const connectorY = [];
  for (const range of ranges) {
    const first = range.rows[0];
    const last = range.rows.at(-1);
    connectorX.push(availableValue(first), availableValue(last), null);
    connectorY.push(range.category, range.category, null);
  }
  return {
    data: [
      {
        type: "scatter",
        mode: "lines",
        x: connectorX,
        y: connectorY,
        line: { color: "#AFAEAD", width: 3 },
        hoverinfo: "skip",
        showlegend: false,
      },
      ...ranges.map((range) => ({
        type: "scatter",
        mode: "markers",
        name:
          comparisons.find((entry) => entry.id === range.comparisonId)?.label ||
          range.rows[0]?.comparisonLabel,
        x: [availableValue(range.rows[0]), availableValue(range.rows.at(-1))],
        y: [range.category, range.category],
        marker: { color: colors[range.comparisonId], size: 10 },
        meta: { comparisonId: range.comparisonId },
        showlegend: false,
      })),
    ],
    layout: layoutFor(appearance, labels, { showlegend: false }),
  };
}

function mapFigure({ observations, comparisons, presentation, geometry, appearance, labels }) {
  const available = comparisons.filter(
    (comparison) => presentation?.comparisonVisibility?.[comparison.id] !== false,
  );
  const rows = activeRows(observations, presentation, available[0]?.id);
  const comparisonId = rows[0]?.comparisonId || available[0]?.id;
  return {
    data: [{
      type: "choropleth",
      geojson: geometry,
      featureidkey: "properties.GEOID",
      locations: rows.map((row) => row.geographyId),
      z: rows.map(availableValue),
      text: rows.map((row) => row.geographyLabel),
      colorscale: rampFor(appearance, { kind: appearance?.colorScale === "diverging" ? "diverging" : "sequential" }),
      meta: { comparisonId },
    }],
    layout: layoutFor(appearance, labels, {
      geo: { fitbounds: "locations", visible: false },
    }),
    tabs: {
      primary: { axis: presentation?.primaryTabAxis || "comparison" },
      secondary: { axis: "period", label: "Year" },
    },
  };
}

function symbolMapFigure({ observations, comparisons, presentation, geometry, appearance, labels }) {
  const available = comparisons.filter(
    (comparison) => presentation?.comparisonVisibility?.[comparison.id] !== false,
  );
  const rows = activeRows(observations, presentation, available[0]?.id);
  // v3 supplies both layers: representative points carry the data marks, and
  // the same GeoJSON used by Choropleth supplies geographic context beneath
  // them. Continue accepting a plain point map for saved/in-memory callers.
  const points = geometry?.points || geometry || {};
  const geojson = geometry?.geojson || null;
  const joined = rows
    .map((row) => ({ row, point: points[row.geographyId] }))
    .filter(({ point }) => Array.isArray(point) && point.length >= 2);
  const values = joined.map(({ row }) => availableValue(row));
  const finite = values.filter(Number.isFinite);
  const maximum = finite.length ? Math.max(...finite.map(Math.abs)) : 1;
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
        line: { color: "#AFAEAD", width: 0.75 },
        hoverinfo: "skip",
        showlegend: false,
        meta: { role: "geography-background" },
      }]
    : [];
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
      text: joined.map(({ row }) => row.geographyLabel),
      customdata: joined.map(({ row }) => row.value),
      marker: {
        color: values,
        colorscale: rampFor(appearance, {
          kind: appearance?.colorScale === "diverging" ? "diverging" : "sequential",
        }),
        size: values.map((value) =>
          Number.isFinite(value) ? Math.max(5, Math.sqrt(Math.abs(value) / maximum) * 34) : 0,
        ),
        sizemode: "diameter",
        showscale: true,
      },
      meta: { comparisonId: rows[0]?.comparisonId },
    }],
    layout: layoutFor(appearance, labels, {
      showlegend: false,
      geo: { fitbounds: "locations", visible: false },
    }),
    tabs: {
      primary: { axis: presentation?.primaryTabAxis || "comparison" },
      secondary: { axis: "period", label: "Year" },
    },
  };
}

function heatmapFigure({ observations, comparisons, presentation, appearance, labels }) {
  const available = comparisons.filter(
    (comparison) => presentation?.comparisonVisibility?.[comparison.id] !== false,
  );
  const rows = activeRows(observations, presentation, available[0]?.id);
  const x = [...new Set(rows.map((row) => row.period))];
  const y = [...new Set(rows.map((row) => row.categoryLabel))];
  return {
    data: [{
      type: "heatmap",
      x,
      y,
      z: y.map((category) => x.map((period) => availableValue(
        rows.find((row) => row.categoryLabel === category && row.period === period) || {},
      ))),
      colorscale: rampFor(appearance, { kind: appearance?.colorScale === "diverging" ? "diverging" : "sequential" }),
      meta: { comparisonId: rows[0]?.comparisonId },
    }],
    layout: layoutFor(appearance, labels),
  };
}

function pieFigure({ observations, comparisons, presentation, appearance, labels }) {
  const visibleComparisonIds = new Set(
    comparisons
      .filter((comparison) => presentation?.comparisonVisibility?.[comparison.id] !== false)
      .map((comparison) => comparison.id),
  );
  const activeComparison = visibleComparisonIds.has(presentation?.activeTab)
    ? presentation.activeTab
    : [...visibleComparisonIds][0];
  const comparisonRows = presentation?.comparisonPresentation === "tabs"
    ? observations.filter(
        (row) => row.comparisonId === (activeComparison || observations[0]?.comparisonId),
      )
    : observations.filter((row) => visibleComparisonIds.has(row.comparisonId));
  const periods = [...new Set(comparisonRows.map((row) => row.period))];
  const activePeriod = presentation?.activePeriod ?? periods.at(-1);
  const derived = comparisonRows.some(
    (row) => row.calculation?.id === "averageSelectedYears",
  );
  const rows = derived
    ? comparisonRows
    : comparisonRows.filter((row) => row.period === activePeriod);
  const slices = rows.map((row, index) => ({
    id:
      row.categoryId == null
        ? row.comparisonId
        : `${row.comparisonId}:${row.categoryId}`,
    label: row.categoryLabel || row.comparisonLabel || `Slice ${index + 1}`,
    color:
      row.categoryId == null
        ? comparisons.find((comparison) => comparison.id === row.comparisonId)?.color
        : null,
  }));
  const colors = colorsFor(slices, appearance);
  const included = rows[0]?.includedPeriods || [];
  const yearText = included.length > 2
    ? `${included.slice(0, -1).join(", ")}, and ${included.at(-1)}`
    : included.join(" and ");
  return {
    data: [{
      type: "pie",
      labels: rows.map((row) => row.categoryLabel || row.comparisonLabel),
      values: rows.map(availableValue),
      hole: presentation?.hole ?? presentation?.appearance?.hole ?? 0,
      marker: { colors: slices.map((slice) => colors[slice.id]) },
    }],
    layout: layoutFor(appearance, labels, {
      annotations: derived ? [{ text: `Average of ${yearText}.` }] : [],
    }),
    tabs: { primary: { axis: "period" } },
  };
}

function forestFigure({ observations, appearance, labels }) {
  const categories = [...new Set(observations.map((row) => row.categoryLabel))];
  const estimates = categories.map((category) =>
    observations.find((row) => row.categoryLabel === category && row.measureRole === "estimate"),
  );
  return {
    data: [{
      type: "scatter",
      mode: "markers",
      x: estimates.map((row) => row?.value ?? null),
      y: categories,
      error_x: {
        type: "data",
        array: categories.map((category, index) => {
          const upper = observations.find((row) => row.categoryLabel === category && row.measureRole === "upperBound");
          return Number.isFinite(upper?.value) && Number.isFinite(estimates[index]?.value)
            ? upper.value - estimates[index].value
            : null;
        }),
        arrayminus: categories.map((category, index) => {
          const lower = observations.find((row) => row.categoryLabel === category && row.measureRole === "lowerBound");
          return Number.isFinite(lower?.value) && Number.isFinite(estimates[index]?.value)
            ? estimates[index].value - lower.value
            : null;
        }),
      },
    }],
    layout: layoutFor(appearance, labels, {
      xaxis: { title: { text: observations[0]?.unit || "Value" } },
    }),
  };
}

function dotPlotFigure({ observations, comparisons, presentation, appearance, labels }) {
  const visible = visibleComparisons(comparisons, presentation);
  const colors = colorsFor(comparisons, appearance);
  return {
    data: visible.map((comparison) => {
      const rows = observations.filter((row) => row.comparisonId === comparison.id);
      return {
        type: "scatter",
        mode: "markers",
        name: rows[0]?.comparisonLabel || comparison.label,
        x: rows.map(availableValue),
        y: rows.map(categoryOf),
        marker: { color: colors[comparison.id], size: appearance?.markerSize || 9 },
        meta: { comparisonId: comparison.id },
      };
    }),
    layout: layoutFor(appearance, labels, { showlegend: visible.length > 1 }),
  };
}

function pointFigure({
  observations,
  comparisons,
  presentation,
  appearance,
  labels,
  bubble = false,
}) {
  const visible = visibleComparisons(comparisons, presentation);
  const colors = colorsFor(comparisons, appearance);
  return {
    data: visible.map((comparison) => {
      const rows = observations.filter((row) => row.comparisonId === comparison.id);
      const sizes = rows.map((row) => row.sizeValue ?? row.size ?? null);
      return {
        type: "scatter",
        mode: "markers",
        name: rows[0]?.comparisonLabel || comparison.label,
        x: rows.map((row) => row.xValue ?? row.x ?? row.period),
        y: rows.map((row) => row.yValue ?? row.y ?? availableValue(row)),
        text: rows.map(categoryOf),
        marker: {
          color: colors[comparison.id],
          ...(bubble
            ? {
                size: sizes.map((value) =>
                  Number.isFinite(value) && value >= 0 ? value : null,
                ),
                sizemode: "area",
              }
            : {}),
        },
        meta: { comparisonId: comparison.id },
      };
    }),
    layout: layoutFor(appearance, labels, { showlegend: visible.length > 1 }),
  };
}

export function adaptObservations(input) {
  const chartType = ADAPTER_IDS[input.chartType];
  let result;
  if (chartType === "line") result = lineFigure(input);
  else if (chartType === "bar") result = barFigure(input);
  else if (chartType === "choroplethMap") result = mapFigure(input);
  else if (chartType === "symbolMap") result = symbolMapFigure(input);
  else if (chartType === "heatmap") result = heatmapFigure(input);
  else if (chartType === "dotPlot") result = dotPlotFigure(input);
  else if (chartType === "pie") result = pieFigure(input);
  else if (chartType === "dumbbell") result = rangeFigure(input);
  else if (chartType === "forest") result = forestFigure(input);
  else if (chartType === "scatter") result = pointFigure(input);
  else if (chartType === "bubble") result = pointFigure({ ...input, bubble: true });
  if (chartType === "dataTable") {
    return {
      table: displayTableFromObservations({
        observations: input.observations,
        presentation: input.presentation,
      }),
      observations: input.observations,
    };
  }
  if (!result) throw new Error(`No observation adapter is registered for ${input.chartType}.`);
  return withLinePaddingMeta(result, chartType, input.appearance);
}

export { ADAPTER_IDS };
