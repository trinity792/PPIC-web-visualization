/**
 * Client-safe visualization schema for the RHNA Progress Report module.
 *
 * Mirror of `moduleSchemas/housingStress.js`. SINGLE SOURCE OF TRUTH for this
 * module's field catalog, curated metric list, subsets, canonical CSV columns,
 * and the module-specific stratification filter (Income Level). CLIENT-SAFE
 * (no node:fs) — consumed by both client components and the server-only
 * `lib/data/rhna_progress.js`.
 *
 * The module tracks each California jurisdiction's progress against its Regional
 * Housing Needs Allocation (RHNA), split by the four income tiers plus a Total.
 * The contract is tidy/long on Income Level, so each request pins one level
 * (defaulting to Total) the same way Housing Stress pins race/tenure. Its
 * temporal axis is `Snapshot Date` (the biweekly HCD refresh we version), not an
 * integer year — so, like Building Permits, the data-access module carries its
 * own snapshot-aware shaping rather than the Year-based shared query shapes.
 *
 * The headline metric is `On Track Score` (pace-adjusted progress; 1.0 = on pace
 * to meet the allocation). `Status` and `Overall Category` carry the
 * four-quadrant labels (Met / Behind / On Track / Nearly / Somewhat Off / Far Off
 * / No Allocation).
 */

import { FIELD_KINDS, UNITS } from "../fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

// Counts may index/percent-change; the pace scores and shares never percent-change.
const COUNT_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const RATE_TRANSFORMS = ["actual", "numericChange", "indexed"];
const FULL_ROLES = ["xMeasure", "yMeasure", "size", "color"];

const INCOME_LEVELS = ["Total", "Very Low", "Low", "Moderate", "Above Moderate"];
const STATUS_VALUES = [
  "Met", "On Track", "Nearly On Track", "Somewhat Off Track", "Far Off Track", "Behind", "No Allocation",
];

