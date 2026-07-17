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

// DIVERGING RANKING — places ranked around a reference value (e.g. a pace ratio
// diverging from 1.0), sharing the compare-places category/measure contract.
export const DIVERGING_RANKING = Object.freeze({
  id: "diverging-ranking",
  chartType: "divergingBar",
  title: "Diverging ranking",
  question: "Which places sit above or below a reference value?",
  requiredRoles: ["category", "y"],
  optionalRoles: ["color"],
  defaults: {
    category: { role: "comparisonDimension", default: "Location" },
    y: { role: "measure" },
    orientation: "horizontal",
    center: 0,
    sort: "value",
    transform: "actual",
  },
  sidebar: {
    data: true,
    encodings: ["category", "y"],
    comparison: ["period", "startYear", "endYear", "topN", "sort", "transform"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "tooltip"],
    appearance: ["orientation", "center", "showValueLabels", "legendPosition"],
  },
  constraints: {
    recommendTopN: 20,
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

// The broader analytical catalog the tool grew beyond the notebook trio. These
// give every chart type at least one generic starting point (closes the
// issue-2 gap: a chart type with no preset can't be reached from the picker).
// Each references encoding roles only; a module binding is applied at use time.

export const TWO_PERIOD_GAP = Object.freeze({
  id: "two-period-gap",
  chartType: "dumbbell",
  title: "Two-period gap",
  question: "How far apart are two points in time for each place?",
  requiredRoles: ["category", "start", "end"],
  optionalRoles: ["benchmark"],
  defaults: { sort: "difference" },
  sidebar: {
    data: true,
    encodings: ["category", "start", "end"],
    comparison: ["startYear", "endYear", "sort"],
    labels: ["title", "subtitle", "xAxis", "tooltip"],
    appearance: ["showLabels", "legendPosition"],
  },
  constraints: { exactlyTwoPeriods: true },
});

export const MULTI_SERIES_DOTS = Object.freeze({
  id: "multi-series-dots",
  chartType: "dotPlot",
  title: "Dot plot",
  question: "How do several series compare within each category on a shared value axis?",
  requiredRoles: ["y", "x", "color"],
  optionalRoles: [],
  defaults: { showValueAxis: true, showPointLabels: false },
  sidebar: {
    data: true,
    encodings: ["y", "x", "color"],
    labels: ["title", "subtitle", "xAxis", "tooltip"],
    appearance: ["showValueAxis", "showPointLabels", "legendPosition"],
  },
  constraints: {},
});

export const FOREST_PLOT = Object.freeze({
  id: "forest-plot",
  chartType: "forest",
  title: "Forest plot",
  question:
    "How do each study's estimate and confidence interval compare against a line of no effect?",
  requiredRoles: ["category", "start", "end"],
  optionalRoles: ["point"],
  defaults: {
    showValueAxis: true,
    endpointStyle: "caps",
    pointStyle: "square",
  },
  sidebar: {
    data: true,
    encodings: ["category", "start", "end", "point"],
    labels: ["title", "subtitle", "xAxis", "tooltip"],
    appearance: [
      "endpointStyle",
      "pointStyle",
      "noEffectValue",
      "showValueAxis",
      "showPointLabels",
      "legendPosition",
    ],
  },
  constraints: {},
});

export const TWO_PERIOD_SLOPE = Object.freeze({
  id: "two-period-slope",
  chartType: "slope",
  title: "Two-period slope",
  question: "Which places rose or fell between two points in time?",
  requiredRoles: ["category", "start", "end"],
  optionalRoles: ["benchmark"],
  defaults: { sort: "rightValue" },
  sidebar: {
    data: true,
    encodings: ["category", "start", "end"],
    comparison: ["startYear", "endYear", "sort"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["showEndpointLabels", "legendPosition"],
  },
  constraints: { exactlyTwoPeriods: true },
});

export const RELATIONSHIP = Object.freeze({
  id: "relationship",
  chartType: "scatter",
  title: "Relationship",
  question: "How do two measures relate across places?",
  requiredRoles: ["x", "y", "unit"],
  optionalRoles: ["color"],
  defaults: { labelSelected: true },
  sidebar: {
    data: true,
    encodings: ["x", "y", "unit", "color"],
    comparison: ["period"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "tooltip"],
    appearance: ["opacity", "legendPosition"],
  },
  constraints: { allowsIncomparableAxes: true },
});

export const RELATIONSHIP_SIZED = Object.freeze({
  id: "relationship-sized",
  chartType: "bubble",
  title: "Relationship with magnitude",
  question: "How do two measures relate, weighted by a third?",
  requiredRoles: ["x", "y", "size", "unit"],
  optionalRoles: ["color"],
  defaults: { sizeByArea: true },
  sidebar: {
    data: true,
    encodings: ["x", "y", "size", "unit", "color"],
    comparison: ["period"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "tooltip"],
    appearance: ["opacity", "legendPosition"],
  },
  constraints: { allowsIncomparableAxes: true, sizeNonNegative: true },
});

export const MATRIX_HEATMAP = Object.freeze({
  id: "matrix-heatmap",
  chartType: "heatmap",
  title: "Matrix heatmap",
  question: "What patterns show up across many places and periods at once?",
  requiredRoles: ["x", "y", "color"],
  optionalRoles: [],
  defaults: { colorScale: "sequential" },
  sidebar: {
    data: true,
    encodings: ["x", "y", "color"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["colorScale", "showCellValues"],
  },
  constraints: { recommendSearchOver: 50 },
});

export const COMPOSITION = Object.freeze({
  id: "composition",
  chartType: "pie",
  title: "Composition",
  question: "How does a single total split into parts?",
  requiredRoles: ["category", "y"],
  optionalRoles: ["color"],
  defaults: { hole: 0 },
  sidebar: {
    data: true,
    encodings: ["category", "y"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["hole", "showValueLabels", "legendPosition"],
  },
  constraints: { recommendGroupOthers: 8 },
});

export const SYMBOL_MAP = Object.freeze({
  id: "symbol-map",
  chartType: "symbolMap",
  title: "Symbol map",
  question: "Where are the largest and smallest magnitudes across places?",
  requiredRoles: ["geography", "size"],
  optionalRoles: ["color"],
  defaults: { sizeByArea: true },
  sidebar: {
    data: true,
    encodings: ["geography", "size", "color"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["opacity", "legendPosition"],
  },
  constraints: { requiresGeometry: true, sizeNonNegative: true },
});

export const DATA_TABLE = Object.freeze({
  id: "data-table",
  chartType: "dataTable",
  title: "Data table",
  question: "What are the exact numbers behind the chart?",
  requiredRoles: [],
  optionalRoles: [],
  defaults: { search: true, sortable: true, pageSize: 25 },
  sidebar: {
    data: true,
    labels: ["title", "subtitle"],
    appearance: ["search", "sortable", "pageSize"],
  },
  constraints: {},
});

export const PRESETS = Object.freeze({
  [TREND_OVER_TIME.id]: TREND_OVER_TIME,
  [COMPARE_PLACES.id]: COMPARE_PLACES,
  [DIVERGING_RANKING.id]: DIVERGING_RANKING,
  [GEOGRAPHIC_PATTERN.id]: GEOGRAPHIC_PATTERN,
  [TWO_PERIOD_GAP.id]: TWO_PERIOD_GAP,
  [MULTI_SERIES_DOTS.id]: MULTI_SERIES_DOTS,
  [FOREST_PLOT.id]: FOREST_PLOT,
  [TWO_PERIOD_SLOPE.id]: TWO_PERIOD_SLOPE,
  [RELATIONSHIP.id]: RELATIONSHIP,
  [RELATIONSHIP_SIZED.id]: RELATIONSHIP_SIZED,
  [MATRIX_HEATMAP.id]: MATRIX_HEATMAP,
  [COMPOSITION.id]: COMPOSITION,
  [SYMBOL_MAP.id]: SYMBOL_MAP,
  [DATA_TABLE.id]: DATA_TABLE,
});

/** Ordered list for the preset picker (the order presets should appear in). */
export const PRESET_ORDER = Object.freeze([
  "trend-over-time",
  "compare-places",
  "diverging-ranking",
  "geographic-pattern",
  "two-period-gap",
  "multi-series-dots",
  "forest-plot",
  "two-period-slope",
  "relationship",
  "relationship-sized",
  "matrix-heatmap",
  "composition",
  "symbol-map",
  "data-table",
]);

export function getPreset(presetId) {
  return PRESETS[presetId];
}
