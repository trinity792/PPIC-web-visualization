/**
 * heatmapGrid.js — the cells a heatmap draws and the ramp that colors them.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Shared by the Plotly heatmap adapter (lib/visualization/adapters) and the
 * visx heatmap model (lib/visualization/models/heatmapModel.js), so both
 * renderers draw the same rows, columns, and colors.
 *
 * A heatmap shows one comparison at a time (its comparisons are tabs): the
 * active tab's, else the first visible one. Columns are the periods, oldest
 * first; rows are the categories (an age group, say), else the places. Every
 * period of the comparison is drawn: a stale `activePeriod` left by a map or
 * pie never narrows a heatmap to one column. The Categories panel's dragged
 * order (`categoryOrder`) puts rows first and `hiddenCategories` leaves rows
 * out, both matched by the row's name. A missing or suppressed value is an
 * empty cell (`value: null`), never the lowest color.
 *
 * Exports:
 *   heatmapCategoryNames(input) — every row name in data order, for the Categories panel
 *   heatmapGrid(input) — {
 *     comparisonId,
 *     periods,                         — column values, oldest first
 *     categories,                      — row names, as ordered and filtered
 *     cells: [{ category, period, value, status, row }] — one per row × column
 *     colorScale: [[stop, hex], ...]   — the ramp, inverted when asked
 *     domain: [min, max] | null        — the drawn values' range
 *   }
 *
 * Data sources:
 *   - adaptObservations input (observations, comparisons, presentation, appearance)
 *   - lib/visualization/colorScale.js (the ramp)
 */

import { scaleStops } from "./colorScale";

function categoryOf(row) {
  return row.categoryLabel || row.geographyLabel || row.comparisonLabel;
}

function activeRows({ observations = [], comparisons = [], presentation = {} }) {
  const visible = comparisons.filter(
    (comparison) => presentation?.comparisonVisibility?.[comparison.id] !== false,
  );
  const active = visible.some((comparison) => comparison.id === presentation?.activeTab)
    ? presentation.activeTab
    : visible[0]?.id ?? observations[0]?.comparisonId;
  return { comparisonId: active, rows: observations.filter((row) => row.comparisonId === active) };
}

function orderedPeriods(rows) {
  const periods = [...new Set(rows.map((row) => row.period))];
  return periods.every((period) => Number.isFinite(Number(period)))
    ? periods.sort((a, b) => Number(a) - Number(b))
    : periods;
}

/** Dragged names first, in their order, then the rest in data order. */
function inSavedOrder(names, savedOrder) {
  if (!Array.isArray(savedOrder) || !savedOrder.length) return names;
  const rank = new Map();
  savedOrder.forEach((name, index) => {
    if (!rank.has(name)) rank.set(name, index);
  });
  const placed = names.filter((name) => rank.has(name)).sort((a, b) => rank.get(a) - rank.get(b));
  return [...placed, ...names.filter((name) => !rank.has(name))];
}

export function heatmapCategoryNames(input) {
  return [...new Set(activeRows(input).rows.map(categoryOf))];
}

export function heatmapGrid(input) {
  const { appearance = {} } = input;
  const { comparisonId, rows } = activeRows(input);
  const periods = orderedPeriods(rows);
  const hidden = new Set(Array.isArray(appearance.hiddenCategories) ? appearance.hiddenCategories : []);
  const categories = inSavedOrder([...new Set(rows.map(categoryOf))], appearance.categoryOrder)
    .filter((category) => !hidden.has(category));
  const cells = categories.flatMap((category) =>
    periods.map((period) => {
      const row = rows.find((entry) => categoryOf(entry) === category && entry.period === period) || null;
      const value = row?.status === "available" && Number.isFinite(row.value) ? row.value : null;
      return { category, period, value, status: row?.status ?? "missing", row };
    }),
  );
  const values = cells.map((cell) => cell.value).filter(Number.isFinite);
  return {
    comparisonId,
    periods,
    categories,
    cells,
    colorScale: scaleStops(appearance, {
      kind: appearance.colorScale === "diverging" ? "diverging" : "sequential",
      invert: Boolean(appearance.invertScale),
    }),
    domain: values.length ? [Math.min(...values), Math.max(...values)] : null,
  };
}
