/**
 * Client-safe visualization schema for the ACS Housing Stress module.
 *
 * Mirror of `moduleSchemas/demographicProjections.js`. SINGLE SOURCE OF TRUTH for
 * this module's field catalog, curated metric list, subsets, canonical CSV
 * columns, and the module-specific stratification filters. CLIENT-SAFE
 * (no node:fs) — consumed by both client components and the server-only
 * `lib/data/housing_stress.js`.
 *
 * Housing Stress measures housing cost burden (households paying more than 30% or
 * 50% of income on housing) split by tenure and by race/ethnicity of householder.
 * It carries four measures — a 2x2 of basis (Number vs Share) and threshold (30%
 * vs 50%) — plus two extra stratification dimensions (Race/Ethnicity and Tenure)
 * that the sidebar renders as filter controls. Each request pins one value per
 * dimension (defaulting to the "All" race and "Total" tenure rows).
 *
 * County and region figures are PUMA-based approximations (PUMAs cross county
 * lines); only the state series is an exact tabulation.
 */

import { FIELD_KINDS, UNITS, isMeasure } from "../fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

// Counts and shares never share an axis, so they use distinct comparison groups.
const NUMBER_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const SHARE_TRANSFORMS = ["actual", "numericChange", "indexed"];
const FULL_ROLES = ["xMeasure", "yMeasure", "size", "color"];

const RACE_VALUES = [
  "All", "White", "Black", "Asian", "NHPI", "AIAN", "Multiracial", "Hispanic", "Other",
];
const TENURE_VALUES = [
  "Total", "Rented", "Owned", "Owned With Mortgage", "Owned Without Mortgage",
];

export const HOUSING_STRESS_FIELDS = Object.freeze({
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
    values: ["State", "Region", "County"],
  },
  "Race/Ethnicity": { kind: DIMENSION, label: "Race/ethnicity", values: RACE_VALUES },
  Tenure: { kind: DIMENSION, label: "Tenure", values: TENURE_VALUES },

  // ----- measures (2x2 of basis x threshold) -----
  "Number Over 30%": {
    kind: MEASURE,
    label: "Households over 30%",
    unit: UNITS.COUNT,
    comparisonGroup: "housingStressCount",
    aggregation: "notAllowed",
    transforms: NUMBER_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
  "Number Over 50%": {
    kind: MEASURE,
    label: "Households over 50%",
    unit: UNITS.COUNT,
    comparisonGroup: "housingStressCount",
    aggregation: "notAllowed",
    transforms: NUMBER_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
  "Share Over 30%": {
    kind: MEASURE,
    label: "Share over 30%",
    unit: UNITS.PERCENT,
    comparisonGroup: "housingStressShare",
    aggregation: "notAllowed",
    transforms: SHARE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
  "Share Over 50%": {
    kind: MEASURE,
    label: "Share over 50%",
    unit: UNITS.PERCENT,
    comparisonGroup: "housingStressShare",
    aggregation: "notAllowed",
    transforms: SHARE_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
});

/** Friendly subset name → Geographic Level value(s). */
export const HOUSING_STRESS_SUBSETS = Object.freeze({
  Counties: ["County"],
  Regions: ["Region"],
  States: ["State"],
});

/**
 * Module-specific stratification filters the sidebar renders as extra controls.
 * Each maps to the dimension column and the default value the API pins when the
 * user has not chosen one (the "All" race and "Total" tenure base rows).
 */
export const HOUSING_STRESS_FILTER_DIMENSIONS = Object.freeze([
  { column: "Race/Ethnicity", param: "raceEthnicity", label: "Race/ethnicity", values: RACE_VALUES, default: "All" },
  { column: "Tenure", param: "tenure", label: "Tenure", values: TENURE_VALUES, default: "Total" },
]);

/**
 * The measure column is chosen by a 2x2 of basis (Number vs Share) and burden
 * threshold (30% vs 50%). The UI renders these as two toggles; the API resolves
 * them to one of the four measure columns.
 */
export const HOUSING_STRESS_BASES = Object.freeze([
  { key: "number", label: "Number of households" },
  { key: "share", label: "Share of households" },
]);
export const HOUSING_STRESS_THRESHOLDS = Object.freeze([30, 50]);
export const HOUSING_STRESS_MEASURE_MATRIX = Object.freeze({
  number: { 30: "Number Over 30%", 50: "Number Over 50%" },
  share: { 30: "Share Over 30%", 50: "Share Over 50%" },
});
export const HOUSING_STRESS_DEFAULT_BASIS = "share";
export const HOUSING_STRESS_DEFAULT_THRESHOLD = 30;

const measureKeys = Object.keys(HOUSING_STRESS_FIELDS).filter((key) =>
  isMeasure(HOUSING_STRESS_FIELDS[key]),
);

/** Every measure column the CSV can contain. */
export const HOUSING_STRESS_NUMERIC_COLUMNS = Object.freeze(measureKeys);

/** Curated metrics exposed in the UI selector. */
export const HOUSING_STRESS_CURATED_MEASURES = Object.freeze(
  measureKeys.filter((key) => HOUSING_STRESS_FIELDS[key].curated),
);

/** Full CSV column order (cleaned HousingStress_Current.csv header, verbatim). */
export const HOUSING_STRESS_CANONICAL_COLUMNS = Object.freeze([
  "Year",
  "Geographic Level",
  "Location",
  "Race/Ethnicity",
  "Tenure",
  "Number Over 30%",
  "Number Over 50%",
  "Share Over 30%",
  "Share Over 50%",
]);

export const HOUSING_STRESS_SCHEMA = Object.freeze({
  id: "housing-stress",
  label: "ACS Housing Stress",
  apiPath: "/api/housing-stress",
  fields: HOUSING_STRESS_FIELDS,
  canonicalColumns: HOUSING_STRESS_CANONICAL_COLUMNS,
  numericColumns: HOUSING_STRESS_NUMERIC_COLUMNS,
  curatedMeasures: HOUSING_STRESS_CURATED_MEASURES,
  subsets: HOUSING_STRESS_SUBSETS,
  filterDimensions: HOUSING_STRESS_FILTER_DIMENSIONS,
  bases: HOUSING_STRESS_BASES,
  thresholds: HOUSING_STRESS_THRESHOLDS,
  measureMatrix: HOUSING_STRESS_MEASURE_MATRIX,
  defaultBasis: HOUSING_STRESS_DEFAULT_BASIS,
  defaultThreshold: HOUSING_STRESS_DEFAULT_THRESHOLD,
  yearRange: [2012, 2024], // ACS 1-year coverage (2020 has no release); drives the slider
});
