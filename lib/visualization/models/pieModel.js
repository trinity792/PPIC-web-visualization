/**
 * pieModel.js — the chart model for the visx pie chart (and its donut variant).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Turns observations into a plain description of what to draw. The rows and
 * the color of each slice come from `pieSlices`, the same function the Plotly
 * pie adapter uses, so a slice keeps its name and color when the renderer
 * changes.
 *
 * Honest charts: a slice whose value is missing or suppressed is left out,
 * never drawn as a zero-width slice, and so is a slice that cannot take up any
 * of the circle (zero or negative). Left-out slices are listed in `omitted`, so
 * the written summary can say how many are not drawn.
 *
 * Slices keep the data's order, as the Categories panel lists them (the Plotly
 * pie re-sorted them by size). A dragged order (`categoryOrder`) goes first,
 * and slices the reader switched off (`hiddenCategories`) are left out, both
 * matched by the slice's name.
 *
 * Every slice is labeled directly (renderer plan K, owner): `showValueLabels`
 * is never read, and every slice carries the text to print beside it. The
 * donut hole (`hole`, 0 to 0.6 of the radius) is 0, a full pie, when nothing
 * is saved. The key is hidden by default because the slices are named, and can
 * be switched on from Legend Position.
 *
 * Shared settings come from `sharedSettings`, including the vertical number
 * type and decimal places, which format the slice values.
 *
 * Exports:
 *   buildPieModel(input) — {
 *     chartType, labels, typography, key, frame, summary,
 *     hole,                                    — 0 (a full pie) to 0.6
 *     note,                                    — "Average of 2020 and 2025." or null
 *     emptyMessage,                            — why nothing is drawn, or null
 *     slices: [{ key, id, label, value, valueLabel, share, shareText, color }]
 *                                              — drawn slices, in order
 *     omitted: [{ label, reason }]             — slices left out of the drawing
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { formatNumber, formatTableNumber } from "@/lib/visualization/formatters";
import { LEGEND_POSITIONS, sharedSettings } from "@/lib/visualization/models/sharedSettings";
import { pieSlices } from "@/lib/visualization/pieSlices";

const { pie: pieStyle } = CHART_STYLE;

// ── Helpers ──────────────────────────────────────────────────────────

/** The hole as a share of the radius, kept to the slider's range. */
function holeFrom(raw) {
  const value = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(value)) return 0;
  return Math.min(pieStyle.maxHole, Math.max(0, value));
}

function isDrawable(row) {
  return row.status === "available" && Number.isFinite(row.value) && row.value > 0;
}

function omittedReason(row) {
  if (row.status === "suppressed") return "suppressed";
  if (row.status !== "available" || !Number.isFinite(row.value)) return "not available";
  return "not a positive value";
}

/** Slices in the dragged order first, then the rest in data order. */
function inSavedOrder(entries, savedOrder) {
  if (!Array.isArray(savedOrder) || !savedOrder.length) return entries;
  const rank = new Map();
  savedOrder.forEach((label, index) => {
    if (!rank.has(label)) rank.set(label, index);
  });
  const placed = entries.filter((entry) => rank.has(entry.label));
  const rest = entries.filter((entry) => !rank.has(entry.label));
  return [...placed.sort((a, b) => rank.get(a.label) - rank.get(b.label)), ...rest];
}

function shareText(share) {
  const percent = share * 100;
  return percent > 0 && percent < 1 ? "<1%" : formatNumber(percent, { type: "percent", decimalPlaces: 0 });
}

function noteFor(rows, derived) {
  if (!derived) return null;
  const included = rows[0]?.includedPeriods || [];
  if (!included.length) return null;
  const yearText = included.length > 2
    ? `${included.slice(0, -1).join(", ")}, and ${included.at(-1)}`
    : included.join(" and ");
  return `Average of ${yearText}.`;
}

function summaryText({ measure, slices, omitted, note }) {
  if (!slices.length) return `Pie chart of ${measure}: nothing to draw.`;
  const parts = slices.map((slice) => `${slice.label} ${slice.valueLabel} (${slice.shareText})`);
  const left = omitted.length
    ? ` ${omitted.length} ${omitted.length === 1 ? "slice is" : "slices are"} not drawn.`
    : "";
  return `Pie chart of ${measure}: ${parts.join(", ")}.${left}${note ? ` ${note}` : ""}`;
}

// ── Model ────────────────────────────────────────────────────────────

export function buildPieModel(input) {
  const { observations = [], appearance = {} } = input;
  const shared = sharedSettings({ ...input, chartType: "pie" });
  const { rows, slices: named, derived } = pieSlices(input);
  const valueText = (value) =>
    shared.axes.y.numberType ? shared.axes.y.format(value) : formatTableNumber(value);

  // ── Slices: hidden ones out, then the saved order, then the empty ones out ──
  const hidden = new Set(Array.isArray(appearance.hiddenCategories) ? appearance.hiddenCategories : []);
  const entries = rows
    .map((row, index) => ({ row, slice: named[index], index }))
    .filter(({ slice }) => !hidden.has(slice.label))
    .map((entry) => ({ ...entry, label: entry.slice.label }));
  const ordered = inSavedOrder(entries, appearance.categoryOrder);
  const drawn = ordered.filter(({ row }) => isDrawable(row));
  const omitted = ordered
    .filter(({ row }) => !isDrawable(row))
    .map(({ row, label }) => ({ label, reason: omittedReason(row) }));
  const total = drawn.reduce((sum, { row }) => sum + row.value, 0);

  const slices = drawn.map(({ row, slice, index }) => {
    const share = total > 0 ? row.value / total : 0;
    return {
      key: `${slice.id}|${index}`,
      id: slice.id,
      label: slice.label,
      value: row.value,
      valueLabel: valueText(row.value),
      share,
      shareText: shareText(share),
      color: slice.color,
    };
  });

  const note = noteFor(rows, derived);
  const measure = observations[0]?.measureLabel || observations[0]?.measureId || "values";

  return {
    chartType: "pie",
    labels: shared.labels,
    typography: shared.typography,
    key: {
      // Slices are named directly, so there is no key until one is chosen.
      position: LEGEND_POSITIONS.includes(appearance.legendPosition) ? shared.key.position : "hidden",
      entries: slices.map((slice) => ({ id: slice.key, label: slice.label, color: slice.color })),
      title: null,
    },
    frame: shared.frame,
    summary: summaryText({ measure, slices, omitted, note }),
    hole: holeFrom(appearance.hole),
    note,
    emptyMessage: slices.length ? null : "There are no values to draw for these selections.",
    slices,
    omitted,
  };
}
