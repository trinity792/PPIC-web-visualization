/**
 * Built-in deep-link views for the module workbench.
 * These are declarative v3 question specs, never rendered Plotly figures.
 *
 * Resolved by `/[module]?view=<id>`, so every id here is a public URL: removing
 * or renaming one breaks saved and shared links. The landing page no longer
 * reads from this file (it was the other half of the old categoryRegistry), but
 * the three views its dashboards used are still reachable by URL and stay.
 *
 * Rewritten from chart spec v1 when the module pages cut over to v3
 * (2026-09-14). Two v1 habits do not survive the translation and are spelled
 * out here instead of inferred:
 *
 *   - An empty place selection is unfinished authoring state in v3, not "every
 *     place" - so a ranking lists all 58 counties and a regional trend lists all
 *     9 regions, and the ranking narrows through `calculation.params.ranking`
 *     rather than a `topN` filter. Maps are the exception: a choropleth with no
 *     selection still draws every feature at its level.
 *   - Stratified modules (Housing Stress) pin their strata on a comparison, not
 *     on a filter: "All" race and "Total" tenure are a real comparison here.
 */

import { CALIFORNIA_COUNTIES, REGION_NAMES } from "@/lib/geography/californiaGeography";

const ACTUAL = Object.freeze({ id: "actual", params: Object.freeze({}) });

// Location-series modules (PopHousing, Components of Change) still execute
// through one comparison envelope; the selected places are the visible series.
const LOCATIONS_ONLY = Object.freeze([
  Object.freeze({ id: "cmp_locations", dimensions: Object.freeze({}), customLabel: null, color: null }),
]);

const ALL_HOUSEHOLDS = Object.freeze([
  Object.freeze({
    id: "cmp_all_households",
    dimensions: Object.freeze({ "Race/Ethnicity": "All", Tenure: "Total" }),
    customLabel: null,
    color: null,
  }),
]);

const RENTERS = Object.freeze([
  Object.freeze({
    id: "cmp_renters",
    dimensions: Object.freeze({ "Race/Ethnicity": "All", Tenure: "Rented" }),
    customLabel: null,
    color: null,
  }),
]);

const regions = () => Object.freeze({ subset: "Regions", locations: REGION_NAMES });
const counties = () => Object.freeze({ subset: "Counties", locations: CALIFORNIA_COUNTIES });
const everyCounty = () => Object.freeze({ subset: "Counties", locations: Object.freeze([]) });

const view = (moduleId, question, presentation) =>
  Object.freeze({
    version: 3,
    question: Object.freeze({
      dataset: Object.freeze({ kind: "module", moduleId }),
      ...question,
    }),
    presentation: Object.freeze({
      comparisonPresentation: "combined",
      format: Object.freeze({}),
      annotations: Object.freeze([]),
      ...presentation,
    }),
  });

