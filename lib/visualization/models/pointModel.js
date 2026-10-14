/**
 * pointModel.js — the chart model for the visx scatter and bubble charts.
 *
 * Client-safe. Module and pasted observations use one row per measure;
 * pairOutcomes assembles each point's horizontal, vertical, and size values.
 *
 * Honest charts: a point missing either axis value (or, on a bubble, its size)
 * is left out rather than drawn at zero; a genuine zero stays. Bubbles are
 * always sized by area, so a value four times larger has twice the radius;
 * the unused `sizeByArea` setting is ignored.
 *
 * Follows the owner's reference scatter (2026-10-05): points colored by
 * comparison (one comparison is all PPIC orange), each named beside it, light
 * grid lines both ways. Axes: the vertical axis starts at zero, as the guide
 * asks, and the horizontal axis fits the data; `fitAxes` fits both, as the
 * reference does. Either axis gets a darker zero line when it crosses zero.
 *
 * Shared settings come from `sharedSettings`, including both number types and
 * tick increments; this file reads only Point labels (`pointLabels`:
 * automatic or off) and Fit both axes (`fitAxes`).
 *
 * Exports:
 *   POINT_LABEL_MODES — "automatic" | "off"
 *   buildPointModel(input) — {
 *     chartType, labels, typography, key, frame, summary,
 *     bubble, pointLabels,
 *     emptyMessage,                            — why nothing is drawn, or null
 *     xAxis: { domain, ticks, tickText, zero, clip }, yAxis: { ...same },
 *     series: [{ id, label, color }],
 *     points: [{ key, seriesId, name, x, y, size, radius, color,
 *                xText, yText, sizeText }]    — in data order
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

import { pairOutcomes } from "@/lib/visualization/pairOutcomes";
import { axisScale } from "@/lib/visualization/chartLayout/axisScale";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { formatTableNumber } from "@/lib/visualization/formatters";
import { visibleComparisons } from "@/lib/visualization/lineSeries";
import { sharedSettings } from "@/lib/visualization/models/sharedSettings";
import { comparisonColors } from "@/lib/visualization/palettes";

export const POINT_LABEL_MODES = Object.freeze(["automatic", "off"]);

const { point: pointStyle } = CHART_STYLE;

// ── Helpers ──────────────────────────────────────────────────────────

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function xOf(row) { return row.x?.status === "available" ? finite(row.x.value) : null; }
function yOf(row) { return row.y?.status === "available" ? finite(row.y.value) : null; }
function sizeOf(row) {
  const value = row.size?.status === "available" ? finite(row.size.value) : null;
  return value !== null && value >= 0 ? value : null;
}

function pointName(row) {
  return row.categoryLabel || row.geographyLabel || row.comparisonLabel || "";
}

/** Comparisons that are shown, in their own order. */
function shownComparisons(observations, comparisons, presentation) {
  const known = comparisons.length
    ? comparisons
    : [{ id: observations[0]?.comparisonId, label: observations[0]?.comparisonLabel }];
  return visibleComparisons(known, presentation);
}

function axisFor(values, settings, includeZero, calculation) {
  const scale = axisScale({
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    calculation,
    increment: settings.increment,
    includeZero,
    fixed: settings.range,
  });
  const text = (value) => (settings.numberType ? settings.format(value) : formatTableNumber(value));
  return {
    axis: {
      domain: scale.domain,
      // The reader's range may cut through the data; the renderer clips to it.
      clip: scale.fixed,
      ticks: scale.ticks,
      tickText: scale.ticks.map(text),
      // A darker line marks zero when the axis crosses it (not at its edge).
      zero: scale.domain[0] < 0 && scale.domain[1] > 0,
    },
    text,
  };
}

function summaryText({ chartType, xTitle, yTitle, count }) {
  const kind = chartType === "bubble" ? "Bubble chart" : "Scatter plot";
  const axes = yTitle && xTitle ? ` of ${yTitle} against ${xTitle}` : "";
  return `${kind}${axes}, ${count} ${count === 1 ? "point" : "points"}.`;
}

