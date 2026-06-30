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
    defaults: { transform: "actual", markerMode: "auto", legendPosition: "right" },
    limits: { minPeriods: 2 },
  },

  bar: {
    id: "bar",
    label: "Bar",
    purpose: "Compare values across discrete categories, places, or periods.",
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
      orientation: "vertical",
      sort: "value",
      showValueLabels: false,
    },
    limits: { maxGroups: 5, recommendTopN: 20 },
  },

  choroplethMap: {
    id: "choroplethMap",
    label: "Choropleth map",
    purpose: "Geographic variation in one measure, at a point in time or as change.",
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
    limits: { oneGeographicLevel: true },
    requiresGeometry: true, // blocked until GeoJSON/crosswalk exists (plan §7/§10)
  },

  heatmap: {
    id: "heatmap",
    label: "Matrix heatmap",
    purpose: "Patterns across many places and periods at once.",
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
    limits: { maxRows: 50, recommendSearchOver: 50 },
  },

  dumbbell: {
    id: "dumbbell",
    label: "Dumbbell",
    purpose: "Compare exactly two values per category; emphasize the gap.",
    requiredRoles: ["category", "start", "end"],
    optionalRoles: ["benchmark"],
    roleConstraints: {
      category: [DIMENSION],
      start: [MEASURE],
      end: [MEASURE],
      benchmark: [DIMENSION],
    },
    sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
    defaults: { sort: "difference", show: "values", showLabels: true },
    limits: { exactlyTwoPeriods: true, minCategories: 6, maxCategories: 20 },
    sameMetricBothEnds: true, // start/end must be the same field across two periods
  },

  scatter: {
    id: "scatter",
    label: "Scatter",
    purpose: "Relationship between two numeric measures.",
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
    limits: {},
    allowsIncomparableAxes: true, // x and y need NOT share a comparison group
  },

  bubble: {
    id: "bubble",
    label: "Bubble",
    purpose: "Scatter plus a third numeric variable encoded as point area.",
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
    limits: { sizeNonNegative: true },
    allowsIncomparableAxes: true,
  },

  slope: {
    id: "slope",
    label: "Slopegraph",
    purpose: "Directional movement between exactly two ordered conditions.",
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
    limits: { exactlyTwoPeriods: true, minCategories: 5, maxCategories: 15 },
    sameMetricBothEnds: true,
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
