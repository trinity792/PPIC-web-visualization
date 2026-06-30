/**
 * Preset registry: the basic starting points a user picks before tailoring a
 * chart. These mirror the three visualizations the legacy Jupyter notebooks
 * produced for every dataset — a LINEPLOT, a BARPLOT, and a MAP — rather than
 * the broader analytical catalog the tool grew afterward.
 *
 * Legacy reference (each module's `*_code.py` in the Previous Tool):
 *   - `visualize_line(locations, parameters, start_year, end_year, indexed)`
 *       → multi-location time series, optional base-year indexing.
 *   - `visualize_bar(subset, parameter, metric_of_change, start_year, end_year)`
 *       → places ranked by value or by percent/numeric change between two years.
 *   - `visualize_map(subset, parameter, metric_of_change, start_year, end_year)`
 *       → county/region choropleth of a value or its change.
 *
 * CLIENT-SAFE (no node:fs). Presets are GENERIC — they reference encoding *roles*
 * and field *kinds*, never specific fields like "Total Population" or places like
 * "Bay Area". A module binding (chosen field per role) is applied on top of a
 * preset at use time; the canonical field names live in the module schemas.
 *
 * Each preset declares: `chartType`, role defaults, the `sidebar` section layout
 * to render, and `constraints` the validator enforces.
 */

// LINEPLOT — multi-location trends over a year range, with optional indexing
// (the notebooks' `indexed` flag).
export const TREND_OVER_TIME = Object.freeze({
  id: "trend-over-time",
  chartType: "line",
  title: "Trends over time",
  question: "How did selected places change over the years?",
  requiredRoles: ["x", "y"],
  optionalRoles: ["series", "benchmark"],
  defaults: {
    x: { role: "temporal" },
    y: { role: "measure" },
    series: { role: "comparisonDimension", default: "Location" },
    transform: "actual",
    comparisonMode: "places",
  },
  sidebar: {
    data: true,
    encodings: ["x", "y", "series"],
    comparison: ["locations", "benchmark", "baseYear", "transform"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "legend", "tooltip"],
    appearance: ["lineStyle", "markerMode", "legendPosition"],
  },
  constraints: {
    minPeriods: 2,
    maxSeries: 6,
    // "Actual" or base-year "indexed" mirrors the notebook line plots.
    allowedTransforms: ["actual", "indexed", "percentChange"],
  },
});

// BARPLOT — places ranked for one measure; the legacy `metric_of_change`
// (percent / numeric change between two years) maps onto the transform control.
export const COMPARE_PLACES = Object.freeze({
  id: "compare-places",
  chartType: "bar",
  title: "Compare places",
  question: "Which places are highest, lowest, or changed the most?",
  requiredRoles: ["category", "y"],
  optionalRoles: ["color"],
  defaults: {
    category: { role: "comparisonDimension", default: "Location" },
    y: { role: "measure" },
    orientation: "horizontal",
    sort: "value",
    transform: "actual",
  },
  sidebar: {
    data: true,
    encodings: ["category", "y"],
    comparison: ["period", "startYear", "endYear", "topN", "sort", "transform"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "tooltip"],
    appearance: ["orientation", "showValueLabels", "legendPosition"],
  },
  constraints: {
    recommendTopN: 20,
    // Value ranking, or the notebook's numeric / percent change between years.
    allowedTransforms: ["actual", "numericChange", "percentChange"],
  },
});

// MAP — county / region choropleth of a value or its change.
export const GEOGRAPHIC_PATTERN = Object.freeze({
  id: "geographic-pattern",
  chartType: "choroplethMap",
  title: "Map",
  question: "Where is the value highest or lowest across California?",
  requiredRoles: ["geography", "color"],
  optionalRoles: ["period"],
  defaults: {
    geography: { role: "comparisonDimension", default: "Location" },
    color: { role: "measure" },
    colorScale: "sequential",
    classification: "quantile",
    transform: "actual",
  },
  sidebar: {
    data: true,
    encodings: ["geography", "color"],
    comparison: ["period", "startYear", "endYear", "transform", "colorScale", "classification", "bins"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["showBoundaries", "noDataTreatment"],
  },
  constraints: {
    oneGeographicLevel: true,
    requiresGeometry: true,
    // Value choropleth, or change-between-years (notebook `metric_of_change`).
    allowedTransforms: ["actual", "numericChange", "percentChange"],
  },
});

export const PRESETS = Object.freeze({
  [TREND_OVER_TIME.id]: TREND_OVER_TIME,
  [COMPARE_PLACES.id]: COMPARE_PLACES,
  [GEOGRAPHIC_PATTERN.id]: GEOGRAPHIC_PATTERN,
});

/** Ordered list for the preset picker (the order presets should appear in). */
export const PRESET_ORDER = Object.freeze([
  "trend-over-time",
  "compare-places",
  "geographic-pattern",
]);

export function getPreset(presetId) {
  return PRESETS[presetId];
}
