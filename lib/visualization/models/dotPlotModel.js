/**
 * dotPlotModel.js — the chart model for the visx dot plot.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Turns observations into a plain description of what to draw: rows of
 * categories, each with several colored dots on one shared value axis and a
 * light band from the row's lowest dot to its highest, as PPIC's published
 * business-regulation plots draw them (mockups/range chart reference/,
 * renderer plan G). The dot plot is a variant of the Scatter picker tile
 * (owner, 2026-10-05), but its data is the range family's: rows of
 * categories on one measure.
 *
 * What the dots are, and what the rows are:
 *   - Several comparisons: one dot per comparison, colored as the Plotly dot
 *     plot colors them (`comparisonColors`). With one period the rows are the
 *     categories; with several, each row is a period, and several categories
 *     become groups with a bold header row, as the range chart groups them.
 *   - One comparison and several periods: one dot per period, rows are the
 *     categories. Periods take Navy then Orange, as the range chart's two
 *     ends do, then the official colors without light Gray, or a chosen
 *     categorical palette.
 *   Rows keep data order, unless the reader dragged the locations into an
 *   order (`categoryOrder`); then categories follow it.
 *
 * Missing and suppressed values draw no dot (a gap, never zero): the row
 * keeps its place, label, and the value's "Not available" text for hover and
 * screen readers, and `points` lists only the dots that are drawn.
 *
 * Shared settings come from `sharedSettings`; this file reads only the dot
 * plot's own: the dragged location order (`categoryOrder`), row label
 * alignment (`groupLabelAlignment`, `variableLabelAlignment`, left by
 * default), Hide X-Axis (`hideXAxis`, or an older view's `showValueAxis:
 * false`), Show point values (`showPointLabels`), which series' values to
 * show (`pointLabelSeries`: { seriesName: false } leaves one out), and the
 * dot diameter (`markerSize`, the standard size when unset). The row label
 * indents were hidden by the owner and are never read.
 *
 * Exports:
 *   buildDotPlotModel(input) — {
 *     chartType, labels, typography, key, frame, summary, fitContent,
 *     dotsBy,                                   — "comparison" | "period"
 *     rowLabels: { groupAlignment, variableAlignment },
 *     pointLabels: { show },
 *     radius,                                   — every dot's radius in px
 *     valueAxis: { visible, domain, ticks, tickText, zero },
 *     series: [{ id, label, color }],
 *     groups: [{ label, start, end }],          — row index ranges, first to last
 *     rows: [{ key, label, group, category, band: { from, to } | null,
 *              values: [{ seriesId, value, text }] }],  — every series, missing included
 *     points: [{ key, row, rowKey, seriesId, comparisonId, period, value,
 *                text, label, color, radius }]       — drawn dots only, row by row
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

import { axisScale } from "@/lib/visualization/chartLayout/axisScale";
import { ROW_LABEL_ALIGNMENTS } from "@/lib/visualization/chartLayout/rowLabels";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { formatTableNumber, unavailableValueText } from "@/lib/visualization/formatters";
import { visibleComparisons } from "@/lib/visualization/lineSeries";
import { sharedSettings } from "@/lib/visualization/models/sharedSettings";
import { PALETTES, comparisonColors, officialComparisonColor, seriesColor } from "@/lib/visualization/palettes";

const { dot: dotStyle } = CHART_STYLE;

// ── Helpers ──────────────────────────────────────────────────────────

function byPeriod(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function categoryKey(row) {
  return String(row.categoryId ?? row.geographyId ?? row.categoryLabel ?? row.geographyLabel ?? "");
}

function categoryLabel(row) {
  return row.categoryLabel || row.geographyLabel || row.comparisonLabel || categoryKey(row);
}

/** Categories in the dragged order; the ones it does not name keep data order after it. */
function orderCategories(categories, categoryOrder) {
  if (!Array.isArray(categoryOrder) || !categoryOrder.length) return categories;
  const rank = (category) => {
    const index = categoryOrder.findIndex((name) => name === category.label || name === category.key);
    return index < 0 ? categoryOrder.length : index;
  };
  return categories
    .map((category, index) => ({ category, index }))
    .sort((a, b) => rank(a.category) - rank(b.category) || a.index - b.index)
    .map(({ category }) => category);
}

function alignment(value) {
  return ROW_LABEL_ALIGNMENTS.includes(value) ? value : "left";
}

