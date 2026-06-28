/**
 * Preset registry: task-based starting points, organized by the analytical
 * question a user is asking rather than by chart type ("Trend over time" instead
 * of "Line"). Ports main.md §6 ("Recommended general presets") and the
 * TREND_OVER_TIME model verbatim.
 *
 * CLIENT-SAFE (no node:fs). Presets are GENERIC — they reference encoding *roles*
 * and field *kinds*, never specific fields like "Total Population" or places like
 * "Bay Area". A module binding (chosen field per role) is applied on top of a
 * preset at use time; the canonical field names live in the module schemas.
 *
 * Each preset declares: `chartType`, role defaults, the `sidebar` section layout
 * to render, and `constraints` the validator enforces.
 */

/** The model preset, ported verbatim from main.md "Shared preset model". */
export const TREND_OVER_TIME = Object.freeze({
  id: "trend-over-time",
  chartType: "line",
  title: "Trend over time",
  question: "How did selected places change?",
  requiredRoles: ["x", "y"],
  optionalRoles: ["series", "benchmark", "facet"],
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
    allowedTransforms: ["actual", "indexed", "percentChange", "differenceFromBenchmark"],
  },
});

export const GROWTH_COMPARISON = Object.freeze({
  id: "growth-comparison",
  chartType: "line",
  title: "Growth comparison",
  question: "Which places grew faster?",
  requiredRoles: ["x", "y"],
  optionalRoles: ["series", "benchmark", "facet"],
  defaults: {
    x: { role: "temporal" },
    y: { role: "measure" },
    series: { role: "comparisonDimension", default: "Location" },
    transform: "indexed", // proportional growth from a base year
    comparisonMode: "places",
  },
  sidebar: {
    data: true,
    encodings: ["x", "y", "series"],
    comparison: ["locations", "benchmark", "baseYear", "transform"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "legend", "tooltip"],
    appearance: ["lineStyle", "markerMode", "legendPosition"],
  },
  constraints: { minPeriods: 2, maxSeries: 6, allowedTransforms: ["indexed", "percentChange"] },
});

export const LATEST_YEAR_RANKING = Object.freeze({
  id: "latest-year-ranking",
  chartType: "bar",
  title: "Latest-year ranking",
  question: "Which places are highest or lowest?",
  requiredRoles: ["category", "y"],
  optionalRoles: ["group", "color"],
  defaults: {
    category: { role: "comparisonDimension", default: "Location" },
    y: { role: "measure" },
    orientation: "horizontal",
    sort: "value",
    transform: "actual",
  },
  sidebar: {
    data: true,
    encodings: ["category", "y", "group"],
    comparison: ["period", "topN", "sort"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "tooltip"],
    appearance: ["orientation", "showValueLabels"],
  },
  constraints: { recommendTopN: 20, allowedTransforms: ["actual", "numericChange", "percentChange"] },
});

