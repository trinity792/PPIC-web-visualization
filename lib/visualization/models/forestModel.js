/**
 * forestModel.js — the chart model for the visx forest plot.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Turns observations into a plain description of what to draw: one row per
 * study (category), each with an estimate and the lower and upper ends of its
 * confidence interval on one shared value axis, against an optional line of
 * no effect (renderer plan H). The forest plot is a range-family chart, so it
 * lays out like the range chart: row labels at the left (`rowLabels.js`), a
 * light vertical grid, dotted row lines, a value axis that fits the data
 * rather than starting at zero, and a darker zero line when the axis reaches
 * it.
 *
 * Missing and suppressed values stay as gaps (value null): the row keeps its
 * place and label, a row missing either interval end draws no interval, and a
 * row missing its estimate draws no estimate marker. Nothing is filled in as
 * zero or as the interval's midpoint.
 *
 * Colors match the legacy Plotly forest plot (the retired `toPlotly.js`), so
 * nothing changed color when the renderer switched: the interval line and the vertical-bar
 * ends are neutral gray; dot and diamond ends take the palette's first and
 * second colors; the estimate takes the palette's first color, or its third
 * when the ends use the palette too.
 *
 * Every estimate marker is drawn at one size, whatever its weight (the
 * `size` role travels with the data but is never drawn).
 *
 * Rows:
 *   - One comparison: one row per category, labeled with the category.
 *   - Several comparisons and one category: one row per comparison.
 *   - Several comparisons and several categories: the categories become
 *     groups with a header row, and each group holds one row per comparison.
 *   Rows keep data order, unless the reader dragged the locations into an
 *   order (`categoryOrder`). A response with several periods draws the active
 *   period (`presentation.activePeriod`), else the latest. A pasted table with
 *   no time column names each part's period after its column, so those
 *   stand-in periods are not told apart.
 *
 * Shared settings come from `sharedSettings`; this file reads only the forest
 * plot's own: the dragged location order (`categoryOrder`), row label
 * alignment (`groupLabelAlignment`, `variableLabelAlignment`, left by
 * default), Hide X-Axis (`hideXAxis`, or an older view's `showValueAxis:
 * false`), Show point values (`showPointLabels`: the estimate's value above
 * its marker), Interval ends (`endpointStyle`: caps, dots, diamonds, or
 * none; an older view's "bars" is caps), Estimate marker (`pointStyle`:
 * square, diamond, dot, or none), Line of no effect (`noEffectValue`; 0 is a
 * real value, unset or blank draws no line), and Value axis center
 * (`center`, again with 0 a real value). The row label indents were hidden by
 * the owner and are never read.
 *
 * Exports:
 *   ENDPOINT_STYLES, POINT_STYLES — the saved choices, default first
 *   buildForestModel(input) — {
 *     chartType, labels, typography, key, frame, summary, fitContent,
 *     rowLabels: { groupAlignment, variableAlignment },
 *     pointLabels: { show },
 *     endpointStyle, pointStyle,
 *     colors: { interval, lower, upper, estimate },
 *     referenceLine: { value } | null,           — the line of no effect
 *     valueAxis: { visible, domain, ticks, tickText, zero, clip },
 *     series: [{ id, label }],
 *     groups: [{ label, start, end }],           — row index ranges, first to last
 *     rows: [{ key, seriesId, category, group, label,
 *              estimate, lower, upper,           — numbers, or null for a gap
 *              interval: { from, to } | null,
 *              status: { estimate, lower, upper },
 *              text: { estimate, lower, upper }, — as the View Data table formats them
 *              pointLabel }]                     — the estimate's label text, or null
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
import { seriesColor } from "@/lib/visualization/palettes";

export const ENDPOINT_STYLES = Object.freeze(["caps", "dots", "diamonds", "none"]);
export const POINT_STYLES = Object.freeze(["square", "diamond", "dot", "none"]);
const PARTS = Object.freeze({ lowerBound: "lower", estimate: "estimate", upperBound: "upper" });

const { interval: intervalStyle, cap: capStyle } = CHART_STYLE.forest;

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

/** A saved number, or null when unset or blank. 0 is a real value, not an absence. */
function savedNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function endpointStyleOf(raw) {
  if (raw === "bars") return "caps"; // the name older views used
  return ENDPOINT_STYLES.includes(raw) ? raw : ENDPOINT_STYLES[0];
}

