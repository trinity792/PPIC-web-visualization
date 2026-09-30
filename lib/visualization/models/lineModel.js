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
 *     markers, lineSpacing, xAxis: { increment }, yAxis: { domain, ticks, tickText },
 *     series: [{ id, comparisonId, geographyId, label, color,
 *                points: [{ period, value, status, valueKind, text }] }]
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

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

/** The response's ordered periods, or the periods the rows carry. */
function orderedPeriods(periods, series) {
  if (Array.isArray(periods) && periods.length) return periods;
  const seen = new Set(series.flatMap((entry) => entry.rows.map((row) => row.period)));
  return [...seen].sort(byPeriod);
}

function pointsFor(rows, periods) {
  const rowsByPeriod = new Map(rows.map((row) => [String(row.period), row]));
  return periods.map((period) => {
    const row = rowsByPeriod.get(String(period));
    const available = row?.status === "available" && Number.isFinite(row.value);
    const status = row?.status || "missing";
    return {
      period,
      value: available ? row.value : null,
      status,
      valueKind: row?.valueKind ?? null,
      text: available ? formatTableNumber(row.value) : unavailableValueText(status),
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
  const periods = orderedPeriods(input.periods, found);

  const series = orderByLocation(found, appearance.categoryOrder).map((entry) => ({
    id: entry.id,
    comparisonId: entry.comparisonId,
    geographyId: entry.geographyId,
    label: entry.label,
    color: colors[entry.id],
    points: pointsFor(entry.rows, periods),
  }));

  const values = series.flatMap((entry) => entry.points.map((point) => point.value)).filter(Number.isFinite);
  const calculation = observations.find((row) => row.calculation?.id)?.calculation.id ?? null;
  const scale = axisScale({
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    calculation,
    increment: shared.axes.y.increment,
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
    summary: summaryText({ measure, series, periods }),
    periods,
    dashedRange,
    markers: appearance.markerMode === "on",
    // Extra px between neighbouring value gridlines (horizontal) and between
    // neighbouring periods (vertical).
    lineSpacing: {
      horizontal: linePadding(appearance.horizontalLinePadding),
      vertical: linePadding(appearance.verticalLinePadding),
    },
    xAxis: { increment: shared.axes.x.increment },
    yAxis: { domain: scale.domain, ticks: scale.ticks, tickText },
    series,
  };
}
