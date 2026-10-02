/**
 * rangeModel.js — the chart model for the visx range chart (dumbbell).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Turns observations into a plain description of what to draw: one row per
 * comparison and category, each with a start value (the first period) and an
 * end value (the last period), joined by a connector that always runs from
 * the start value to the end value. Missing and suppressed values stay as gaps
 * (value null): the row keeps its place and label, and a row missing either
 * endpoint draws no connector.
 *
 * Follows PPIC's published range plots (mockups/range chart reference/; owner
 * decisions, renderer plan F, October 1, 2026):
 *   - Each end has its own color, the same on every row: Navy for the start
 *     and Orange for the end, or the first two colors of a chosen categorical
 *     palette. The row labels name the rows, so comparison colors do not apply.
 *   - A key names the two ends, above the chart by default (owner: no
 *     Automatic choice; a view saved with "automatic" draws the key on top).
 *   - The value axis fits the data with round ends rather than starting at
 *     zero, and the model says whether it reaches zero, where a darker line
 *     is drawn.
 *
 * Rows:
 *   - One comparison: one row per category, labeled with the category.
 *   - Several comparisons and one category: one row per comparison.
 *   - Several comparisons and several categories: the categories become
 *     groups with a header row, and each group holds one row per comparison.
 *   Rows keep data order, unless the reader dragged the locations into an
 *   order (`categoryOrder`, from the Geographic Level list); then categories
 *   follow it, and any it does not name keep data order after them.
 *
 * Shared settings come from `sharedSettings`; this file reads only the range
 * chart's own settings: the dragged location order (`categoryOrder`), row
 * label alignment (`groupLabelAlignment`, `variableLabelAlignment`, left by
 * default as PPIC publishes them), Hide X-Axis (`hideXAxis`; a view saved
 * before the rename with `showValueAxis: false` still hides it, unless
 * `hideXAxis` is saved too), Range style (`rangeStyle`: dots or arrow), Value
 * axis position (`valueAxisPosition`: bottom or top), Show point values
 * (`showPointLabels`), Label which end (`pointLabelEnds`: both, start, or
 * end), and First line only (`pointLabelsFirstLineOnly`: values on the first
 * row only, as the editor has always drawn it). The row label indents were
 * hidden by the owner and are never read.
 *
 * Exports:
 *   RANGE_STYLES, POINT_LABEL_ENDS, VALUE_AXIS_POSITIONS — the saved choices
 *   buildRangeModel(input) — {
 *     chartType, labels, typography, key, frame, summary,
 *     periods: { start, end },
 *     ends: { start: { label, color }, end: { label, color } },
 *     fitContent,                                — the drawing sizes itself (ChartFrame)
 *     rangeStyle, rowLabels: { groupAlignment, variableAlignment },
 *     pointLabels: { show, firstRowOnly, ends },
 *     valueAxis: { visible, position, domain, ticks, tickText, zero },
 *     series: [{ id, label }],
 *     groups: [{ label, start, end }],          — row index ranges, first to last
 *     rows: [{ key, seriesId, category, group, label,
 *              start: { period, value, status, valueKind, text, label },
 *              end:   { ...same },
 *              connector: { from, to } | null }]
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

import { axisScale } from "@/lib/visualization/chartLayout/axisScale";
import { ROW_LABEL_ALIGNMENTS } from "@/lib/visualization/chartLayout/rowLabels";
import { formatTableNumber, unavailableValueText } from "@/lib/visualization/formatters";
import { visibleComparisons } from "@/lib/visualization/lineSeries";
import { sharedSettings } from "@/lib/visualization/models/sharedSettings";
import { PALETTES, officialComparisonColor, seriesColor } from "@/lib/visualization/palettes";

export const RANGE_STYLES = Object.freeze(["dots", "arrow"]);
export const POINT_LABEL_ENDS = Object.freeze(["both", "start", "end"]);
export const VALUE_AXIS_POSITIONS = Object.freeze(["bottom", "top"]);
const DEFAULT_END_COLORS = Object.freeze(["Navy", "Orange"]);

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

function choice(value, choices) {
  return choices.includes(value) ? value : choices[0];
}

/** The two ends' colors: a chosen categorical palette's first two, else Navy and Orange. */
function endColors(appearance, labels) {
  if (PALETTES[appearance.palette]?.kind === "categorical") {
    return labels.map((label, index) => seriesColor(appearance, label, index));
  }
  return DEFAULT_END_COLORS.map(officialComparisonColor);
}

function alignment(value) {
  return ROW_LABEL_ALIGNMENTS.includes(value) ? value : "left";
}

/** Hide X-Axis: the saved setting, else the name views used before it. */
function valueAxisHidden(appearance) {
  if (typeof appearance.hideXAxis === "boolean") return appearance.hideXAxis;
  return appearance.showValueAxis === false;
}

