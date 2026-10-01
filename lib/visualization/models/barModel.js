/**
 * barModel.js — the chart model for the visx bar chart.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Turns observations into a plain description of what to draw. By default the
 * series come from the same `barSeries` and `colorsForLineSeries` the Plotly
 * bar adapter uses (one per comparison and period), so every series keeps its
 * order, id, name, and color when the renderer changes. Missing and suppressed
 * values are left out as gaps, never drawn as zero-height bars, while their
 * category keeps its place on the axis.
 *
 * Layout choices (renderer plan E, owner decisions 2026-09-30):
 *   - Bars along (`categoryAxis`): locations (the rows' category) or periods.
 *     Along periods, each comparison and location is one series, as on a line
 *     chart.
 *   - Color bars by (`barColorBy`): with several comparisons and several
 *     periods, color by comparison or by period instead of by each pair; the
 *     other becomes an inner category nested under each location.
 *   - Bar order within groups (`seriesOrder`): the series' names in a
 *     dragged order, which also orders a stack from the bottom up and the key.
 *   - Sort (`sort`): data order, largest first, or smallest first. Grouped
 *     bars sort by the first series, stacks by their total. A dragged order
 *     (`categoryOrder`) wins. "value", the registry's old default, is data
 *     order, which is what those views always showed.
 *   - Stacking (`stackMode`): side by side, stacked, or stacked to 100%. A
 *     stack is shaded dark to light (the style guide): the series' own colors
 *     are handed out darkest first, from the bottom segment up.
 *   - Diverging bars grow from `center`, with a reference line, an optional
 *     manual value range, and threshold colors. Stacking is off while
 *     diverging.
 *   - Value labels (`showValueLabels`, `valueLabelSeries`,
 *     `valueLabelPosition`) and stack totals (`showStackTotals`). The model
 *     records each label's preferred placement; the drawing moves a label that
 *     does not fit, because only it knows sizes in px.
 *   - `trackRail` and `minimalAxis` apply to every bar chart.
 *   - One series: its key entry names what the bars measure, and the drawing
 *     leaves the value axis title to the key (`valueTitleInKey`).
 *
 * `mirror` (the population pyramid) was removed by the owner and is never read.
 *
 * Exports:
 *   buildBarModel(input) — {
 *     chartType, labels, typography, key, valueTitleInKey, frame, summary, orientation,
 *     stackMode, diverging, trackRail, minimalAxis,
 *     categories: [label], groups: [{ label, start, end }],
 *     series: [{ id, label, color }],
 *     bars: [{ key, slot, category, seriesId, seriesIndex, value, start, end,
 *              color, text, total, label: { text, placement, insideColor,
 *              outsideColor } | null }],
 *     totals: [{ slot, category, value, end, text }],
 *     valueAxis: { domain, ticks, tickText, baseline },
 *     categoryAxis: { kind, increment }, reference: { value, label } | null,
 *     directLabels
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

import { axisScale } from "@/lib/visualization/chartLayout/axisScale";
import { contrastRatio, readableTextColor, textColorOn } from "@/lib/visualization/chartLayout/contrast";
import { barComparisons, barSeries } from "@/lib/visualization/barSeries";
import { formatNumber, formatTableNumber } from "@/lib/visualization/formatters";
import { colorsForLineSeries, lineSeries } from "@/lib/visualization/lineSeries";
import { sharedSettings } from "@/lib/visualization/models/sharedSettings";
import { officialComparisonColor, resolveToken } from "@/lib/visualization/palettes";
import { COLORS } from "@/lib/constants";

const SORTS = new Set(["descending", "ascending"]);
const STACK_MODES = new Set(["stacked", "percent"]);
const LABEL_POSITIONS = new Set(["inside", "outside"]);

// ── Helpers ──────────────────────────────────────────────────────────

function byPeriod(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function isAvailable(row) {
  return row?.status === "available" && Number.isFinite(row.value);
}

function categoryKey(row) {
  return String(row.categoryId ?? row.geographyId ?? row.categoryLabel ?? row.geographyLabel ?? row.comparisonId);
}

function categoryLabel(row) {
  return row.categoryLabel || row.geographyLabel || row.comparisonLabel || categoryKey(row);
}

function finite(raw) {
  const value = Number(raw);
  return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(value) ? value : null;
}

/** A fixed value range ([min, max] or { min, max }), sorted, or null. */
function manualRange(range) {
  if (!range) return null;
  const pair = Array.isArray(range) ? range : [range.min, range.max];
  const [min, max] = [finite(pair[0]), finite(pair[1])];
  if (min === null || max === null || min === max) return null;
  return min < max ? [min, max] : [max, min];
}

