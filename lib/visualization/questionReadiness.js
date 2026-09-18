import { unboundInlineRoles } from "./inlineQuestion";
import { roleLabel } from "./roleLabels";

/**
 * Return the editor selections a v3 question still needs before it can run.
 * An unfinished question is normal authoring state, so the preview uses this
 * list for its chart-shaped prompt and deliberately sends no API request.
 */
function timeIsIncomplete(time = {}, schema) {
  // A module that publishes no static period list (RHNA Progress, whose
  // snapshot history is not yet stable enough to list) resolves a bare
  // "snapshot" server-side to its latest row, so there is no year to select.
  const hasPeriodsToPick = (schema?.time?.availablePeriods || []).length > 0;
  return (
    !time.contract ||
    (time.contract === "range" && (time.startYear == null || time.endYear == null)) ||
    (time.contract === "snapshot" && time.year == null && hasPeriodsToPick) ||
    (time.contract === "selectedSnapshots" && !(time.years || []).length) ||
    (time.contract === "twoPeriods" && (time.startYear == null || time.endYear == null))
  );
}

export function missingQuestionSelections(spec, schema) {
  if (spec?.version !== 3) return [];

  const missing = new Set();
  const question = spec.question || {};
  const comparisons = question.comparisons || [];
  const chartType = spec.presentation?.chartType;

  if (question.dataset?.kind === "inline") {
    // Bring-your-own-data: the question is complete once the table is here and
    // every role the chart requires points at one of its columns. Comparisons
    // are derived from the table, not chosen, and there is no geography.
    const table = question.dataset.inline;
    if (!table) {
      missing.add("Data");
    } else {
      for (const role of unboundInlineRoles(chartType, table, question.dataset.bindings)) {
        missing.add(roleLabel(role, chartType));
      }
    }
    if (timeIsIncomplete(question.time, schema)) missing.add("Time");
    return [...missing];
  }
  const dimensions = schema?.comparisonDimensions || [];
  const hasGeography = Object.keys(schema?.subsets || {}).length > 0;
  const time = question.time || {};

  if (!comparisons.length) missing.add("Comparison");
  for (const comparison of comparisons) {
    for (const dimension of dimensions) {
      const value = comparison.dimensions?.[dimension.id];
      if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
        missing.add(dimension.label || schema?.fields?.[dimension.id]?.label || dimension.id);
      }
    }
  }

  if (timeIsIncomplete(time, schema)) missing.add("Time");

  if (hasGeography) {
    const geographies = comparisons.length
      ? comparisons.map((comparison) => comparison.geography || question.geography)
      : [question.geography];

    if (geographies.some((geography) => !geography?.subset)) {
      missing.add("Geographic level");
    }

    // An empty selection is unfinished authoring state for every non-map
    // presentation. In particular, clearing a Bar after Select all must not be
    // reinterpreted by the service as "all places" and leave the old chart on
    // screen. Map-shaped charts may still intentionally show every feature at
    // their selected level.
    if (
      !["choroplethMap", "symbolMap"].includes(spec.presentation?.chartType) &&
      geographies.some((geography) => !geography?.locations?.length)
    ) {
      missing.add("Location");
    }
  }

  return [...missing];
}

export default missingQuestionSelections;