// ── Model ────────────────────────────────────────────────────────────

export function buildPointModel(input) {
  const { observations = [], comparisons = [], presentation = {}, appearance = {} } = input;
  const chartType = input.chartType === "bubble" ? "bubble" : "scatter";
  const bubble = chartType === "bubble";
  const shared = sharedSettings({ ...input, chartType });

  // ── Series: one per shown comparison, colored as the Plotly chart colors it ──
  const shown = shownComparisons(observations, comparisons, presentation);
  const colors = comparisonColors(comparisons.length ? comparisons : shown, appearance);
  const series = shown.map((comparison) => ({
    id: comparison.id,
    label: comparison.label || observations.find((row) => row.comparisonId === comparison.id)?.comparisonLabel || comparison.id,
    color: colors[comparison.id],
  }));
  const colorOf = new Map(series.map((entry) => [entry.id, entry.color]));

  // ── Points: every shown row with both values (and a size, on a bubble) ──
  const paired = pairOutcomes(observations);
  const placed = paired
    .map((row, index) => ({ row, index, x: xOf(row), y: yOf(row), size: bubble ? sizeOf(row) : null }))
    .filter(({ row, x, y, size }) =>
      colorOf.has(row.comparisonId) && x !== null && y !== null && (!bubble || size !== null),
    );

  // ── Axes: vertical from zero unless fitted; horizontal always fits ──
  const calculation = observations.find((row) => row.calculation?.id)?.calculation.id ?? null;
  const fitAxes = appearance.fitAxes === true;
  const x = axisFor(placed.map((point) => point.x), shared.axes.x, false, null);
  const y = axisFor(placed.map((point) => point.y), shared.axes.y, !fitAxes, calculation);

  // ── Bubble area: the largest size gets the largest radius ──
  const largest = bubble ? Math.max(0, ...placed.map((point) => point.size)) : 0;
  const radiusOf = (size) => {
    if (!bubble) return pointStyle.radius;
    if (!(largest > 0)) return pointStyle.bubble.minRadius;
    return Math.max(pointStyle.bubble.minRadius, pointStyle.bubble.maxRadius * Math.sqrt(size / largest));
  };

  const points = placed.map(({ row, index, x: across, y: down, size }) => ({
    key: `${row.comparisonId}|${row.categoryId ?? row.geographyId ?? row.categoryLabel ?? ""}|${row.period ?? ""}|${index}`,
    seriesId: row.comparisonId,
    name: pointName(row),
    x: across,
    y: down,
    size,
    radius: radiusOf(size),
    color: colorOf.get(row.comparisonId),
    xText: x.text(across),
    yText: y.text(down),
    sizeText: size === null ? null : formatTableNumber(size),
  }));

  // ── The key names the comparisons; one comparison needs none. ──
  const drawnSeries = series.filter((entry) => points.some((point) => point.seriesId === entry.id));
  const keyEntries = drawnSeries.length > 1
    ? drawnSeries.map((entry) => ({ id: entry.id, label: entry.label, color: entry.color, kind: "dot" }))
    : [];
  // Rows with no second measure (a module's one outcome) have nothing to
  // place across; say so rather than drawing an empty plane.
  const emptyMessage = points.length
    ? null
    : observations.length && !paired.some((row) => xOf(row) !== null)
      ? "A scatter plot needs a second measure for its horizontal axis."
      : "There are no values to draw for these selections.";
  const pointLabels = POINT_LABEL_MODES.includes(appearance.pointLabels) ? appearance.pointLabels : "automatic";

  return {
    chartType,
    labels: shared.labels,
    typography: shared.typography,
    key: { position: shared.key.position === "automatic" ? "top" : shared.key.position, entries: keyEntries, title: null },
    frame: shared.frame,
    grid: shared.grid,
    summary: summaryText({ chartType, xTitle: shared.labels.xAxis, yTitle: shared.labels.yAxis, count: points.length }),
    bubble,
    pointLabels,
    emptyMessage,
    xAxis: x.axis,
    yAxis: y.axis,
    series,
    points,
  };
}
