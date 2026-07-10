/**
 * Chart-type registry: one descriptor per chart type.
 *
 * CLIENT-SAFE (no node:fs). Each descriptor encodes the per-type requirement
 * tables from `docs/PPIC Summer 2026/trinitys_notes/main.md` ("What each graph
 * type needs"): which encoding roles are required vs optional, which field kinds
 * each role accepts (`roleConstraints`), which sidebar sections the editor should
 * render (`sidebarSections`), sensible `defaults`, and the soft `limits` the
 * validator uses to recommend a better chart when complexity gets out of hand.
 *
 * This registry is descriptive only — it holds no rendering logic. Renderers in
 * `components/charts/*` and the validator in `validation.js` read from it.
 */

import { CHART_ROLES, FIELD_KINDS } from "./fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

/**
 * Maps an encoding/binding role to the catalog `chartRole` a measure must
 * support to fill it (see `field.chartRoles`). Used by the validator and the
 * encoding sidebar to filter which measures are offered for a given role.
 */
export const CATALOG_ROLE_FOR_BINDING = Object.freeze({
  x: CHART_ROLES.X_MEASURE,
  y: CHART_ROLES.Y_MEASURE,
  start: CHART_ROLES.Y_MEASURE,
  end: CHART_ROLES.Y_MEASURE,
  size: CHART_ROLES.SIZE,
  color: CHART_ROLES.COLOR,
});

/**
 * roleConstraints values are arrays of acceptable field kinds for that role.
 * `requiredRoles` must all be bound; `optionalRoles` may be bound.
 */
