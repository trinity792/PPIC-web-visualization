/**
 * previewInput.js — the one input both renderers draw from: a loaded version 3
 * answer plus the view's presentation settings, in the shape
 * `adaptObservations` and `buildChartModel` take.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * `PreviewContext` builds every preview from it. The Appearance section also
 * uses it to name the series a bar chart actually draws, so a control keyed by
 * series name (Label which series) offers the names the chart shows.
 *
 * Exports:
 *   previewInput(config, schema, result, chartType?) — adaptObservations input
 *
 * Data sources:
 *   - A loaded answer ({ observations, comparisons, geometry }) from chartData.js
 *   - The version 3 view config and its module schema
 */

import { effectiveLabels } from "@/lib/visualization/deriveLabels";

export function previewInput(config, schema, result, chartType) {
  const summaries = new Map(
    (result.comparisons || []).map((entry) => [entry.id, entry]),
  );
  return {
    chartType: chartType || config.presentation?.chartType,
    observations: result.observations || [],
    comparisons: (config.question.comparisons || []).map((comparison) => ({
      ...comparison,
      label:
        summaries.get(comparison.id)?.label ||
        comparison.label ||
        comparison.id,
    })),
    presentation: config.presentation,
    labels: effectiveLabels(config, schema),
    appearance: config.presentation?.appearance || {},
    format: config.presentation?.format || {},
    geometry: result.geometry || null,
  };
}
