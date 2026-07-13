/**
 * Client-safe visualization schema for the Population & Housing module.
 *
 * SINGLE SOURCE OF TRUTH for this module's field catalog, curated metric list,
 * geographic subsets, and canonical CSV columns. It is CLIENT-SAFE (no node:fs),
 * so it is consumed BOTH by `"use client"` chart components AND by the
 * server-only `lib/data/pop_housing.js` access module — eliminating the
 * parameter/subset lists those previously each re-declared.
 *
 * Field metadata mirrors the "Shared field catalog" (POPHOUSING_FIELDS) in
 * `docs/PPIC Summer 2026/trinitys_notes/main.md`. Canonical column names match the
 * cleaned CSV header exactly and must not be edited as "display labels"
 * (guardrail #1). Per-region/level definitions remain owned by
 * `lib/pophousing_config.py` on the Python side.
 */

import { FIELD_KINDS, UNITS, isMeasure } from "../fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

// Transform/role presets to keep the catalog below readable.
const STOCK_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const RATE_TRANSFORMS = ["actual", "percentagePointChange"];
const FULL_ROLES = ["xMeasure", "yMeasure", "size", "color"];
const PLANAR_ROLES = ["xMeasure", "yMeasure", "color"]; // no "size" for rates/ratios

const measure = (label, unit, comparisonGroup, opts = {}) => ({
  kind: MEASURE,
  label,
  unit,
  comparisonGroup,
  aggregation: "notAllowed", // pre-computed metrics are never summed (guardrail #4)
  transforms: opts.transforms || STOCK_TRANSFORMS,
  chartRoles: opts.chartRoles || FULL_ROLES,
  curated: Boolean(opts.curated),
});

/**
 * The catalog. Keys are canonical field names (== CSV columns for data fields).
 */
export const POPHOUSING_FIELDS = Object.freeze({
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
    values: ["City", "Town", "County", "Region", "State"],
  },
  // Per-row provenance now flows through to the output (refactor guide B3):
  // E-5 (modern), E-8 (historical baseline), Aggregated (region/state rollups).
  Source: { kind: DIMENSION, label: "Source", values: ["E-5", "E-8", "Aggregated"] },

  // ----- measures: population stock -----
  "Total Population": measure("Total population", UNITS.PEOPLE, "populationStock", {
    curated: true,
  }),
  "Household Population": measure("Household population", UNITS.PEOPLE, "populationStock"),
  "Group Quarters Population": measure(
    "Group quarters population",
    UNITS.PEOPLE,
    "populationStock",
  ),

  // ----- measures: housing stock -----
  "Total Housing Units": measure("Total housing units", UNITS.HOUSING_UNITS, "housingStock", {
    curated: true,
  }),
  "Single Family Units": measure("Single-family units", UNITS.HOUSING_UNITS, "housingStock", {
    curated: true,
  }),
  "Multiple Family Units": measure(
    "Multiple-family units",
    UNITS.HOUSING_UNITS,
    "housingStock",
    { curated: true },
  ),
  "Mobile Homes": measure("Mobile homes", UNITS.HOUSING_UNITS, "housingStock"),
  "Occupied Units": measure("Occupied units", UNITS.HOUSING_UNITS, "housingStock"),
  "Single Family Detached Units": measure(
    "Single-family detached units",
    UNITS.HOUSING_UNITS,
    "housingStock",
  ),
  "Single Family Attached Units": measure(
    "Single-family attached units",
    UNITS.HOUSING_UNITS,
    "housingStock",
  ),
  "Two to Four Family Units": measure(
    "Two-to-four-family units",
    UNITS.HOUSING_UNITS,
    "housingStock",
  ),
  "Five Plus Family Units": measure(
    "Five-plus-family units",
    UNITS.HOUSING_UNITS,
    "housingStock",
  ),
  "Vacant Units": measure("Vacant units", UNITS.HOUSING_UNITS, "housingStock"),

  // ----- measures: rates / ratios -----
  "Vacancy Rate (%)": measure("Vacancy rate", UNITS.PERCENT, "housingRate", {
    transforms: RATE_TRANSFORMS,
    chartRoles: PLANAR_ROLES,
    curated: true,
  }),
  "Persons Per Household": measure("Persons per household", UNITS.RATIO, "household", {
    chartRoles: PLANAR_ROLES,
    curated: true,
  }),
});

/** Friendly subset name → Geographic Level value(s). (Was SUBSET_TO_LEVELS.) */
export const POPHOUSING_SUBSETS = Object.freeze({
  Regions: ["Region"],
  Counties: ["County"],
  Cities: ["City"],
  Towns: ["Town"],
  State: ["State"],
});

// Derived, in catalog order, so the data layer stays in lockstep with the catalog.
const measureKeys = Object.keys(POPHOUSING_FIELDS).filter((k) =>
  isMeasure(POPHOUSING_FIELDS[k]),
);

/** Every measure column the CSV can contain (== legacy NUMERIC_COLUMNS). */
export const POPHOUSING_NUMERIC_COLUMNS = Object.freeze(measureKeys);

/** Curated metrics exposed in the UI selector (== legacy AVAILABLE_PARAMETERS). */
export const POPHOUSING_CURATED_MEASURES = Object.freeze(
  measureKeys.filter((k) => POPHOUSING_FIELDS[k].curated),
);

/** Full CSV column order (cleaned PopHousing_Current.csv header, verbatim). */
export const POPHOUSING_CANONICAL_COLUMNS = Object.freeze([
  "Geographic Level",
  "Location",
  "Year",
  "Total Population",
  "Household Population",
  "Group Quarters Population",
  "Total Housing Units",
  "Single Family Units",
  "Multiple Family Units",
  "Mobile Homes",
  "Occupied Units",
  "Vacancy Rate (%)",
  "Persons Per Household",
  "Single Family Detached Units",
  "Single Family Attached Units",
  "Two to Four Family Units",
  "Five Plus Family Units",
  "Vacant Units",
  "Source",
]);

export const POPHOUSING_SCHEMA = Object.freeze({
  id: "pophousing",
  label: "Population & Housing",
  apiPath: "/api/pophousing",
  fields: POPHOUSING_FIELDS,
  canonicalColumns: POPHOUSING_CANONICAL_COLUMNS,
  numericColumns: POPHOUSING_NUMERIC_COLUMNS,
  curatedMeasures: POPHOUSING_CURATED_MEASURES,
  subsets: POPHOUSING_SUBSETS,
  sources: null, // Source is a multi-select provenance filter, not a dataset toggle
  // Renders a Source multi-select (E-5/E-8/Aggregated) that defaults to all, as a
  // provenance filter rather than a mutually-exclusive dataset toggle (B3).
  provenanceFilter: true,
  // Exposes an "Update data" button that triggers a server-side pipeline refresh
  // (POST {apiPath}/update), so a researcher can pull the latest DoF release
  // without touching the codebase (refactor guide A2).
  refreshable: true,
  yearRange: [1991, 2026], // cleaned E-5 coverage (through the latest DoF vintage)
});