function pointStyleOf(raw) {
  return POINT_STYLES.includes(raw) ? raw : POINT_STYLES[0];
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

/** One part of a row: its value (null when unavailable), status, and table text. */
function part(observation, valueText = formatTableNumber) {
  const status = observation?.status || "missing";
  const available = status === "available" && Number.isFinite(observation?.value);
  return {
    value: available ? observation.value : null,
    status,
    text: available ? valueText(observation.value) : unavailableValueText(status),
  };
}

/**
 * The value axis: fits the data, or centers on the chosen value. A reader's
 * axis range overrides centering, since it says where the axis ends.
 */
function buildAxis({ values, center, calculation, increment, range }) {
  const finite = values.filter(Number.isFinite);
  const fit = (min, max) => axisScale({ min, max, calculation, increment, includeZero: false, fixed: range });
  if (center === null || range) {
    return fit(finite.length ? Math.min(...finite) : 0, finite.length ? Math.max(...finite) : 0);
  }
  // Balanced around the center: the furthest value sets the reach, with 5%
  // breathing room (a lone value at the center still gets some), then the
  // axis widens to the round ticks on whichever side needs more.
  const reach = finite.length ? Math.max(...finite.map((value) => Math.abs(value - center))) : 0;
  const radius = (reach || Math.max(Math.abs(center) * 0.05, 0.05)) * 1.05;
  const scale = fit(center - radius, center + radius);
  const half = Math.max(center - scale.domain[0], scale.domain[1] - center);
  return { ...scale, domain: [center - half, center + half] };
}

function summaryText({ measure, series, rows }) {
  const names = series.map((entry) => entry.label);
  const who = names.length > 1 ? ` for ${names.join(" and ")}` : "";
  const count = rows.length;
  return `Forest plot of ${measure}${who}: ${count} ${count === 1 ? "row" : "rows"}, each with an estimate and its interval.`;
}

// ── Model ────────────────────────────────────────────────────────────

export function buildForestModel(input) {
  const { observations = [], comparisons = [], presentation = {}, appearance = {} } = input;
  const shared = sharedSettings({ ...input, chartType: "forest" });
  const valueSettings = shared.axes.x;
  const valueText = (value) =>
    valueSettings.numberType ? valueSettings.format(value) : formatTableNumber(value);

  // ── The period drawn: the active one, else the latest ──
  // A pasted table with no time column stands each part's column name in for
  // its period ("Est", "Low", "High"), so one row's parts sit in different
  // "periods". Only a period holding more than one part is a real one; with
  // none, every part belongs to the one picture.
  const parts = observations.filter((row) => Object.hasOwn(PARTS, row.measureRole ?? ""));
  const rolesByPeriod = new Map();
  for (const row of parts) {
    const key = String(row.period);
    if (!rolesByPeriod.has(key)) rolesByPeriod.set(key, new Set());
    rolesByPeriod.get(key).add(row.measureRole);
  }
  const periods = [...new Set(parts.map((row) => row.period))]
    .filter((candidate) => rolesByPeriod.get(String(candidate)).size > 1)
    .sort(byPeriod);
  const period = periods.some((candidate) => String(candidate) === String(presentation.activePeriod))
    ? presentation.activePeriod
    : periods.at(-1);
  const drawn = periods.length
    ? parts.filter((row) => String(row.period) === String(period))
    : parts;

  // ── Series: one per shown comparison. The rows name them. ──
  const shown = shownComparisons(drawn, comparisons, presentation);
  const series = shown.map((comparison) => ({
    id: comparison.id,
    label: comparison.label || drawn.find((row) => row.comparisonId === comparison.id)?.comparisonLabel || comparison.id,
  }));

  // ── Categories, in data order ──
  const shownIds = new Set(series.map((entry) => entry.id));
  const categories = [];
  const seen = new Set();
  const found = new Map();
  for (const row of drawn) {
    if (!shownIds.has(row.comparisonId)) continue;
    const key = categoryKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      categories.push({ key, label: categoryLabel(row) });
    }
    const rowKey = `${row.comparisonId}|${key}`;
    if (!found.has(rowKey)) found.set(rowKey, {});
    found.get(rowKey)[PARTS[row.measureRole]] = row;
  }

  // ── Rows: grouped by category when there are several of each ──
  const grouped = series.length > 1 && categories.length > 1;
  const present = orderCategories(categories, appearance.categoryOrder)
    .flatMap((category) => series.map((entry) => ({ category, entry })))
    .filter(({ category, entry }) => found.has(`${entry.id}|${category.key}`));
  const showLabels = appearance.showPointLabels === true;
  const rows = present.map(({ category, entry }) => {
    const key = `${entry.id}|${category.key}`;
    const { estimate, lower, upper } = Object.fromEntries(
      ["estimate", "lower", "upper"].map((name) => [name, part(found.get(key)[name], valueText)]),
    );
    return {
      key,
      seriesId: entry.id,
      category: category.label,
      group: grouped ? category.label : null,
      // A row names whatever varies between rows.
      label: series.length > 1 ? entry.label : category.label,
      estimate: estimate.value,
      lower: lower.value,
      upper: upper.value,
      interval: lower.value !== null && upper.value !== null ? { from: lower.value, to: upper.value } : null,
      status: { estimate: estimate.status, lower: lower.status, upper: upper.status },
      text: { estimate: estimate.text, lower: lower.text, upper: upper.text },
      pointLabel: showLabels && estimate.value !== null ? valueText(estimate.value) : null,
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

  // ── Line of no effect and value axis ──
  const noEffect = savedNumber(appearance.noEffectValue);
  const referenceLine = noEffect === null ? null : { value: noEffect };
  const scale = buildAxis({
    // The line of no effect is part of the picture, so the axis reaches it.
    values: [...rows.flatMap((row) => [row.lower, row.upper, row.estimate]), noEffect ?? NaN],
    center: savedNumber(appearance.center),
    calculation: observations.find((row) => row.calculation?.id)?.calculation.id ?? null,
    increment: valueSettings.increment,
    range: valueSettings.range,
  });
  const [low, high] = scale.domain;

  // ── Marks and their colors, as the Plotly forest plot colors them ──
  const endpointStyle = endpointStyleOf(appearance.endpointStyle);
  const pointStyle = pointStyleOf(appearance.pointStyle);
  const endsUsePalette = endpointStyle === "dots" || endpointStyle === "diamonds";
  const colors = {
    interval: intervalStyle.color,
    lower: endsUsePalette ? seriesColor(appearance, "Lower bound", 0) : capStyle.color,
    upper: endsUsePalette ? seriesColor(appearance, "Upper bound", 1) : capStyle.color,
    estimate: seriesColor(appearance, "Estimate", endsUsePalette ? 2 : 0),
  };

  // ── The key: only when the marks differ in color, so it has something to say. ──
  const keyEntries = endsUsePalette
    ? [
      { id: "lower", label: "Lower bound", color: colors.lower, kind: "dot" },
      { id: "upper", label: "Upper bound", color: colors.upper, kind: "dot" },
      ...(pointStyle !== "none" ? [{ id: "estimate", label: "Estimate", color: colors.estimate, kind: "dot" }] : []),
    ]
    : [];
  const measure = observations[0]?.measureLabel || observations[0]?.measureId || "values";

  return {
    chartType: "forest",
    labels: shared.labels,
    typography: shared.typography,
    // The key sits on top, as the range chart's does; an "automatic" saved on
    // another chart type draws it there too.
    key: { position: shared.key.position === "automatic" ? "top" : shared.key.position, entries: keyEntries, title: null },
    frame: shared.frame,
    grid: shared.grid,
    summary: summaryText({ measure, series, rows }),
    // Rows keep their own height, so the source box follows the chart.
    fitContent: true,
    rowLabels: {
      groupAlignment: alignment(appearance.groupLabelAlignment),
      variableAlignment: alignment(appearance.variableLabelAlignment),
    },
    pointLabels: { show: showLabels },
    endpointStyle,
    pointStyle,
    colors,
    referenceLine,
    valueAxis: {
      visible: !valueAxisHidden(appearance),
      domain: scale.domain,
      clip: scale.fixed,
      ticks: scale.ticks,
      tickText: scale.ticks.map(valueText),
      // A darker line marks zero whenever the axis reaches it, unless the line
      // of no effect already sits there.
      zero: low <= 0 && high >= 0 && noEffect !== 0,
    },
    series,
    groups,
    rows,
  };
}
