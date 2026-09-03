import { PALETTES, assignComparisonColors, rampFor, seriesColor } from "../palettes";
import { getChartType } from "../chartRegistry";
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

function visibleComparisons(comparisons, presentation) {
  const visibility = presentation?.comparisonVisibility || {};
  const visible = comparisons.filter((comparison) => visibility[comparison.id] !== false);
  if (presentation?.comparisonPresentation !== "tabs") return visible;
  const activeId = visible.some((comparison) => comparison.id === presentation.activeTab)
    ? presentation.activeTab
    : visible[0]?.id;
  return visible.filter((comparison) => comparison.id === activeId);
}

function geographyKey(row) {
  return String(row.geographyId ?? row.geographyLabel ?? "");
}

/**
 * A demographic comparison and a place are independent dimensions. A Line
 * trace represents one combination of the two; folding every place carrying
 * the same comparison id into one trace makes Plotly connect Bay Area to
 * Central Coast at every year.
 */
function lineSeries(observations, comparisons, presentation) {
  const visible = visibleComparisons(comparisons, presentation);
  const series = [];

  for (const comparison of visible) {
    const groups = new Map();
    for (const row of observations) {
      if (row.comparisonId !== comparison.id) continue;
      const key = geographyKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const [geographyId, rows] of groups) {
      const ordered = [...rows].sort((left, right) =>
        String(left.period).localeCompare(String(right.period), undefined, {
          numeric: true,
        }),
      );
      series.push({
        id: `${comparison.id}::${geographyId}`,
        comparison,
        comparisonId: comparison.id,
        geographyId,
        geographyLabel: ordered[0]?.geographyLabel || geographyId,
        comparisonLabel:
          ordered[0]?.comparisonLabel || comparison.label || comparison.id,
        rows: ordered,
      });
    }
  }

  const comparisonCount = new Set(series.map((entry) => entry.comparisonId)).size;
  const geographyCount = new Set(series.map((entry) => entry.geographyId)).size;
  return series.map((entry) => ({
    ...entry,
    label:
      geographyCount > 1 &&
      (comparisonCount > 1 || Object.keys(entry.comparison.dimensions || {}).length > 0)
        ? `${entry.geographyLabel} ${entry.comparisonLabel}`.trim()
        : geographyCount > 1
          ? entry.geographyLabel
          : entry.comparisonLabel,
  }));
}

function colorsForLineSeries(series, appearance = {}) {
  const counts = series.reduce(
    (map, entry) => map.set(entry.comparisonId, (map.get(entry.comparisonId) || 0) + 1),
    new Map(),
  );
  const entries = series.map((entry) => ({
    id: entry.id,
    label: entry.label,
    // An explicitly selected comparison color remains meaningful across its
    // locations. Automatic comparison colors do not: each geographic series
    // needs a distinguishable automatic color of its own.
    color: entry.comparison.color || null,
  }));
  const existing = Object.fromEntries(
    series.flatMap((entry) => {
      const direct = appearance.comparisonColors?.[entry.id];
      const comparisonColor =
        counts.get(entry.comparisonId) === 1
          ? appearance.comparisonColors?.[entry.comparisonId]
          : null;
      const color = direct || comparisonColor;
      return color ? [[entry.id, color]] : [];
    }),
  );
  const overrides = Object.fromEntries(
    entries.filter((entry) => entry.color).map((entry) => [entry.id, entry.color]),
  );
  const assigned = assignComparisonColors(entries, { existing, overrides });
  const paletteSelected = PALETTES[appearance.palette]?.kind === "categorical";
  return Object.fromEntries(
    entries.map((entry, index) => [
      entry.id,
      entry.color || !paletteSelected
        ? assigned[entry.id]
        : seriesColor(appearance, entry.label, index),
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
  return {
    data: series.map((entry) => {
      const { rows } = entry;
      const color = colors[entry.id];
      return {
        type: "scatter",
        // Change calculations intentionally return one derived observation per
        // geography. A one-point trace in `lines` mode is invisible.
        mode:
          rows.length === 1
            ? "markers"
            : appearance?.markerMode === "off"
              ? "lines"
              : "lines+markers",
        name: entry.label,
        x: rows.map((row) => row.period),
        y: rows.map(availableValue),
        connectgaps: false,
        line: { color },
        marker: { color, size: 6 },
        meta: {
          comparisonId: entry.comparisonId,
          geographyId: entry.geographyId,
          seriesId: entry.id,
        },
      };
    }),
    layout: layoutFor(appearance, labels, { showlegend: series.length > 1 }),
  };
}

function barFigure({ observations, comparisons, presentation, appearance, labels }) {
  const availableComparisons = (comparisons.length
    ? comparisons
    : [{ id: observations[0]?.comparisonId, label: observations[0]?.comparisonLabel }]
  ).filter((comparison) =>
    observations.some((row) => row.comparisonId === comparison.id),
  );
  const visible = visibleComparisons(availableComparisons, presentation);
  const periodCount = new Set(
    observations
      .filter((row) => visible.some((comparison) => comparison.id === row.comparisonId))
      .map((row) => row.period),
  ).size;
  const series = visible.flatMap((comparison) => {
    const periodGroups = new Map();
    for (const row of observations) {
      if (row.comparisonId !== comparison.id) continue;
      if (!periodGroups.has(row.period)) periodGroups.set(row.period, []);
      periodGroups.get(row.period).push(row);
    }
    return [...periodGroups.entries()]
      .sort(([left], [right]) =>
        String(left).localeCompare(String(right), undefined, { numeric: true }),
      )
      .map(([period, rows]) => {
        const comparisonLabel =
          comparison.customLabel || comparison.label || comparison.id;
        const label =
          periodCount > 1
            ? visible.length > 1
              ? `${comparisonLabel} · ${period}`
              : String(period)
            : rows[0]?.comparisonLabel || comparisonLabel;
        return {
          id: `${comparison.id}::${period}`,
          comparison: {
            ...comparison,
            // One explicit comparison colour cannot distinguish several year
            // traces. Multi-year bars therefore use the rendered-series
            // palette, while a one-year bar retains the comparison override.
            color: periodCount > 1 ? null : comparison.color,
          },
          comparisonId: comparison.id,
          period,
          label,
          rows,
        };
      });
  });
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
