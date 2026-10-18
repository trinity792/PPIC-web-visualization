/**
 * pieSlices.js — the slices a pie chart draws, with the colors they take.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Used by the visx pie model (lib/visualization/models/pieModel.js) and the
 * editor's Categories panel, so both pick the same rows and name each slice the
 * same way. (The Plotly pie adapter shared it until renderer plan O removed it.)
 *
 * Exports:
 *   pieSliceNames(input) — the slice names, for the Categories panel's list
 *   pieSlices(input) — { rows, slices, derived }
 *     rows    — the observations the pie shows: the visible comparisons (or the
 *               active tab's), at the active period, or every period when the
 *               values are an average of several years
 *     slices  — [{ id, label, color }] one per row, in row order; `color` is the
 *               palette color for that slice
 *     derived — whether the rows are an average of selected years
 *
 * Data sources:
 *   - adaptObservations input (observations, comparisons, presentation, appearance)
 */

import { comparisonColors } from "./palettes";

export function pieSlices({
  observations = [],
  comparisons = [],
  presentation = {},
  appearance = {},
} = {}) {
  const visibleComparisonIds = new Set(
    comparisons
      .filter((comparison) => presentation?.comparisonVisibility?.[comparison.id] !== false)
      .map((comparison) => comparison.id),
  );
  const activeComparison = visibleComparisonIds.has(presentation?.activeTab)
    ? presentation.activeTab
    : [...visibleComparisonIds][0];
  const comparisonRows = presentation?.comparisonPresentation === "tabs"
    ? observations.filter(
        (row) => row.comparisonId === (activeComparison || observations[0]?.comparisonId),
      )
    : observations.filter((row) => visibleComparisonIds.has(row.comparisonId));
  const periods = [...new Set(comparisonRows.map((row) => row.period))];
  const activePeriod = presentation?.activePeriod ?? periods.at(-1);
  const derived = comparisonRows.some(
    (row) => row.calculation?.id === "averageSelectedYears",
  );
  const rows = derived
    ? comparisonRows
    : comparisonRows.filter((row) => row.period === activePeriod);
  // A module pie's slices are usually places (one comparison, several regions),
  // so a row is named by its category, else its place when the rows span
  // several places, else its comparison. Only a slice that IS a comparison
  // takes that comparison's own color; otherwise every place would share one.
  const comparisonCount = new Set(rows.map((row) => row.comparisonId)).size;
  const placesVary = new Set(rows.map((row) => row.geographyId ?? row.geographyLabel)).size > 1;
  const named = rows.map((row, index) => {
    const byPlace = row.categoryId == null && placesVary;
    const partId = byPlace ? row.geographyId ?? row.geographyLabel : row.categoryId;
    const partLabel = byPlace ? row.geographyLabel : row.categoryLabel;
    return {
      id: partId == null ? row.comparisonId : `${row.comparisonId}:${partId}`,
      label: partLabel && comparisonCount > 1 && row.comparisonLabel
        ? `${row.comparisonLabel}: ${partLabel}`
        : partLabel || row.comparisonLabel || `Slice ${index + 1}`,
      color: partId == null
        ? comparisons.find((comparison) => comparison.id === row.comparisonId)?.color
        : null,
    };
  });
  const colors = comparisonColors(named, appearance);
  const slices = named.map((slice) => ({ ...slice, color: colors[slice.id] }));
  return { rows, slices, derived };
}

/**
 * Every slice's name, in data order, hidden or not, so the Categories panel can
 * list a slice the reader switched off and let them switch it back on.
 */
export function pieSliceNames(input) {
  return [...new Set(pieSlices(input).slices.map((slice) => slice.label))];
}
