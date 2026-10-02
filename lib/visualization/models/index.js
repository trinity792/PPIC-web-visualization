/**
 * models/index.js — turns observations into a chart model for the visx charts.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * A chart model is a plain description of what to draw (series, points, axis
 * ranges, labels), built before any drawing happens. `buildChartModel` takes
 * the same input as `adaptObservations` (lib/visualization/adapters), so
 * `PreviewContext` can hand one input to whichever renderer the registry picks.
 *
 * Each Stage 3 chart workstream of the renderer plan adds its builder to
 * MODEL_BUILDERS, and its chart type to `VISX_CHART_TYPES` in chartRegistry.js,
 * in the same change. Until then a type reports the adapters' "No adapter" error.
 *
 * Exports:
 *   buildChartModel(input) — { chartType, ... } for a registered visx chart type
 *
 * Data sources:
 *   - adaptObservations input, via PreviewContext
 */

import { buildBarModel } from "./barModel";
import { buildLineModel } from "./lineModel";
import { buildRangeModel } from "./rangeModel";

// chartType → (input) => model.
const MODEL_BUILDERS = Object.freeze({
  line: buildLineModel,
  bar: buildBarModel,
  dumbbell: buildRangeModel,
});

export function buildChartModel(input) {
  const build = Object.hasOwn(MODEL_BUILDERS, input?.chartType ?? "")
    ? MODEL_BUILDERS[input.chartType]
    : null;
  if (!build) {
    throw new Error(`No observation adapter is registered for ${input?.chartType}.`);
  }
  return { chartType: input.chartType, ...build(input) };
}