/** An official comparison name ("Navy") or a palette token ("blue3"), as hex. */
function tokenColor(token) {
  const official = officialComparisonColor(token);
  if (official) return official;
  try {
    return resolveToken(token);
  } catch {
    return COLORS.gray3;
  }
}

/** Threshold colors, read from the highest threshold down; a null `at` is the catch-all. */
function bucketColor(value, buckets) {
  const sorted = [...buckets].sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
  for (const bucket of sorted) {
    const threshold = bucket.at == null ? -Infinity : Number(bucket.at);
    if (value >= threshold) return tokenColor(bucket.color);
  }
  return COLORS.gray3;
}

/** The same colors, handed out darkest first: the style guide's dark-to-light stack. */
function darkToLight(colors) {
  const darkness = (color) => contrastRatio(color, COLORS.white);
  return [...colors].sort((a, b) => darkness(b) - darkness(a));
}

/**
 * The labeled reference line across a diverging chart. The bars' own baseline
 * already marks the center, so a separate line is drawn only when the reader
 * sets a reference value (0 included: it is a real setting) or a label; with
 * no value it follows the center.
 */
function referenceLine(value, label, center) {
  const text = typeof label === "string" ? label.trim() : "";
  if (value === null && !text) return null;
  return { value: value ?? center, label: text };
}

function summaryText({ measure, categories, series }) {
  const list = (names) =>
    names.length > 2 ? `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}` : names.join(" and ");
  const who = series.length > 1 ? ` by ${list(series.map((entry) => entry.label))}` : "";
  return `Bar chart of ${measure} for ${list(categories) || "no categories"}${who}.`;
}

// ── Series and slots ─────────────────────────────────────────────────

/**
 * Series (what gets a color) and, for each drawable row, which series and
 * which category slot it belongs to. A slot is one position on the category
 * axis; nested layouts give each slot an outer group.
 */
function layoutRows({ observations, comparisons, presentation, appearance, periods }) {
  if (appearance.categoryAxis === "period") {
    const found = lineSeries(observations, comparisons, presentation);
    const colors = colorsForLineSeries(found, appearance);
    const order = Array.isArray(periods) && periods.length
      ? periods.map(String)
      : [...new Set(found.flatMap((entry) => entry.rows.map((row) => String(row.period))))].sort(byPeriod);
    const series = found.map((entry) => ({
      id: entry.id,
      label: entry.label,
      color: colors[entry.id],
      geographyLabel: entry.geographyLabel,
      geographyId: entry.geographyId,
    }));
    const placed = found.flatMap((entry) =>
      entry.rows.map((row) => ({ row, seriesId: entry.id, outer: String(row.period), outerLabel: String(row.period), inner: null })),
    );
    return { series, placed, outerOrder: order, kind: "period", nested: false };
  }

  const visible = barComparisons(observations, comparisons, presentation);
  const visibleIds = new Set(visible.map((comparison) => comparison.id));
  const rows = observations.filter((row) => visibleIds.has(row.comparisonId));
  const periodCount = new Set(rows.map((row) => String(row.period))).size;
  const colorBy = ["comparison", "period"].includes(appearance.barColorBy) && visible.length > 1 && periodCount > 1
    ? appearance.barColorBy
    : "series";

  if (colorBy === "series") {
    const found = barSeries(observations, comparisons, presentation);
    const colors = colorsForLineSeries(found, appearance);
    const series = found.map((entry) => ({ id: entry.id, label: entry.label, color: colors[entry.id] }));
    const placed = found.flatMap((entry) =>
      entry.rows.map((row) => ({ row, seriesId: entry.id, outer: categoryKey(row), outerLabel: categoryLabel(row), inner: null })),
    );
    return { series, placed, kind: "location", nested: false };
  }

  const comparisonLabel = (comparison) =>
    comparison.customLabel || rows.find((row) => row.comparisonId === comparison.id)?.comparisonLabel || comparison.label || comparison.id;
  const periodsInData = [...new Set(rows.map((row) => String(row.period)))].sort(byPeriod);

  let entries;
  if (colorBy === "comparison") {
    entries = visible.map((comparison) => ({
      id: comparison.id,
      comparisonId: comparison.id,
      label: comparisonLabel(comparison),
      comparison,
    }));
  } else {
    entries = periodsInData.map((period) => ({
      id: `period::${period}`,
      comparisonId: `period::${period}`,
      label: period,
      // A period has no comparison color of its own; the palette decides.
      comparison: { color: null },
    }));
  }
  const colors = colorsForLineSeries(entries, appearance);
  const series = entries.map((entry) => ({ id: entry.id, label: entry.label, color: colors[entry.id] }));
  const innerOrder = colorBy === "comparison"
    ? periodsInData
    : visible.map((comparison) => comparison.id);
  const innerLabel = (row) => (colorBy === "comparison" ? String(row.period) : comparisonLabel(visible.find((comparison) => comparison.id === row.comparisonId)));
  const placed = rows.map((row) => ({
    row,
    seriesId: colorBy === "comparison" ? row.comparisonId : `period::${row.period}`,
    outer: categoryKey(row),
    outerLabel: categoryLabel(row),
    inner: colorBy === "comparison" ? String(row.period) : row.comparisonId,
    innerLabel: innerLabel(row),
  }));
  return { series, placed, innerOrder, kind: "location", nested: true };
}

