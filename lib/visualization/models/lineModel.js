/**
 * lineModel.js — the chart model for the visx line chart.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Turns observations into a plain description of what to draw. Series come
 * from the same `lineSeries` and `colorsForLineSeries` the Plotly line adapter
 * uses, so every series keeps its order, id, name, and color when the renderer
 * changes. Missing and suppressed values stay as gaps (value null), never zero.
 *
 * Shared settings come from `sharedSettings`; this file reads only the line
 * chart's own settings: Markers (`markerMode`), the dragged location order
 * (`categoryOrder`), the dashed range (`dashedRange`), and the two line
 * spacings (`horizontalLinePadding`, `verticalLinePadding`).
 *
 * Exports:
 *   buildLineModel(input) — {
 *     chartType, labels, typography, key, frame, summary, periods, dashedRange,
 *     markers, lineSpacing, xAxis: { increment }, yAxis: { domain, ticks, tickText, clip },
 *     series: [{ id, comparisonId, geographyId, label, color,
 *                points: [{ period, value, status, valueKind, text }] }]
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

import { parseDateToken } from "@/lib/tabular/columnTypes";
import { axisScale } from "@/lib/visualization/chartLayout/axisScale";
import { validDashedRange } from "@/lib/visualization/chartLayout/dashedRange";
import { formatTableNumber, unavailableValueText } from "@/lib/visualization/formatters";
import { colorsForLineSeries, lineSeries } from "@/lib/visualization/lineSeries";
import { sharedSettings } from "@/lib/visualization/models/sharedSettings";
import { COLORS } from "@/lib/constants";

const MAX_LINE_PADDING = 100;

// ── Helpers ──────────────────────────────────────────────────────────

function byPeriod(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GRANULARITY_ORDER = ["year", "span", "quarter", "month", "day"];

/** Each period's decimal-year position, from the rows that carry one. */
function periodPositions(series) {
  const positions = new Map();
  for (const row of series.flatMap((entry) => entry.rows)) {
    const key = String(row.period);
    if (!positions.has(key) && Number.isFinite(row.periodPosition)) positions.set(key, row.periodPosition);
  }
  return positions;
}

/** The response's ordered periods, or the periods the rows carry, in time order. */
function orderedPeriods(periods, series, positions) {
  if (Array.isArray(periods) && periods.length) return periods;
  const seen = new Set(series.flatMap((entry) => entry.rows.map((row) => row.period)));
  return [...seen].sort((left, right) => {
    const a = positions.get(String(left));
    const b = positions.get(String(right));
    return Number.isFinite(a) && Number.isFinite(b) && a !== b ? a - b : byPeriod(left, right);
  });
}

/**
 * A period as the hover label reads it: "2014-12" as "Dec 2014", "2020 Q1"
 * as "Q1 2020", "2020-07-04" as "Jul 4, 2020". Years, school years, and slash
 * dates (whose day/month order only their column knows) read as written.
 */
function periodText(period) {
  if (typeof period === "number" || String(period).includes("/")) return String(period);
  const token = parseDateToken(period);
  if (!token) return String(period);
  if (token.kind === "yearMonth") return `${MONTH_LABELS[token.month - 1]} ${token.year}`;
  if (token.kind === "quarter") return `Q${token.quarter} ${token.year}`;
  if (token.kind === "iso") return `${MONTH_LABELS[token.month - 1]} ${token.day}, ${token.year}`;
  return String(period);
}

/** The finest calendar unit among the periods, for the time axis's ticks. */
function periodGranularity(periods) {
  return periods.reduce((finest, period) => {
    const granularity = parseDateToken(period)?.granularity || "year";
    return GRANULARITY_ORDER.indexOf(granularity) > GRANULARITY_ORDER.indexOf(finest) ? granularity : finest;
  }, "year");
}

function pointsFor(rows, periods, positions, valueText = formatTableNumber) {
  const rowsByPeriod = new Map(rows.map((row) => [String(row.period), row]));
  return periods.map((period) => {
    const row = rowsByPeriod.get(String(period));
    const available = row?.status === "available" && Number.isFinite(row.value);
    const status = row?.status || "missing";
    const periodPosition = positions.get(String(period));
    return {
      period,
      ...(Number.isFinite(periodPosition) ? { periodPosition } : {}),
      periodText: periodText(period),
      value: available ? row.value : null,
      status,
      valueKind: row?.valueKind ?? null,
      text: available ? valueText(row.value) : unavailableValueText(status),
    };
  });
}

