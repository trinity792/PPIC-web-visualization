/**
 * Client-safe visualization schema for the Age, Sex & Race Projections module.
 *
 * Mirror of `moduleSchemas/componentsOfChange.js`. SINGLE SOURCE OF TRUTH for
 * this module's field catalog, curated metric list, subsets, sources, canonical
 * CSV columns, and the module-specific stratification filters. CLIENT-SAFE
 * (no node:fs) — consumed by both client components and the server-only
 * `lib/data/demographic_projections.js`.
 *
 * Unlike PopHousing and Components of Change, this module has a single measure
 * (Population) but three extra stratification dimensions — Age Group, Sex, and
 * Race/Ethnicity — that the sidebar renders as filter controls. Each request
 * pins one value per dimension (defaulting to the precomputed "All Ages",
 * "Both Sexes", and "All" aggregate rows stored in the contract CSV).
 *
 * This module also carries the `sources` axis (DoF P-3 projections vs Census
 * cc-est estimates). The two are kept side-by-side by design: forward-looking
 * projections must never be silently compared with backward-looking estimates.
 */

import { FIELD_KINDS, UNITS, isMeasure } from "../fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

const POPULATION_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const FULL_ROLES = ["xMeasure", "yMeasure", "size", "color"];

/** Canonical 5-year age groups plus the precomputed "All Ages" aggregate. */
const CANONICAL_AGE_GROUPS = [
  "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39",
  "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79",
  "80-84", "85+",
];
const AGE_GROUP_VALUES = [...CANONICAL_AGE_GROUPS, "All Ages"];
const SEX_VALUES = ["Male", "Female", "Both Sexes"];
const RACE_VALUES = ["White", "Black", "Asian", "NHPI", "AIAN", "Multiracial", "Hispanic", "All"];

export const DEMOGRAPHIC_PROJECTIONS_FIELDS = Object.freeze({
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
    values: ["State", "County", "Region", "US State"],
  },
  "Age Group": { kind: DIMENSION, label: "Age group", values: AGE_GROUP_VALUES },
  Sex: { kind: DIMENSION, label: "Sex", values: SEX_VALUES },
  "Race/Ethnicity": { kind: DIMENSION, label: "Race/ethnicity", values: RACE_VALUES },
  Source: {
    kind: DIMENSION,
    label: "Source",
    values: ["DoF P-3", "Census cc-est"],
  },

  // ----- measure -----
  Population: {
    kind: MEASURE,
    label: "Population",
    unit: UNITS.PEOPLE,
    comparisonGroup: "population",
    aggregation: "notAllowed",
    transforms: POPULATION_TRANSFORMS,
    chartRoles: FULL_ROLES,
    curated: true,
  },
});

/** Friendly subset name → Geographic Level value(s). */
export const DEMOGRAPHIC_PROJECTIONS_SUBSETS = Object.freeze({
  Counties: ["County"],
  Regions: ["Region"],
  California: ["State"],
  "US States": ["US State"],
});

/** Data sources kept side-by-side; the UI must pick one deliberately. */
export const DEMOGRAPHIC_PROJECTIONS_SOURCES = Object.freeze(["DoF P-3", "Census cc-est"]);

/**
 * Module-specific stratification filters the sidebar renders as extra controls.
 * Each maps to the dimension column and the default value the API pins when the
 * user has not chosen one (the precomputed aggregate rows).
 */
export const DEMOGRAPHIC_PROJECTIONS_FILTER_DIMENSIONS = Object.freeze([
  { column: "Age Group", param: "ageGroup", label: "Age group", values: AGE_GROUP_VALUES, default: "All Ages" },
  { column: "Sex", param: "sex", label: "Sex", values: SEX_VALUES, default: "Both Sexes" },
  { column: "Race/Ethnicity", param: "raceEthnicity", label: "Race/ethnicity", values: RACE_VALUES, default: "All" },
]);

/**
 * Which source each geographic subset lives in. Selecting a subset in the
 * sidebar pins the matching source: California county/region/state totals come
 * from DoF P-3, while the 50-state series comes from Census cc-est. Mirrors the
 * source/subset guard in the API route.
 */
export const DEMOGRAPHIC_PROJECTIONS_SUBSET_SOURCE = Object.freeze({
  Counties: "DoF P-3",
  Regions: "DoF P-3",
  California: "DoF P-3",
  "US States": "Census cc-est",
});