/** Hide X-Axis: the saved setting, else the name views used before it. */
function valueAxisHidden(appearance) {
  if (typeof appearance.hideXAxis === "boolean") return appearance.hideXAxis;
  return appearance.showValueAxis === false;
}

/** The dot diameter: the saved size within the slider's limits, else the standard one. */
function markerDiameter(raw) {
  const value = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(value)) {
    return dotStyle.markerSize;
  }
  return Math.min(dotStyle.maxMarkerSize, Math.max(dotStyle.minMarkerSize, value));
}

/** Comparisons that are shown and have rows, in their own order. */
function shownComparisons(observations, comparisons, presentation) {
  const known = comparisons.length
    ? comparisons
    : [{ id: observations[0]?.comparisonId, label: observations[0]?.comparisonLabel }];
  return visibleComparisons(known, presentation).filter((comparison) =>
    observations.some((row) => row.comparisonId === comparison.id),
  );
}

/** Periods the shown rows carry, in the response's order when it gives one. */
function shownPeriods(periods, observations) {
  const present = new Set(observations.map((row) => String(row.period)));
  if (Array.isArray(periods) && periods.length) {
    return periods.filter((period) => present.has(String(period)));
  }
  return [...new Set(observations.map((row) => row.period))].sort(byPeriod);
}

// Periods start Navy then Orange, as the range chart's two ends do, then
// follow the official scheme without its light Gray, which would vanish into
// the band behind the dots.
const PERIOD_COLOR_NAMES = Object.freeze(["Navy", "Orange", "Lime", "Blue", "Violet", "Seafoam", "Red", "Green", "Dark Gray"]);

/** Period colors: a chosen categorical palette, else the period sequence above. */
function periodColors(appearance, labels) {
  if (PALETTES[appearance.palette]?.kind === "categorical") {
    return labels.map((label, index) => seriesColor(appearance, label, index));
  }
  return labels.map((_, index) => officialComparisonColor(PERIOD_COLOR_NAMES[index % PERIOD_COLOR_NAMES.length]));
}

function isAvailable(row) {
  return row?.status === "available" && Number.isFinite(row.value);
}

function summaryText({ measure, series, dotsBy }) {
  const names = series.map((entry) => entry.label);
  const who = names.length > 2
    ? `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`
    : names.join(" and ");
  const what = dotsBy === "period" ? "in" : "for";
  return `Dot plot of ${measure} ${what} ${who || "no series"}.`;
}

// ── Model ────────────────────────────────────────────────────────────