export const RHNA_PROGRESS_FIELDS = Object.freeze({
  // ----- temporal -----
  "Snapshot Date": { kind: TEMPORAL, label: "Snapshot date", formatter: "date" },

  // ----- dimensions -----
  Location: {
    kind: DIMENSION,
    label: "Jurisdiction",
    cardinality: "high",
    supportsComparison: true,
  },
  "Geographic Level": { kind: DIMENSION, label: "Geographic level", values: ["City", "County"] },
  Region: { kind: DIMENSION, label: "Region" },
  Cycle: { kind: DIMENSION, label: "RHNA cycle" },
  "Income Level": { kind: DIMENSION, label: "Income level", values: INCOME_LEVELS },
  Status: { kind: DIMENSION, label: "Status", values: STATUS_VALUES },
  "Overall Category": { kind: DIMENSION, label: "Overall category", values: STATUS_VALUES },

  // ----- measures -----
  "On Track Score": {
    kind: MEASURE,
    label: "On track score",
    unit: UNITS.RATIO,
    comparisonGroup: "rhnaScore",
    aggregation: "notAllowed",
    transforms: RATE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
  Percent: {
    kind: MEASURE,
    label: "Percent of allocation",
    unit: UNITS.PERCENT,
    comparisonGroup: "rhnaShare",
    aggregation: "notAllowed",
    transforms: RATE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
  Units: {
    kind: MEASURE,
    label: "Units permitted",
    unit: UNITS.HOUSING_UNITS,
    comparisonGroup: "rhnaCount",
    aggregation: "notAllowed",
    transforms: COUNT_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
  RHNA: {
    kind: MEASURE,
    label: "Allocation (target)",
    unit: UNITS.HOUSING_UNITS,
    comparisonGroup: "rhnaCount",
    aggregation: "notAllowed",
    transforms: COUNT_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: false,
  },
  "Projected Units": {
    kind: MEASURE,
    label: "Projected units at pace",
    unit: UNITS.HOUSING_UNITS,
    comparisonGroup: "rhnaCount",
    aggregation: "notAllowed",
    transforms: RATE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: false,
  },
  "Overall Progress": {
    kind: MEASURE,
    label: "Overall progress (capped avg)",
    unit: UNITS.PERCENT,
    comparisonGroup: "rhnaShare",
    aggregation: "notAllowed",
    transforms: RATE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
  "Overall On Track Score": {
    kind: MEASURE,
    label: "Overall on track score",
    unit: UNITS.RATIO,
    comparisonGroup: "rhnaScore",
    aggregation: "notAllowed",
    transforms: RATE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: false,
  },
  "Tiers Met": {
    kind: MEASURE,
    label: "Tiers met (of 4)",
    unit: UNITS.COUNT,
    comparisonGroup: "rhnaTiers",
    aggregation: "notAllowed",
    transforms: ["actual", "numericChange"],
    chartRoles: FULL_ROLES,
    curated: false,
  },
  "Percent Elapsed": {
    kind: MEASURE,
    label: "Share of period elapsed",
    unit: UNITS.PERCENT,
    comparisonGroup: "rhnaElapsed",
    aggregation: "notAllowed",
    transforms: RATE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: false,
  },
});

/** Friendly subset name → Geographic Level value(s). */
export const RHNA_PROGRESS_SUBSETS = Object.freeze({
  Jurisdictions: ["City", "County"],
  Cities: ["City"],
  Counties: ["County"],
});

/**
 * Module-specific stratification filter the sidebar renders as an extra control.
 * The contract is long on Income Level; each request pins one value (default
 * Total, the compensatory roll-up).
 */
export const RHNA_PROGRESS_FILTER_DIMENSIONS = Object.freeze([
  {
    column: "Income Level",
    param: "incomeLevel",
    label: "Income level",
    values: INCOME_LEVELS,
    default: "Total",
  },
]);

/** Every measure column the CSV can contain (numeric parse targets). */
export const RHNA_PROGRESS_NUMERIC_COLUMNS = Object.freeze([
  "Units",
  "RHNA",
  "Percent",
  "Projected Units",
  "On Track Score",
  "Total Days",
  "Elapsed Days",
  "Percent Elapsed",
  "Tiers Met",
  "Tiers With Goal",
  "Overall Progress",
  "Overall On Track Score",
]);

/** Curated metrics exposed in the UI selector. */
export const RHNA_PROGRESS_CURATED_MEASURES = Object.freeze(
  Object.keys(RHNA_PROGRESS_FIELDS).filter((key) => RHNA_PROGRESS_FIELDS[key].curated),
);

/** Full CSV column order (cleaned RHNAProgress_Current.csv header, verbatim). */
export const RHNA_PROGRESS_CANONICAL_COLUMNS = Object.freeze([
  "Income Level",
  "Units",
  "RHNA",
  "Percent",
  "Projected Units",
  "On Track Score",
  "Status",
  "Jurisdiction",
  "Geographic Level",
  "County",
  "Region",
  "Cycle",
  "Planning Period",
  "Planning Period Start",
  "Planning Period End",
  "Cycle Started",
  "Snapshot Date",
  "Most Recent",
  "Total Days",
  "Elapsed Days",
  "Percent Elapsed",
  "Tiers Met",
  "Tiers With Goal",
  "Overall Progress",
  "Overall On Track Score",
  "Overall Category",
  "Source Last Updated",
]);

/** Ordered status/category buckets and their palette roles for consistent coloring. */
export const RHNA_STATUS_ORDER = Object.freeze(STATUS_VALUES);

export const RHNA_PROGRESS_SCHEMA = Object.freeze({
  id: "rhna-progress",
  label: "RHNA Progress Report",
  apiPath: "/api/rhna-progress",
  fields: RHNA_PROGRESS_FIELDS,
  canonicalColumns: RHNA_PROGRESS_CANONICAL_COLUMNS,
  numericColumns: RHNA_PROGRESS_NUMERIC_COLUMNS,
  curatedMeasures: RHNA_PROGRESS_CURATED_MEASURES,
  subsets: RHNA_PROGRESS_SUBSETS,
  filterDimensions: RHNA_PROGRESS_FILTER_DIMENSIONS,
  incomeLevels: INCOME_LEVELS,
  statusOrder: STATUS_VALUES,
  // The temporal axis is a snapshot date, not a year range. Deliberately no
  // `yearRange`: with a single snapshot at launch there is no trend to plot, so
  // the sidebar's temporal/period controls stay hidden (hasTemporalData === false)
  // and the module opens on the cross-sectional ranking view instead.
  temporalField: "Snapshot Date",
  // Opens on the "compare places" ranking (bar) rather than a trend line, and only
  // offers chart types the snapshot-cross-section supports. The trend line over
  // Snapshot Date is deferred until several biweekly snapshots have accumulated;
  // maps are omitted (no jurisdiction-level geometry).
  defaultPreset: "compare-places",
  supportedChartTypes: ["bar"],
});
