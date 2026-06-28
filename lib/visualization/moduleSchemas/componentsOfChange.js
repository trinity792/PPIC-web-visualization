/**
 * Client-safe visualization schema for the Components of Change module.
 *
 * Mirror of `moduleSchemas/pophousing.js` for the births/deaths/migration
 * dataset. SINGLE SOURCE OF TRUTH for this module's field catalog, curated
 * metric list, subsets, sources, and canonical CSV columns. CLIENT-SAFE
 * (no node:fs) — consumed by both client components and the server-only
 * `lib/data/components_of_change.js`.
 *
 * This module carries an extra `sources` axis (DoF vs Census). The two are kept
 * side-by-side by design, so the sidebar must require a deliberate source choice
 * and never compare them silently (guardrail #6).
 *
 * Comparison groups follow main.md's "allow related counts together": births,
 * deaths, natural increase, and the migration counts share one group so they can
 * sit on a single axis (e.g. "Births, deaths, and net migration over time").
 */

import { FIELD_KINDS, UNITS, isMeasure } from "../fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

const STOCK_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const COUNT_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const RATE_TRANSFORMS = ["actual", "percentagePointChange"];
const FULL_ROLES = ["xMeasure", "yMeasure", "size", "color"];
const PLANAR_ROLES = ["xMeasure", "yMeasure", "color"];

const measure = (label, unit, comparisonGroup, opts = {}) => ({
  kind: MEASURE,
  label,
  unit,
  comparisonGroup,
  aggregation: "notAllowed",
  transforms: opts.transforms || STOCK_TRANSFORMS,
  chartRoles: opts.chartRoles || FULL_ROLES,
  curated: Boolean(opts.curated),
});

const count = (label, comparisonGroup, opts = {}) =>
  measure(label, UNITS.COUNT, comparisonGroup, { transforms: COUNT_TRANSFORMS, ...opts });

const crudeRate = (label, opts = {}) =>
  measure(label, UNITS.RATE_PER_THOUSAND, "crudeRates", {
    transforms: RATE_TRANSFORMS,
    chartRoles: PLANAR_ROLES,
    curated: true,
    ...opts,
  });

export const COMPONENTS_OF_CHANGE_FIELDS = Object.freeze({
  // ----- temporal -----
  Year: { kind: TEMPORAL, label: "Year", formatter: "year" },

  // ----- dimensions -----
  Location: {
    kind: DIMENSION,
    label: "Location",
    cardinality: "high",
    supportsComparison: true,
  },
  "Geographic Level": {
    kind: DIMENSION,
    label: "Geographic level",
    values: ["County", "Region", "State"],
  },
  Source: { kind: DIMENSION, label: "Source", values: ["DoF", "Census"] },

  // ----- population stock & change -----
  "Total Population": measure("Total population", UNITS.PEOPLE, "populationStock", {
    curated: true,
  }),
  "Numeric Change in Population": measure(
    "Numeric change in population",
    UNITS.PEOPLE,
    "populationChange",
  ),
  "Percent Change in Population": measure(
    "Percent change in population",
    UNITS.PERCENT,
    "populationChangeRate",
    { transforms: RATE_TRANSFORMS, chartRoles: PLANAR_ROLES },
  ),

  // ----- component counts (share one comparison group) -----
  Births: count("Births", "componentCounts", { curated: true }),
  Deaths: count("Deaths", "componentCounts", { curated: true }),
  "Natural Increase": count("Natural increase", "componentCounts", { curated: true }),
  "Net Migration": count("Net migration", "componentCounts", { curated: true }),
  "Net Foreign Immigration": count("Net foreign immigration", "componentCounts", {
    curated: true,
  }),
  "Net Domestic Migration": count("Net domestic migration", "componentCounts", {
    curated: true,
  }),

  // ----- crude rates (per 1,000; share one comparison group) -----
  "Crude Birth Rate": crudeRate("Crude birth rate"),
  "Crude Death Rate": crudeRate("Crude death rate"),
  "Crude Migration Rate": crudeRate("Crude migration rate"),
  "Crude Domestic Migration Rate": crudeRate("Crude domestic migration rate"),
  "Crude Foreign Migration Rate": crudeRate("Crude foreign migration rate"),
});

/** Friendly subset name → Geographic Level value(s). (Was SUBSET_TO_LEVELS.) */
export const COMPONENTS_OF_CHANGE_SUBSETS = Object.freeze({
  Regions: ["Region"],
  Counties: ["County"],
  States: ["State"],
});

/** Data sources kept side-by-side; the UI must pick one deliberately. */
export const COMPONENTS_OF_CHANGE_SOURCES = Object.freeze(["DoF", "Census"]);

const measureKeys = Object.keys(COMPONENTS_OF_CHANGE_FIELDS).filter((k) =>
  isMeasure(COMPONENTS_OF_CHANGE_FIELDS[k]),
);

/** Every measure column the CSV can contain (== legacy NUMERIC_COLUMNS). */
export const COMPONENTS_OF_CHANGE_NUMERIC_COLUMNS = Object.freeze(measureKeys);

/** Curated metrics exposed in the UI selector (== legacy AVAILABLE_PARAMETERS). */
export const COMPONENTS_OF_CHANGE_CURATED_MEASURES = Object.freeze(
  measureKeys.filter((k) => COMPONENTS_OF_CHANGE_FIELDS[k].curated),
);

/** Full CSV column order (cleaned ComponentsOfChange_Current.csv header, verbatim). */
export const COMPONENTS_OF_CHANGE_CANONICAL_COLUMNS = Object.freeze([
  "Geographic Level",
  "Location",
  "Year",
  "Total Population",
  "Percent Change in Population",
  "Numeric Change in Population",
  "Births",
  "Deaths",
  "Natural Increase",
  "Net Migration",
  "Net Foreign Immigration",
  "Net Domestic Migration",
  "Crude Birth Rate",
  "Crude Death Rate",
  "Crude Migration Rate",
  "Crude Domestic Migration Rate",
  "Crude Foreign Migration Rate",
  "Source",
]);

export const COMPONENTS_OF_CHANGE_SCHEMA = Object.freeze({
  id: "components-of-change",
  label: "Components of Change",
  apiPath: "/api/components-of-change",
  fields: COMPONENTS_OF_CHANGE_FIELDS,
  canonicalColumns: COMPONENTS_OF_CHANGE_CANONICAL_COLUMNS,
  numericColumns: COMPONENTS_OF_CHANGE_NUMERIC_COLUMNS,
  curatedMeasures: COMPONENTS_OF_CHANGE_CURATED_MEASURES,
  subsets: COMPONENTS_OF_CHANGE_SUBSETS,
  sources: COMPONENTS_OF_CHANGE_SOURCES,
  yearRange: [1991, 2024], // cleaned E-6/Census coverage; drives the year slider
});