export const BUILT_IN_VIEWS = Object.freeze({
  "population-trend": view(
    "pophousing",
    {
      outcome: { measureId: "Total Population" },
      geography: regions(),
      time: { contract: "range", startYear: 1991, endYear: 2026 },
      calculation: ACTUAL,
      comparisons: LOCATIONS_ONLY,
    },
    {
      chartType: "line",
      labels: {
        title: "California population trends",
        subtitle: "Population estimates by region",
        xAxis: "Year",
        yAxis: "Residents",
      },
      appearance: { markerMode: "auto", legendPosition: "bottom" },
    },
  ),
  "housing-trend": view(
    "pophousing",
    {
      outcome: { measureId: "Total Housing Units" },
      geography: regions(),
      time: { contract: "range", startYear: 2000, endYear: 2026 },
      calculation: { id: "indexed", params: { baseYear: 2000 } },
      comparisons: LOCATIONS_ONLY,
    },
    {
      chartType: "line",
      labels: {
        title: "Housing growth by region",
        subtitle: "Total housing units, change since 2000",
        xAxis: "Year",
        // v3 "Index to Base Year" is percent change from the base year (0 at
        // the base), not a 100-based index.
        yAxis: "Change since 2000 (%)",
      },
      appearance: { markerMode: "off", legendPosition: "bottom" },
    },
  ),
  "county-population-ranking": view(
    "pophousing",
    {
      outcome: { measureId: "Total Population" },
      geography: counties(),
      time: { contract: "snapshot", year: 2026 },
      calculation: { id: "actual", params: { ranking: { n: 15, direction: "top" } } },
      comparisons: LOCATIONS_ONLY,
    },
    {
      chartType: "bar",
      labels: {
        title: "Largest California counties",
        subtitle: "Latest available population estimate",
        xAxis: "County",
        yAxis: "Residents",
      },
      // The v1 view drew horizontal bars; the v3 bar adapter draws vertical
      // ones and does not read `orientation` yet, so the axis labels follow
      // the vertical layout.
      appearance: { sort: "value", showValueLabels: true, legendPosition: "hidden" },
    },
  ),
  "county-population-map": view(
    "pophousing",
    {
      outcome: { measureId: "Total Population" },
      geography: everyCounty(),
      time: { contract: "snapshot", year: 2026 },
      calculation: ACTUAL,
      comparisons: LOCATIONS_ONLY,
    },
    {
      chartType: "choroplethMap",
      labels: {
        title: "Population across California counties",
        subtitle: "Latest available estimate",
      },
      appearance: { colorScale: "sequential", showBoundaries: true, legendPosition: "right" },
    },
  ),
  "migration-trend": view(
    "components-of-change",
    {
      source: "DoF",
      outcome: { measureId: "Net Domestic Migration" },
      geography: regions(),
      time: { contract: "range", startYear: 1991, endYear: 2024 },
      calculation: ACTUAL,
      comparisons: LOCATIONS_ONLY,
    },
    {
      chartType: "line",
      labels: {
        title: "Net domestic migration",
        subtitle: "California regions, Department of Finance estimates",
        xAxis: "Year",
        yAxis: "People",
      },
      // The v1 view drew a "No net migration" reference line at zero. The v3
      // line chart has no reference-line setting yet, so the line is dropped
      // rather than smuggled in through raw layout shapes.
      appearance: { markerMode: "auto", legendPosition: "bottom" },
    },
  ),
  "population-area": view(
    "pophousing",
    {
      outcome: { measureId: "Total Population" },
      geography: regions(),
      time: { contract: "range", startYear: 1991, endYear: 2026 },
      calculation: ACTUAL,
      comparisons: LOCATIONS_ONLY,
    },
    {
      chartType: "line",
      labels: {
        title: "Population by region",
        subtitle: "Regional population over time",
        xAxis: "Year",
        yAxis: "Residents",
      },
      // The v1 view was a stacked area chart. The v3 line adapter has no area
      // setting yet, so this is a plain multi-line trend until it does.
      appearance: { markerMode: "off", legendPosition: "bottom" },
    },
  ),
  "persons-per-household-map": view(
    "pophousing",
    {
      outcome: { measureId: "Persons Per Household" },
      geography: everyCounty(),
      time: { contract: "snapshot", year: 2026 },
      calculation: ACTUAL,
      comparisons: LOCATIONS_ONLY,
    },
    {
      chartType: "choroplethMap",
      labels: {
        title: "Persons per household by county",
        subtitle: "Latest available estimate",
      },
      appearance: { colorScale: "sequential", showBoundaries: true, legendPosition: "right" },
    },
  ),
  "housing-stress-share-trend": view(
    "housing-stress",
    {
      outcome: { measureId: "Share Over 30%" },
      geography: regions(),
      time: { contract: "range", startYear: 2012, endYear: 2024 },
      calculation: ACTUAL,
      comparisons: ALL_HOUSEHOLDS,
    },
    {
      chartType: "line",
      labels: {
        title: "Housing cost burden by region",
        subtitle: "Share of households paying over 30% of income on housing",
        xAxis: "Year",
        yAxis: "Share of households",
      },
      appearance: { markerMode: "auto", legendPosition: "bottom" },
    },
  ),
  "renter-cost-burden-trend": view(
    "housing-stress",
    {
      outcome: { measureId: "Share Over 30%" },
      geography: regions(),
      time: { contract: "range", startYear: 2012, endYear: 2024 },
      calculation: ACTUAL,
      comparisons: RENTERS,
    },
    {
      chartType: "line",
      labels: {
        title: "Renter cost burden by region",
        subtitle: "Share of renter households paying over 30% of income on rent",
        xAxis: "Year",
        yAxis: "Share of renter households",
      },
      appearance: { markerMode: "auto", legendPosition: "bottom" },
    },
  ),
  "housing-stress-county-ranking": view(
    "housing-stress",
    {
      outcome: { measureId: "Share Over 30%" },
      geography: counties(),
      time: { contract: "snapshot", year: 2024 },
      calculation: { id: "actual", params: { ranking: { n: 15, direction: "top" } } },
      comparisons: ALL_HOUSEHOLDS,
    },
    {
      chartType: "bar",
      labels: {
        title: "Most cost-burdened counties",
        subtitle: "Share over 30% (county figures are PUMA-based approximations)",
        xAxis: "County",
        yAxis: "Share of households",
      },
      // Vertical bars, as above.
      appearance: { sort: "value", showValueLabels: true, legendPosition: "hidden" },
    },
  ),
  "housing-stress-county-map": view(
    "housing-stress",
    {
      outcome: { measureId: "Share Over 30%" },
      geography: everyCounty(),
      time: { contract: "snapshot", year: 2024 },
      calculation: ACTUAL,
      comparisons: ALL_HOUSEHOLDS,
    },
    {
      chartType: "choroplethMap",
      labels: {
        title: "Housing cost burden across California counties",
        subtitle: "Share over 30% (county figures are PUMA-based approximations)",
      },
      appearance: { colorScale: "sequential", showBoundaries: true, legendPosition: "right" },
    },
  ),
});

/** A fresh, mutable copy of the named view, or undefined for an unknown id. */
export function getBuiltInView(viewId) {
  const spec = BUILT_IN_VIEWS[viewId];
  return spec ? JSON.parse(JSON.stringify(spec)) : undefined;
}