/**
 * Default coarse age-group presets. Each maps to the stored 5-year groups the
 * API sums server-side. The preset boundaries (18, 25, 26) do not align with the
 * 5-year bin edges, so each preset maps to the nearest whole bins: the 15-19 bin
 * counts as "Under 18" and the 20-24 bin as "18-25" by convention.
 */
export const DEMOGRAPHIC_PROJECTIONS_AGE_PRESETS = Object.freeze({
  "Under 18": ["0-4", "5-9", "10-14", "15-19"],
  "18-25": ["20-24"],
  "26-64": ["25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64"],
  "65+": ["65-69", "70-74", "75-79", "80-84", "85+"],
});

const measureKeys = Object.keys(DEMOGRAPHIC_PROJECTIONS_FIELDS).filter((key) =>
  isMeasure(DEMOGRAPHIC_PROJECTIONS_FIELDS[key]),
);

/** Every measure column the CSV can contain. */
export const DEMOGRAPHIC_PROJECTIONS_NUMERIC_COLUMNS = Object.freeze(measureKeys);

/** Curated metrics exposed in the UI selector. */
export const DEMOGRAPHIC_PROJECTIONS_CURATED_MEASURES = Object.freeze(
  measureKeys.filter((key) => DEMOGRAPHIC_PROJECTIONS_FIELDS[key].curated),
);

/** Full CSV column order (cleaned DemographicProjections_Current.csv header, verbatim). */
export const DEMOGRAPHIC_PROJECTIONS_CANONICAL_COLUMNS = Object.freeze([
  "Geographic Level",
  "Location",
  "Year",
  "Age Group",
  "Sex",
  "Race/Ethnicity",
  "Population",
  "Source",
]);

export const DEMOGRAPHIC_PROJECTIONS_SCHEMA = Object.freeze({
  id: "demographic-projections",
  label: "Age, Sex & Race Projections",
  apiPath: "/api/projections",
  fields: DEMOGRAPHIC_PROJECTIONS_FIELDS,
  canonicalColumns: DEMOGRAPHIC_PROJECTIONS_CANONICAL_COLUMNS,
  numericColumns: DEMOGRAPHIC_PROJECTIONS_NUMERIC_COLUMNS,
  curatedMeasures: DEMOGRAPHIC_PROJECTIONS_CURATED_MEASURES,
  subsets: DEMOGRAPHIC_PROJECTIONS_SUBSETS,
  sources: DEMOGRAPHIC_PROJECTIONS_SOURCES,
  filterDimensions: DEMOGRAPHIC_PROJECTIONS_FILTER_DIMENSIONS,
  subsetSource: DEMOGRAPHIC_PROJECTIONS_SUBSET_SOURCE,
  ageGroupPresets: DEMOGRAPHIC_PROJECTIONS_AGE_PRESETS,
  yearRange: [2020, 2070], // P-3 projection horizon; drives the year slider
  // Module-owned presets (graph-editor overhaul, Phase 6). Each config pins a
  // `source` (this module keeps DoF P-3 and Census cc-est deliberately apart),
  // so validation never raises SOURCE_REQUIRED.
  presets: [
    {
      id: "age-pyramid",
      title: "Age pyramid",
      question: "How is the population distributed by age and sex?",
      config: {
        module: "demographic-projections",
        preset: "compare-places",
        chartType: "bar",
        bindings: { category: "Age Group", y: "Population", group: "Sex" },
        filters: { subset: "Counties", source: "DoF P-3" },
        period: {},
        transform: "actual",
        comparisonMode: "places",
        layers: [],
        labels: { title: "Population by age and sex" },
        // mirror = diverging bars (male left / female right); horizontal so age
        // groups run down the axis like a classic population pyramid.
        appearance: { mirror: true, orientation: "horizontal" },
        data: { source: "module" },
      },
    },
    {
      id: "population-trend",
      title: "Population trend",
      question: "How is the projected population changing over time?",
      config: {
        module: "demographic-projections",
        preset: "trend-over-time",
        chartType: "line",
        bindings: { x: "Year", y: "Population", series: "Location" },
        filters: { subset: "Counties", source: "DoF P-3" },
        period: {},
        transform: "actual",
        comparisonMode: "places",
        layers: [],
        labels: { title: "Projected population over time" },
        appearance: {},
        data: { source: "module" },
      },
    },
  ],
});