/**
 * Orders series by the dragged location order, keeping comparisons in their
 * own order. Colors are assigned before this runs, so reordering never
 * recolors a line.
 */
function orderByLocation(series, categoryOrder) {
  if (!Array.isArray(categoryOrder) || !categoryOrder.length) return series;
  const rank = (entry) => {
    const index = categoryOrder.findIndex(
      (name) => name === entry.geographyLabel || name === entry.geographyId,
    );
    return index < 0 ? categoryOrder.length : index;
  };
  const comparisonOrder = [...new Set(series.map((entry) => entry.comparisonId))];
  return [...series].sort(
    (left, right) =>
      comparisonOrder.indexOf(left.comparisonId) - comparisonOrder.indexOf(right.comparisonId) ||
      rank(left) - rank(right),
  );
}

function linePadding(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.min(MAX_LINE_PADDING, Math.round(value)) : 0;
}

function summaryText({ measure, series, periods }) {
  const names = series.map((entry) => entry.label);
  const who = names.length > 2
    ? `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`
    : names.join(" and ");
  const span = periods.length > 1 ? `, ${periods[0]} to ${periods.at(-1)}` : periods.length ? `, ${periods[0]}` : "";
  return `Line chart of ${measure} for ${who || "no series"}${span}.`;
}

// ── Model ────────────────────────────────────────────────────────────

export function buildLineModel(input) {
  const { observations = [], comparisons = [], presentation = {}, appearance = {} } = input;
  const shared = sharedSettings({ ...input, chartType: "line" });
  const found = lineSeries(observations, comparisons, presentation);
  const colors = colorsForLineSeries(found, appearance);
  const positions = periodPositions(found);
  const periods = orderedPeriods(input.periods, found, positions);
  const datedPositions = periods.map((period) => positions.get(String(period)));
  const dated = periods.length > 0 && datedPositions.every(Number.isFinite);

  // Hover text reads like the value axis: a percent column says "40%".
  const valueText = (value) =>
    shared.axes.y.numberType ? shared.axes.y.format(value) : formatTableNumber(value);
  const series = orderByLocation(found, appearance.categoryOrder).map((entry) => ({
    id: entry.id,
    comparisonId: entry.comparisonId,
    geographyId: entry.geographyId,
    label: entry.label,
    color: colors[entry.id],
    points: pointsFor(entry.rows, periods, positions, valueText),
  }));

  const values = series.flatMap((entry) => entry.points.map((point) => point.value)).filter(Number.isFinite);
  const calculation = observations.find((row) => row.calculation?.id)?.calculation.id ?? null;
  const scale = axisScale({
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    calculation,
    increment: shared.axes.y.increment,
    fixed: shared.axes.y.range,
  });
  // With no number type, ticks read like the View Data table ("60,000").
  const tickText = scale.ticks.map((tick) =>
    shared.axes.y.numberType ? shared.axes.y.format(tick) : formatTableNumber(tick),
  );

  const dashed = validDashedRange(periods, appearance.dashedRange);
  const dashedRange = dashed ? { from: dashed.from, to: dashed.to, label: dashed.label || "Projected" } : null;
  const keyEntries = [
    ...series.map((entry) => ({ id: entry.id, label: entry.label, color: entry.color, kind: "line" })),
    ...(dashedRange
      ? [{ id: "dashed-range", label: dashedRange.label, color: COLORS.chartAxis, kind: "line", dashed: true }]
      : []),
  ];
  const measure = observations[0]?.measureLabel || observations[0]?.measureId || "values";

  return {
    chartType: "line",
    labels: shared.labels,
    typography: shared.typography,
    key: { position: shared.key.position, entries: keyEntries, title: null },
    frame: shared.frame,
    grid: shared.grid,
    summary: summaryText({ measure, series, periods }),
    periods,
    // Dated periods place the time axis by position (dataset-range plan,
    // workstream 2); plain years keep the numeric axis.
    ...(dated ? { periodPositions: datedPositions, periodGranularity: periodGranularity(periods) } : {}),
    dashedRange,
    markers: appearance.markerMode === "on",
    // Extra px between neighbouring value gridlines (horizontal) and between
    // neighbouring periods (vertical).
    lineSpacing: {
      horizontal: linePadding(appearance.horizontalLinePadding),
      vertical: linePadding(appearance.verticalLinePadding),
    },
    xAxis: { increment: shared.axes.x.increment },
    yAxis: { domain: scale.domain, ticks: scale.ticks, tickText, clip: scale.fixed },
    series,
  };
}
