/**
 * Return the editor selections a v3 question still needs before it can run.
 * An unfinished question is normal authoring state, so the preview uses this
 * list for its chart-shaped prompt and deliberately sends no API request.
 */
export function missingQuestionSelections(spec, schema) {
  if (spec?.version !== 3) return [];

  const missing = new Set();
  const question = spec.question || {};
  const comparisons = question.comparisons || [];
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

  const timeIncomplete =
    !time.contract ||
    (time.contract === "range" && (time.startYear == null || time.endYear == null)) ||
    (time.contract === "snapshot" && time.year == null) ||
    (time.contract === "selectedSnapshots" && !(time.years || []).length) ||
    (time.contract === "twoPeriods" &&
      (time.startYear == null || time.endYear == null));
  if (timeIncomplete) missing.add("Time");

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
