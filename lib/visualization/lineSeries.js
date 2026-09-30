/**
 * lineSeries.js — the series a line chart draws and the color each one gets.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Shared by the Plotly line adapter (lib/visualization/adapters) and the visx
 * line model (lib/visualization/models/lineModel.js), so both renderers draw
 * the same series, in the same order, with the same names and colors, and a
 * chart never changes color when its renderer changes.
 *
 * Exports:
 *   visibleComparisons(comparisons, presentation) — comparisons shown, honoring
 *     visibility and the active tab
 *   lineSeries(observations, comparisons, presentation) — one series per visible
 *     comparison and geography: { id, comparisonId, geographyId, label, rows, ... }
 *   colorsForLineSeries(series, appearance) — { seriesId: color }
 *
 * Data sources:
 *   - adaptObservations input (observations, comparisons, presentation, appearance)
 *   - lib/visualization/palettes.js (comparison color assignment)
 */

import { PALETTES, assignComparisonColors, seriesColor } from "./palettes";

export function visibleComparisons(comparisons, presentation) {
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
export function lineSeries(observations, comparisons, presentation) {
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

export function colorsForLineSeries(series, appearance = {}) {
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