export function buildDotPlotModel(input) {
  const { observations = [], comparisons = [], presentation = {}, appearance = {} } = input;
  const shared = sharedSettings({ ...input, chartType: "dotPlot" });
  const valueSettings = shared.axes.x;
  const valueText = (value) =>
    valueSettings.numberType ? valueSettings.format(value) : formatTableNumber(value);

  // ── Which rows are drawn: shown comparisons only ──
  const shown = shownComparisons(observations, comparisons, presentation);
  const shownIds = new Set(shown.map((comparison) => comparison.id));
  const rowsShown = observations.filter((row) => shownIds.has(row.comparisonId));
  const periods = shownPeriods(input.periods, rowsShown);

  // ── Dots: one per comparison, or one per period when there is one comparison ──
  const dotsBy = shown.length <= 1 && periods.length > 1 ? "period" : "comparison";
  let series;
  if (dotsBy === "comparison") {
    const colors = comparisonColors(comparisons.length ? comparisons : shown, appearance);
    series = shown.map((comparison) => ({
      id: comparison.id,
      label: comparison.label || rowsShown.find((row) => row.comparisonId === comparison.id)?.comparisonLabel || comparison.id,
      color: colors[comparison.id],
    }));
  } else {
    const labels = periods.map(String);
    const colors = periodColors(appearance, labels);
    series = labels.map((label, index) => ({ id: label, label, color: colors[index] }));
  }
  const seriesOf = (row) => (dotsBy === "comparison" ? row.comparisonId : String(row.period));

  // ── Categories, in data order unless dragged ──
  const categories = [];
  const seen = new Set();
  for (const row of rowsShown) {
    const key = categoryKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push({ key, label: categoryLabel(row) });
  }
  const ordered = orderCategories(categories, appearance.categoryOrder);

  // ── Rows: categories, or periods (grouped by category) when the dots are comparisons ──
  const periodRows = dotsBy === "comparison" && periods.length > 1;
  const grouped = periodRows && ordered.length > 1;
  const rowSpecs = periodRows
    ? ordered.flatMap((category) =>
      periods.map((period) => ({
        key: `${category.key}|${period}`,
        label: String(period),
        category: category.label,
        group: grouped ? category.label : null,
        matches: (row) => categoryKey(row) === category.key && String(row.period) === String(period),
      })),
    )
    : ordered.map((category) => ({
      key: category.key,
      label: category.label,
      category: category.label,
      group: null,
      matches: (row) => categoryKey(row) === category.key,
    }));

  const showLabels = appearance.showPointLabels === true;
  const perSeries = appearance.pointLabelSeries || {};
  const radius = markerDiameter(appearance.markerSize) / 2;
  const colorOf = new Map(series.map((entry) => [entry.id, entry.color]));
  const points = [];
  const rows = [];
  for (const spec of rowSpecs) {
    const inRow = rowsShown.filter(spec.matches);
    if (!inRow.length) continue;
    const index = rows.length;
    const values = series.map((entry) => {
      const row = inRow.find((candidate) => seriesOf(candidate) === entry.id);
      const available = isAvailable(row);
      return {
        seriesId: entry.id,
        value: available ? row.value : null,
        text: available ? formatTableNumber(row.value) : unavailableValueText(row?.status || "missing"),
      };
    });
    for (const entry of series) {
      const row = inRow.find((candidate) => seriesOf(candidate) === entry.id);
      if (!isAvailable(row)) continue;
      const labeled = showLabels && perSeries[entry.label] !== false;
      points.push({
        key: `${spec.key}|${entry.id}`,
        row: index,
        rowKey: spec.key,
        seriesId: entry.id,
        comparisonId: row.comparisonId,
        period: row.period,
        value: row.value,
        text: formatTableNumber(row.value),
        label: labeled ? valueText(row.value) : null,
        color: colorOf.get(entry.id),
        radius,
      });
    }
    const drawn = values.map((entry) => entry.value).filter((value) => value !== null);
    rows.push({
      key: spec.key,
      label: spec.label,
      group: spec.group,
      category: spec.category,
      // The light band runs from the lowest dot to the highest; one dot has none.
      band: drawn.length > 1 ? { from: Math.min(...drawn), to: Math.max(...drawn) } : null,
      values,
    });
  }

  const groups = [];
  if (grouped) {
    rows.forEach((row, index) => {
      const last = groups.at(-1);
      if (last && last.label === row.group) last.end = index;
      else groups.push({ label: row.group, start: index, end: index });
    });
  }

  // ── Value axis: dots place values, so it fits the data, as the range chart's does ──
  const values = points.map((point) => point.value);
  const calculation = observations.find((row) => row.calculation?.id)?.calculation.id ?? null;
  const scale = axisScale({
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    calculation,
    increment: valueSettings.increment,
    includeZero: false,
  });

  // ── The key names the dots; a single kind of dot needs no key. ──
  const keyEntries = series.length > 1
    ? series.map((entry) => ({ id: entry.id, label: entry.label, color: entry.color, kind: "dot" }))
    : [];
  const measure = observations[0]?.measureLabel || observations[0]?.measureId || "values";

  return {
    chartType: "dotPlot",
    labels: shared.labels,
    typography: shared.typography,
    // No Automatic for the dot plot, as for the range chart: an "automatic"
    // saved on another chart type draws the key on top.
    key: { position: shared.key.position === "automatic" ? "top" : shared.key.position, entries: keyEntries, title: null },
    frame: shared.frame,
    summary: summaryText({ measure, series, dotsBy }),
    // Rows keep their own height, so the source box follows the chart.
    fitContent: true,
    dotsBy,
    rowLabels: {
      groupAlignment: alignment(appearance.groupLabelAlignment),
      variableAlignment: alignment(appearance.variableLabelAlignment),
    },
    pointLabels: { show: showLabels },
    radius,
    valueAxis: {
      visible: !valueAxisHidden(appearance),
      domain: scale.domain,
      ticks: scale.ticks,
      tickText: scale.ticks.map(valueText),
      zero: scale.domain[0] <= 0 && scale.domain[1] >= 0,
    },
    series,
    groups,
    rows,
    points,
  };
}