export const TWO_PERIOD_CHANGE = Object.freeze({
  id: "two-period-change",
  chartType: "dumbbell",
  title: "Two-period change",
  question: "How did places move between two years?",
  requiredRoles: ["category", "start", "end"],
  optionalRoles: ["benchmark"],
  defaults: {
    category: { role: "comparisonDimension", default: "Location" },
    start: { role: "measure" },
    end: { role: "measure" },
    sort: "difference",
    show: "values",
  },
  sidebar: {
    data: true,
    encodings: ["category", "start", "end"],
    comparison: ["startYear", "endYear", "sort", "benchmark"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["showLabels"],
  },
  constraints: { exactlyTwoPeriods: true, minCategories: 6, maxCategories: 20 },
});

export const BEFORE_AFTER_RANK = Object.freeze({
  id: "before-after-rank",
  chartType: "slope",
  title: "Before-and-after rank",
  question: "Which places gained or lost rank?",
  requiredRoles: ["category", "start", "end"],
  optionalRoles: ["benchmark"],
  defaults: {
    category: { role: "comparisonDimension", default: "Location" },
    start: { role: "measure" },
    end: { role: "measure" },
    show: "rank",
    sort: "rightValue",
  },
  sidebar: {
    data: true,
    encodings: ["category", "start", "end"],
    comparison: ["startYear", "endYear", "sort"],
    labels: ["title", "subtitle"],
    appearance: ["showEndpointLabels", "show"],
  },
  constraints: { exactlyTwoPeriods: true, minCategories: 5, maxCategories: 15 },
});

export const GEOGRAPHIC_PATTERN = Object.freeze({
  id: "geographic-pattern",
  chartType: "choroplethMap",
  title: "Geographic pattern",
  question: "Where is the value highest or lowest?",
  requiredRoles: ["geography", "color"],
  optionalRoles: ["period"],
  defaults: {
    geography: { role: "comparisonDimension", default: "Location" },
    color: { role: "measure" },
    colorScale: "sequential",
    classification: "quantile",
  },
  sidebar: {
    data: true,
    encodings: ["geography", "color"],
    comparison: ["period", "colorScale", "classification", "bins"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["showBoundaries", "noDataTreatment"],
  },
  constraints: { oneGeographicLevel: true, requiresGeometry: true },
});

export const PATTERN_OVER_TIME = Object.freeze({
  id: "pattern-over-time",
  chartType: "heatmap",
  title: "Pattern over time",
  question: "When and where did values change?",
  requiredRoles: ["x", "y", "color"],
  optionalRoles: [],
  defaults: {
    x: { role: "temporal" },
    y: { role: "comparisonDimension", default: "Location" },
    color: { role: "measure" },
    colorScale: "diverging",
    rowSort: "latest",
  },
  sidebar: {
    data: true,
    encodings: ["x", "y", "color"],
    comparison: ["yearRange", "rowSort"],
    labels: ["title", "subtitle", "tooltip"],
    appearance: ["colorScale", "showCellValues"],
  },
  constraints: { maxRows: 50 },
});

export const RELATIONSHIP_EXPLORER = Object.freeze({
  id: "relationship-explorer",
  chartType: "scatter",
  title: "Relationship explorer",
  question: "How do two measures move together?",
  requiredRoles: ["x", "y", "unit"],
  optionalRoles: ["color", "facet"],
  defaults: {
    x: { role: "measure" },
    y: { role: "measure" },
    unit: { role: "comparisonDimension", default: "Location" },
    labelSelected: true,
  },
  sidebar: {
    data: true,
    encodings: ["x", "y", "unit", "color"],
    comparison: ["period", "referenceLines"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "tooltip"],
    appearance: ["labelSelected", "trendline"],
  },
  constraints: { allowsIncomparableAxes: true },
});

export const SCALE_AWARE_RELATIONSHIP = Object.freeze({
  id: "scale-aware-relationship",
  chartType: "bubble",
  title: "Scale-aware relationship",
  question: "Which places are largest within that relationship?",
  requiredRoles: ["x", "y", "size", "unit"],
  optionalRoles: ["color", "facet"],
  defaults: {
    x: { role: "measure" },
    y: { role: "measure" },
    size: { role: "measure" },
    unit: { role: "comparisonDimension", default: "Location" },
    sizeByArea: true,
  },
  sidebar: {
    data: true,
    encodings: ["x", "y", "size", "unit", "color"],
    comparison: ["period", "referenceLines", "sizeRange"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "tooltip"],
    appearance: ["labelSelected", "opacity"],
  },
  constraints: { allowsIncomparableAxes: true, sizeNonNegative: true },
});

export const COMPOSITION = Object.freeze({
  id: "composition",
  chartType: "bar",
  title: "Composition",
  question: "What makes up a total?",
  requiredRoles: ["category", "y", "group"],
  optionalRoles: ["color"],
  defaults: {
    category: { role: "comparisonDimension", default: "Location" },
    y: { role: "measure" },
    group: { role: "comparisonDimension" },
    stackMode: "stacked",
    transform: "actual",
  },
  sidebar: {
    data: true,
    encodings: ["category", "y", "group"],
    comparison: ["period", "stackMode", "sort"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "legend", "tooltip"],
    appearance: ["orientation", "showValueLabels"],
  },
  // Stacked bars need additive parts; never stack rates (guardrail #4).
  constraints: { additivePartsOnly: true, allowedTransforms: ["actual"] },
});

export const PRESETS = Object.freeze({
  [TREND_OVER_TIME.id]: TREND_OVER_TIME,
  [GROWTH_COMPARISON.id]: GROWTH_COMPARISON,
  [LATEST_YEAR_RANKING.id]: LATEST_YEAR_RANKING,
  [TWO_PERIOD_CHANGE.id]: TWO_PERIOD_CHANGE,
  [BEFORE_AFTER_RANK.id]: BEFORE_AFTER_RANK,
  [GEOGRAPHIC_PATTERN.id]: GEOGRAPHIC_PATTERN,
  [PATTERN_OVER_TIME.id]: PATTERN_OVER_TIME,
  [RELATIONSHIP_EXPLORER.id]: RELATIONSHIP_EXPLORER,
  [SCALE_AWARE_RELATIONSHIP.id]: SCALE_AWARE_RELATIONSHIP,
  [COMPOSITION.id]: COMPOSITION,
});
// NOTE: "Population-change drivers" (waterfall / diverging bar) from main.md §6 is
// deferred until a waterfall chart type exists in chartRegistry.js (plan M2+).

/** Ordered list for the preset picker (the order presets should appear in). */
export const PRESET_ORDER = Object.freeze([
  "trend-over-time",
  "growth-comparison",
  "latest-year-ranking",
  "two-period-change",
  "before-after-rank",
  "geographic-pattern",
  "pattern-over-time",
  "relationship-explorer",
  "scale-aware-relationship",
  "composition",
]);

export function getPreset(presetId) {
  return PRESETS[presetId];
}