/**
 * Series in a dragged order (`seriesOrder`, series names), then any series the
 * order has not seen, in data order. Each keeps its own color.
 */
function orderSeries(series, seriesOrder) {
  if (!Array.isArray(seriesOrder) || !seriesOrder.length) return series;
  const rank = (entry) => {
    const index = seriesOrder.indexOf(entry.label);
    return index < 0 ? seriesOrder.length : index;
  };
  return series
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);
}

/** Outer categories in data order, then by the Sort choice, then by a dragged order. */
function orderOuter(placed, { sort, categoryOrder, stacked, firstSeriesId }) {
  const outer = [];
  const seen = new Map();
  for (const entry of placed) {
    if (!seen.has(entry.outer)) {
      seen.set(entry.outer, outer.length);
      outer.push({ key: entry.outer, label: entry.outerLabel });
    }
  }
  if (Array.isArray(categoryOrder) && categoryOrder.length) {
    const rank = (item) => {
      const index = categoryOrder.findIndex((name) => name === item.label || name === item.key);
      return index < 0 ? categoryOrder.length : index;
    };
    return [...outer].sort((a, b) => rank(a) - rank(b) || seen.get(a.key) - seen.get(b.key));
  }
  if (!SORTS.has(sort)) return outer;
  const metric = (item) => {
    const rows = placed.filter((entry) => entry.outer === item.key && isAvailable(entry.row));
    if (stacked) return rows.length ? rows.reduce((sum, entry) => sum + entry.row.value, 0) : null;
    const first = rows.find((entry) => entry.seriesId === firstSeriesId) ?? rows[0];
    return first ? first.row.value : null;
  };
  const direction = sort === "descending" ? -1 : 1;
  return [...outer].sort((a, b) => {
    const [left, right] = [metric(a), metric(b)];
    if (left === null || right === null) return (left === null) - (right === null) || seen.get(a.key) - seen.get(b.key);
    return (left - right) * direction || seen.get(a.key) - seen.get(b.key);
  });
}

// ── Model ────────────────────────────────────────────────────────────