/** The response's ordered periods, or the periods the rows carry. */
function orderedPeriods(periods, observations) {
  if (Array.isArray(periods) && periods.length) return periods;
  return [...new Set(observations.map((row) => row.period))].sort(byPeriod);
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

function endpoint(row, period, labelText) {
  const available = row?.status === "available" && Number.isFinite(row.value);
  const status = row?.status || "missing";
  return {
    period,
    value: available ? row.value : null,
    status,
    valueKind: row?.valueKind ?? null,
    text: available ? formatTableNumber(row.value) : unavailableValueText(status),
    label: available && labelText ? labelText(row.value) : null,
  };
}

function summaryText({ measure, series, periods }) {
  const names = series.map((entry) => entry.label);
  const who = names.length > 2
    ? `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`
    : names.join(" and ");
  const span = periods.start != null && periods.end != null ? ` from ${periods.start} to ${periods.end}` : "";
  return `Range chart of ${measure}${span} for ${who || "no series"}.`;
}

// ── Model ────────────────────────────────────────────────────────────

export function buildRangeModel(input) {
  const { observations = [], comparisons = [], presentation = {}, appearance = {} } = input;
  const shared = sharedSettings({ ...input, chartType: "dumbbell" });
  const valueSettings = shared.axes.x;
  const valueText = (value) =>
    valueSettings.numberType ? valueSettings.format(value) : formatTableNumber(value);

  // ── Series: one per shown comparison. The rows name them; the ends carry color. ──
  const shown = shownComparisons(observations, comparisons, presentation);
  const series = shown.map((comparison) => ({
    id: comparison.id,
    label: comparison.label || observations.find((row) => row.comparisonId === comparison.id)?.comparisonLabel || comparison.id,
  }));

  // ── The two periods each row joins ──
  const periodList = orderedPeriods(input.periods, observations);
  const periods = {
    start: periodList[0] ?? null,
    end: periodList.length > 1 ? periodList.at(-1) : null,
  };
  const endLabels = [periods.start, periods.end].map((period) => (period == null ? "" : String(period)));
  const [startColor, endColor] = endColors(appearance, endLabels);
  const ends = {
    start: { label: endLabels[0], color: startColor },
    end: { label: endLabels[1], color: endColor },
  };

  // ── Categories, in data order ──
  const shownIds = new Set(series.map((entry) => entry.id));
  const categories = [];
  const seen = new Set();
  for (const row of observations) {
    if (!shownIds.has(row.comparisonId)) continue;
    const key = categoryKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push({ key, label: categoryLabel(row) });
  }
  const rowsFor = new Map();
  for (const row of observations) {
    const key = `${row.comparisonId}|${categoryKey(row)}`;
    if (!rowsFor.has(key)) rowsFor.set(key, new Map());
    rowsFor.get(key).set(String(row.period), row);
  }

  // ── Rows: grouped by category when there are several of each ──
  const grouped = series.length > 1 && categories.length > 1;
  const pairs = orderCategories(categories, appearance.categoryOrder).flatMap((category) => series.map((entry) => ({ category, entry })));
  const present = pairs.filter(({ category, entry }) => rowsFor.has(`${entry.id}|${category.key}`));

  const showLabels = appearance.showPointLabels === true;
  const firstRowOnly = appearance.pointLabelsFirstLineOnly === true;
  const labelEnds = choice(appearance.pointLabelEnds, POINT_LABEL_ENDS);
  const rows = present.map(({ category, entry }, index) => {
    const key = `${entry.id}|${category.key}`;
    const byPeriodRow = rowsFor.get(key);
    const labeled = showLabels && (!firstRowOnly || index === 0);
    const labelFor = (which) => (labeled && (labelEnds === "both" || labelEnds === which) ? valueText : null);
    const start = endpoint(byPeriodRow.get(String(periods.start)), periods.start, labelFor("start"));
    const end = periods.end === null
      ? endpoint(null, null, null)
      : endpoint(byPeriodRow.get(String(periods.end)), periods.end, labelFor("end"));
    return {
      key,
      seriesId: entry.id,
      category: category.label,
      group: grouped ? category.label : null,
      // A row names whatever varies between rows.
      label: series.length > 1 ? entry.label : category.label,
      start,
      end,
      connector: start.value !== null && end.value !== null ? { from: start.value, to: end.value } : null,
    };
  });

  const groups = [];
  if (grouped) {
    rows.forEach((row, index) => {
      const last = groups.at(-1);
      if (last && last.label === row.group) last.end = index;
      else groups.push({ label: row.group, start: index, end: index });
    });
  }

  // ── Value axis ──
  const values = rows.flatMap((row) => [row.start.value, row.end.value]).filter(Number.isFinite);
  const calculation = observations.find((row) => row.calculation?.id)?.calculation.id ?? null;
  const scale = axisScale({
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    calculation,
    increment: valueSettings.increment,
    // Range plots place values rather than measure lengths from zero.
    includeZero: false,
  });

  // ── The key: what the two ends' colors mean. ──
  const bothEnds = periods.start !== null && periods.end !== null;
  const keyEntries = bothEnds
    ? [
      { id: "start", label: ends.start.label, color: ends.start.color, kind: "dot" },
      { id: "end", label: ends.end.label, color: ends.end.color, kind: "dot" },
    ]
    : [];
  const measure = observations[0]?.measureLabel || observations[0]?.measureId || "values";

  return {
    chartType: "dumbbell",
    labels: shared.labels,
    typography: shared.typography,
    // No Automatic for range charts (owner, 2026-10-01): an "automatic" saved
    // on another chart type draws the key on top.
    key: { position: shared.key.position === "automatic" ? "top" : shared.key.position, entries: keyEntries, title: null },
    frame: shared.frame,
    summary: summaryText({ measure, series, periods }),
    periods,
    ends,
    // Rows keep their own height, so the source box follows the chart.
    fitContent: true,
    rangeStyle: choice(appearance.rangeStyle, RANGE_STYLES),
    rowLabels: {
      groupAlignment: alignment(appearance.groupLabelAlignment),
      variableAlignment: alignment(appearance.variableLabelAlignment),
    },
    pointLabels: { show: showLabels, firstRowOnly, ends: labelEnds },
    valueAxis: {
      visible: !valueAxisHidden(appearance),
      position: choice(appearance.valueAxisPosition, VALUE_AXIS_POSITIONS),
      domain: scale.domain,
      ticks: scale.ticks,
      tickText: scale.ticks.map(valueText),
      // A darker line marks zero whenever the axis reaches it.
      zero: scale.domain[0] <= 0 && scale.domain[1] >= 0,
    },
    series,
    groups,
    rows,
  };
}