export const CHART_TYPES = Object.freeze({
  line: {
    id: "line",
    label: "Line",
    purpose: "Change across an ordered sequence, usually years.",
    // Whether a change/indexed transform is meaningful for this chart type
    // (gates the Comparison section's Transform control — flagged issue 1).
    transformCapable: true,
    requiredRoles: ["x", "y"],
    optionalRoles: ["series", "color", "benchmark", "facet"],
    roleConstraints: {
      x: [TEMPORAL],
      y: [MEASURE],
      series: [DIMENSION],
      color: [DIMENSION],
      benchmark: [DIMENSION],
      facet: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { transform: "actual", markerMode: "auto", legendPosition: "right", area: false },
    // Per-control tier hints: which settings tier first reveals each control
    // (basic < moderate < advanced). Complements settingsTiers.js' global map.
    controlTiers: { transform: "moderate", area: "advanced", markerMode: "advanced", legendPosition: "moderate" },
    limits: { minPeriods: 2 },
  },

  bar: {
    id: "bar",
    label: "Bar",
    purpose: "Compare values across discrete categories, places, or periods.",
    transformCapable: true,
    requiredRoles: ["category", "y"],
    optionalRoles: ["group", "color", "facet"],
    roleConstraints: {
      category: [DIMENSION],
      y: [MEASURE],
      group: [DIMENSION],
      color: [DIMENSION],
      facet: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: {
      stackMode: "none", // none | stacked | percent
      mirror: false, // true → population-pyramid-style diverging bars (per group)
      orientation: "vertical",
      sort: "value",
      showValueLabels: false,
    },
    controlTiers: {
      stackMode: "moderate",
      mirror: "advanced",
      orientation: "moderate",
      sort: "moderate",
      showValueLabels: "advanced",
      transform: "moderate",
    },
    limits: { maxGroups: 5, recommendTopN: 20 },
  },

  choroplethMap: {
    id: "choroplethMap",
    label: "Choropleth map",
    purpose: "Geographic variation in one measure, at a point in time or as change.",
    transformCapable: true,
    requiredRoles: ["geography", "color"],
    optionalRoles: ["period"],
    roleConstraints: {
      geography: [DIMENSION],
      color: [MEASURE],
      period: [TEMPORAL],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: {
      colorScale: "sequential", // sequential | diverging
      classification: "quantile",
      bins: 5,
      showBoundaries: true,
    },
    controlTiers: {
      transform: "moderate",
      colorScale: "moderate",
      classification: "advanced",
      bins: "advanced",
      showBoundaries: "advanced",
    },
    limits: { oneGeographicLevel: true },
    requiresGeometry: true, // blocked until GeoJSON/crosswalk exists (plan §7/§10)
  },

  heatmap: {
    id: "heatmap",
    label: "Matrix heatmap",
    purpose: "Patterns across many places and periods at once.",
    transformCapable: true,
    requiredRoles: ["x", "y", "color"],
    optionalRoles: ["facet"],
    roleConstraints: {
      x: [TEMPORAL, DIMENSION],
      y: [DIMENSION],
      color: [MEASURE],
      facet: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "labels", "appearance"],
    defaults: { colorScale: "sequential", showCellValues: false, rowSort: "latest" },
    controlTiers: {
      transform: "moderate",
      colorScale: "moderate",
      showCellValues: "advanced",
      rowSort: "advanced",
    },
    limits: { maxRows: 50, recommendSearchOver: 50 },
  },

  dumbbell: {
    id: "dumbbell",
    // Renamed from "Dumbbell" — this is the base of the Range family (the dot
    // plot below is its sibling variant); the id stays "dumbbell" so saved
    // views and deep links keep working.
    label: "Range",
    purpose: "Compare exactly two values per category; emphasize the gap.",
    // Both endpoints are already raw values at two periods; a change/indexed
    // transform on top of that would be meaningless (flagged issue 1).
    transformCapable: false,
    requiredRoles: ["category", "start", "end"],
    // `point` is an optional center dot between the two ends — e.g. a point
    // estimate inside a low/high confidence interval (bring-your-own-data).
    optionalRoles: ["point", "benchmark"],
    roleConstraints: {
      category: [DIMENSION],
      start: [MEASURE],
      end: [MEASURE],
      point: [MEASURE],
      benchmark: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    // showValueAxis: show the value (x) axis + gridlines; showPointLabels: print
    // each dot's number next to it (advanced). Shared with the dotPlot variant.
    defaults: { sort: "difference", showValueAxis: true, showPointLabels: false },
    controlTiers: {
      sort: "moderate",
      showValueAxis: "moderate",
      showPointLabels: "moderate",
    },
    limits: { exactlyTwoPeriods: true, minCategories: 6, maxCategories: 20 },
    sameMetricBothEnds: true, // start/end must be the same field across two periods
  },

  dotPlot: {
    id: "dotPlot",
    label: "Dot plot",
    purpose:
      "Plot several series as coloured dots per category on a shared value axis, joined by a light range band.",
    transformCapable: false,
    // Two dimensions + one measure, like a heatmap: `y` is the category (rows),
    // `x` is the series that becomes the dots, `color` is the plotted value.
    // Shares the matrix data path; rendered as dots instead of a colour grid.
    requiredRoles: ["y", "x", "color"],
    optionalRoles: [],
    roleConstraints: {
      y: [DIMENSION],
      x: [DIMENSION],
      color: [MEASURE],
    },
    sidebarSections: ["data", "encodings", "labels", "appearance"],
    defaults: { showValueAxis: true, showPointLabels: false },
    controlTiers: {
      showValueAxis: "moderate",
      showPointLabels: "moderate",
      pointLabelSeries: "advanced",
    },
    limits: { maxGroups: 6, maxRows: 30 },
  },

  scatter: {
    id: "scatter",
    label: "Scatter",
    purpose: "Relationship between two numeric measures.",
    // x and y are two different measures; a change transform doesn't apply
    // across unrelated axes (flagged issue 1).
    transformCapable: false,
    requiredRoles: ["x", "y", "unit"],
    optionalRoles: ["color", "facet"],
    roleConstraints: {
      x: [MEASURE],
      y: [MEASURE],
      unit: [DIMENSION], // the observation unit, e.g. County
      color: [DIMENSION],
      facet: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { referenceLines: [], labelSelected: true, trendline: false },
    controlTiers: { labelSelected: "moderate", trendline: "advanced", referenceLines: "advanced" },
    limits: {},
    allowsIncomparableAxes: true, // x and y need NOT share a comparison group
  },

  bubble: {
    id: "bubble",
    label: "Bubble",
    purpose: "Scatter plus a third numeric variable encoded as point area.",
    transformCapable: false,
    requiredRoles: ["x", "y", "size", "unit"],
    optionalRoles: ["color", "facet"],
    roleConstraints: {
      x: [MEASURE],
      y: [MEASURE],
      size: [MEASURE],
      unit: [DIMENSION],
      color: [DIMENSION],
      facet: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { sizeByArea: true, opacity: 0.8, labelSelected: true },
    controlTiers: { sizeByArea: "advanced", opacity: "advanced", labelSelected: "moderate" },
    limits: { sizeNonNegative: true },
    allowsIncomparableAxes: true,
  },

  slope: {
    id: "slope",
    label: "Slopegraph",
    purpose: "Directional movement between exactly two ordered conditions.",
    transformCapable: false,
    requiredRoles: ["category", "start", "end"],
    optionalRoles: ["benchmark"],
    roleConstraints: {
      category: [DIMENSION],
      start: [MEASURE],
      end: [MEASURE],
      benchmark: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { sort: "rightValue", show: "values", showEndpointLabels: true },
    controlTiers: { sort: "moderate", show: "advanced", showEndpointLabels: "advanced" },
    limits: { exactlyTwoPeriods: true, minCategories: 5, maxCategories: 15 },
    sameMetricBothEnds: true,
  },

  pie: {
    id: "pie",
    label: "Pie / Donut",
    purpose: "Parts of a whole at a single point in time.",
    // A pie shows composition, not change; a change/indexed transform has no
    // meaning on shares of a whole (flagged issue 1).
    transformCapable: false,
    requiredRoles: ["category", "y"],
    optionalRoles: ["color"],
    roleConstraints: {
      category: [DIMENSION],
      y: [MEASURE],
      color: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "labels", "appearance"],
    // `hole` = 0 is a pie; > 0 is the donut variant (variants over new ids).
    defaults: { hole: 0, sort: "value", showValueLabels: true },
    controlTiers: { hole: "moderate", sort: "moderate", showValueLabels: "advanced" },
    limits: { maxSlices: 8, recommendGroupOthers: 8 },
  },

  symbolMap: {
    id: "symbolMap",
    label: "Symbol map",
    purpose: "Magnitude by place, sized proportionally at point locations.",
    transformCapable: false,
    requiredRoles: ["geography", "size"],
    optionalRoles: ["color"],
    roleConstraints: {
      geography: [DIMENSION],
      size: [MEASURE],
      color: [MEASURE],
    },
    sidebarSections: ["data", "encodings", "labels", "appearance"],
    defaults: { sizeByArea: true, opacity: 0.75 },
    controlTiers: { sizeByArea: "advanced", opacity: "advanced" },
    limits: { sizeNonNegative: true },
    requiresGeometry: true, // needs point coordinates for each place
  },

  dataTable: {
    id: "dataTable",
    label: "Data table",
    purpose: "The exact numbers behind a chart, searchable and sortable.",
    transformCapable: false,
    // A data table charts whatever is loaded; it binds no encoding roles.
    requiredRoles: [],
    optionalRoles: [],
    roleConstraints: {},
    sidebarSections: ["data", "labels", "appearance"],
    defaults: { search: true, sortable: true, pageSize: 25 },
    controlTiers: { search: "moderate", sortable: "moderate", pageSize: "advanced" },
    limits: {},
  },
});

/** Look up a chart descriptor by id; returns undefined for unknown types. */
export function getChartType(chartTypeId) {
  return CHART_TYPES[chartTypeId];
}

/** All chart-type ids. */
export const CHART_TYPE_IDS = Object.freeze(Object.keys(CHART_TYPES));

/** Field kinds accepted by a given role on a chart type ([] if role unknown). */
export function acceptedKindsForRole(chartTypeId, role) {
  const chart = CHART_TYPES[chartTypeId];
  return (chart && chart.roleConstraints[role]) || [];
}