export function buildBarModel(input) {
  const { observations = [], comparisons = [], presentation = {}, appearance = {} } = input;
  const shared = sharedSettings({ ...input, chartType: "bar" });
  const diverging = Boolean(appearance.diverging);
  // A diverging bar has always defaulted to horizontal (the Outcome control's rule).
  const orientation = (appearance.orientation || (diverging ? "horizontal" : "vertical")) === "horizontal"
    ? "horizontal"
    : "vertical";
  const valueAxisSettings = orientation === "horizontal" ? shared.axes.x : shared.axes.y;
  const stackMode = !diverging && STACK_MODES.has(appearance.stackMode) ? appearance.stackMode : "none";
  const stacked = stackMode !== "none";
  const center = diverging ? (finite(appearance.center) ?? 0) : 0;

  const layout = layoutRows({ observations, comparisons, presentation, appearance, periods: input.periods });
  layout.series = orderSeries(layout.series, appearance.seriesOrder);
  const seriesIndex = new Map(layout.series.map((entry, index) => [entry.id, index]));

  // ── Slots: one position per category (and inner category, when nested). ──
  const outer = layout.kind === "period"
    ? layout.outerOrder
      .filter((period) => layout.placed.some((entry) => entry.outer === period))
      .map((period) => ({ key: period, label: period }))
    : orderOuter(layout.placed, {
      sort: appearance.sort,
      categoryOrder: appearance.categoryOrder,
      stacked,
      firstSeriesId: layout.series[0]?.id,
    });
  const slots = [];
  const groups = [];
  for (const item of outer) {
    if (!layout.nested) {
      slots.push({ key: item.key, label: item.label, group: null });
      continue;
    }
    const inner = layout.innerOrder.filter((key) =>
      layout.placed.some((entry) => entry.outer === item.key && entry.inner === key),
    );
    const start = slots.length;
    for (const key of inner) {
      const sample = layout.placed.find((entry) => entry.outer === item.key && entry.inner === key);
      slots.push({ key: `${item.key}|${key}`, label: sample.innerLabel, group: item.label });
    }
    groups.push({ label: item.label, start, end: slots.length - 1 });
  }
  const slotOf = new Map(slots.map((slot, index) => [slot.key, index]));
  const slotKey = (entry) => (layout.nested ? `${entry.outer}|${entry.inner}` : entry.outer);

  // ── Colors: dark to light up a stack. ──
  const stackColors = stacked ? darkToLight(layout.series.map((entry) => entry.color)) : null;
  const series = layout.series.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    color: stackColors ? stackColors[index] : entry.color,
  }));
  const colorOf = new Map(series.map((entry) => [entry.id, entry.color]));
  const buckets = diverging && Array.isArray(appearance.colorBuckets) && appearance.colorBuckets.length
    ? appearance.colorBuckets
    : null;

  // ── Bars, in slot order and series order within a slot. ──
  const drawable = layout.placed
    .filter((entry) => isAvailable(entry.row) && slotOf.has(slotKey(entry)))
    .sort((a, b) =>
      slotOf.get(slotKey(a)) - slotOf.get(slotKey(b)) ||
      seriesIndex.get(a.seriesId) - seriesIndex.get(b.seriesId),
    );
  const totalsBySlot = new Map();
  for (const entry of drawable) {
    const slot = slotOf.get(slotKey(entry));
    totalsBySlot.set(slot, (totalsBySlot.get(slot) || 0) + entry.row.value);
  }
  const positiveEnd = new Map();
  const negativeEnd = new Map();
  const labeledSeries = new Set(
    series
      .filter((entry) => appearance.valueLabelSeries?.[entry.label] !== false)
      .map((entry) => entry.id),
  );
  const showLabels = appearance.showValueLabels === true;
  const allLabeled = labeledSeries.size === series.length;
  const preferred = stacked
    ? "inside"
    : LABEL_POSITIONS.has(appearance.valueLabelPosition)
      ? appearance.valueLabelPosition
      : series.length === 1 || !allLabeled ? "outside" : "inside";
  const valueText = (value) =>
    valueAxisSettings.numberType ? valueAxisSettings.format(value) : formatTableNumber(value);

  const bars = drawable.map((entry) => {
    const { row } = entry;
    const slot = slotOf.get(slotKey(entry));
    const total = totalsBySlot.get(slot);
    let [start, end] = diverging ? [center, row.value] : [0, row.value];
    let shown = row.value;
    if (stacked) {
      const share = stackMode === "percent" ? (total ? (row.value / total) * 100 : 0) : row.value;
      const ends = share >= 0 ? positiveEnd : negativeEnd;
      start = ends.get(slot) || 0;
      end = start + share;
      ends.set(slot, end);
      shown = share;
    }
    const color = buckets ? bucketColor(row.value, buckets) : colorOf.get(entry.seriesId);
    const text = stackMode === "percent"
      ? formatNumber(shown, { type: "percent", decimalPlaces: 0 })
      : valueText(row.value);
    const seriesColor = colorOf.get(entry.seriesId);
    return {
      key: `${row.comparisonId}|${row.geographyId ?? row.categoryId ?? ""}|${row.period}`,
      slot,
      category: slots[slot].label,
      group: slots[slot].group,
      seriesId: entry.seriesId,
      seriesIndex: seriesIndex.get(entry.seriesId),
      value: row.value,
      start,
      end,
      color,
      text: formatTableNumber(row.value),
      total: stacked ? formatTableNumber(total) : null,
      label: showLabels && labeledSeries.has(entry.seriesId)
        ? {
          text,
          placement: preferred,
          insideColor: textColorOn(color),
          // Gray when every series is labeled; otherwise the series' own
          // (readable) color says which series a label belongs to.
          outsideColor: allLabeled ? COLORS.chartAxis : readableTextColor(seriesColor),
        }
        : null,
    };
  });

  const totals = stackMode === "stacked" && appearance.showStackTotals === true
    ? [...totalsBySlot.entries()]
      .sort(([a], [b]) => a - b)
      .map(([slot, value]) => ({
        slot,
        category: slots[slot].label,
        value,
        end: positiveEnd.get(slot) ?? 0,
        text: valueText(value),
      }))
    : [];

  // ── Value axis ──
  const range = diverging ? manualRange(appearance.valueRange) : null;
  let extent;
  if (stackMode === "percent") extent = [0, 100];
  else if (stacked) extent = [Math.min(0, ...negativeEnd.values()), Math.max(0, ...positiveEnd.values())];
  else {
    const values = bars.map((bar) => bar.value);
    extent = [Math.min(center, ...values), Math.max(center, ...values)];
  }
  const scale = axisScale({
    min: range ? range[0] : extent[0],
    max: range ? range[1] : extent[1],
    increment: valueAxisSettings.increment,
  });
  const domain = range ?? scale.domain;
  const ticks = scale.ticks.filter((tick) => tick >= domain[0] && tick <= domain[1]);
  const tickText = ticks.map((tick) =>
    stackMode === "percent"
      ? formatNumber(tick, { type: "percent", decimalPlaces: 0 })
      : valueText(tick),
  );
  // The line the bars grow from: the center for diverging bars, else zero.
  const baseline = diverging ? center : Math.min(Math.max(0, domain[0]), domain[1]);

  const referenceValue = finite(appearance.referenceValue);
  const measure = observations[0]?.measureLabel || observations[0]?.measureId || "values";
  const categories = slots.map((slot) => slot.label);
  // One series: the key says what the bars measure (the value axis title, or
  // the measure when that title is off), and the axis title is not repeated
  // above the axis (owner, 2026-09-30). With the key hidden, the title stays.
  const valueTitle = orientation === "horizontal" ? shared.labels.xAxis : shared.labels.yAxis;
  const valueTitleInKey = series.length === 1 && shared.key.position !== "hidden";
  const keyEntries = series.map((entry) => ({
    id: entry.id,
    label: series.length === 1 ? valueTitle || measure : entry.label,
    color: entry.color,
  }));

  return {
    chartType: "bar",
    labels: shared.labels,
    typography: shared.typography,
    key: { position: shared.key.position, entries: keyEntries, title: null },
    valueTitleInKey,
    frame: shared.frame,
    summary: summaryText({ measure, categories: outer.map((item) => item.label), series }),
    orientation,
    stackMode,
    diverging,
    trackRail: appearance.trackRail === true,
    minimalAxis: appearance.minimalAxis === true,
    // Automatic names stacked series beside the last stack (drawing decides fit).
    directLabels: shared.key.position === "automatic" && stacked,
    groupGap: finite(appearance.groupGap),
    categories,
    groups,
    series,
    bars,
    totals,
    valueAxis: { domain, ticks, tickText, baseline },
    categoryAxis: {
      kind: layout.kind,
      increment: layout.kind === "period"
        ? (orientation === "horizontal" ? shared.axes.y.increment : shared.axes.x.increment)
        : null,
    },
    reference: diverging ? referenceLine(referenceValue, appearance.referenceLabel, center) : null,
  };
}
