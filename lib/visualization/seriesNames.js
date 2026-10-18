/**
 * seriesNames.js — the names of a chart's colored series, for the editor (the
 * palette picker's group count and the bar and dot plot series controls).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * These used to be read off the Plotly adapter's trace names for every chart
 * type. Renderer plan O removed the non-map Plotly adapters, so each type's
 * names now come from the same shared helpers its drawing uses, matching the
 * old trace names exactly: a type whose Plotly traces had no name (pie,
 * heatmap, forest) still has none.
 *
 * Exports:
 *   seriesNamesFor(input) — [name] in drawing order
 *
 * Data sources:
 *   - The same input as buildChartModel / adaptObservations (previewInput)
 */

import { adaptObservations } from "./adapters";
import { barSeries } from "./barSeries";
import { lineSeries, visibleComparisons } from "./lineSeries";

const MAP_TYPES = new Set(["choroplethMap", "symbolMap"]);

/** One name per visible comparison, as the dot plot and point charts color them. */
function comparisonNames({ observations, comparisons, presentation }) {
  return visibleComparisons(comparisons, presentation).map(
    (comparison) =>
      observations.find((row) => row.comparisonId === comparison.id)?.comparisonLabel ||
      comparison.label,
  );
}

/** The range chart named each row by its comparison. */
function rangeRowNames({ observations, comparisons }) {
  const names = new Map();
  for (const row of observations) {
    const category = row.categoryLabel || row.geographyLabel || row.comparisonLabel;
    const key = `${row.comparisonId}|${row.categoryId || row.geographyId || category}`;
    if (!names.has(key)) {
      names.set(
        key,
        comparisons.find((entry) => entry.id === row.comparisonId)?.label || row.comparisonLabel,
      );
    }
  }
  return [...names.values()];
}

function namesFor(input) {
  const { chartType, observations, comparisons, presentation } = input;
  if (chartType === "line") {
    return lineSeries(observations, comparisons, presentation).map((entry) => entry.label);
  }
  if (chartType === "bar") {
    return barSeries(observations, comparisons, presentation).map((entry) => entry.label);
  }
  if (["dotPlot", "scatter", "bubble"].includes(chartType)) return comparisonNames(input);
  if (chartType === "dumbbell") return rangeRowNames(input);
  if (MAP_TYPES.has(chartType)) {
    return (adaptObservations(input).data || []).map((trace) => trace.name);
  }
  return [];
}

export function seriesNamesFor(input) {
  return namesFor(input).filter((name) => name != null && name !== "");
}
