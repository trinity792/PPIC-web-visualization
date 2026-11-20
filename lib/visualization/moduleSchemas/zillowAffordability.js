/**
 * Client-safe visualization schema for the Zillow Housing Affordability module.
 *
 * Mirror of `moduleSchemas/housingStress.js` (breakdown dimension) and
 * `moduleSchemas/buildingPermits.js` (monthly `Date` axis). SINGLE SOURCE OF
 * TRUTH for this module's field catalog, curated measures, subsets, canonical CSV
 * columns, and comparison dimension. CLIENT-SAFE (no node:fs) — consumed by both
 * client components and the server-only `lib/data/zillow_affordability.js`.
 *
 * One row = one place x one month x one Housing Scenario (Buy with 5/10/20% down,
 * or Rent), from the latest Zillow release. Measures a scenario does not have are
 * blank in the CSV (see docs/specifications/zillow-affordability-topic-specification.md),
 * so each comparison pins exactly one scenario, and each measure's `availableFor`
 * names the scenarios that carry it. Places are 26 California metros plus the
 * United States; maps draw on the `Metros` subset (the US has no shape).
 */

import { FIELD_KINDS, UNITS, isMeasure } from "../fieldTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

// Units format the values themselves ("$2,820", "44.2%"), so labels stay plain.
const AMOUNT_TRANSFORMS = ["actual", "numericChange", "percentChange", "indexed"];
const SHARE_TRANSFORMS = ["actual", "numericChange", "percentagePointChange", "indexed"];
const FULL_ROLES = ["xMeasure", "yMeasure", "size", "color"];

export const ZILLOW_AFFORDABILITY_SCENARIOS = Object.freeze([
  "Buy (5% down)",
  "Buy (10% down)",
  "Buy (20% down)",
  "Rent",
]);

const BUY_SCENARIOS = ["Buy (5% down)", "Buy (10% down)", "Buy (20% down)"];

// Zillow publishes each measure for only some scenarios. `availableFor` lets the
// editor offer just those scenarios and move comparisons when the outcome
// changes. It mirrors `applicable_measures` in scripts/zillow_affordability/config/schemas.py.
const measureField = (label, unit, comparisonGroup, scenarios, transforms = AMOUNT_TRANSFORMS) => ({
  kind: MEASURE,
  label,
  unit,
  comparisonGroup,
  availableFor: Object.freeze({ "Housing Scenario": Object.freeze(scenarios) }),
  // Medians and modeled payments never sum across places or scenarios.
  aggregation: "notAllowed",
  transforms,
  chartRoles: FULL_ROLES,
  curated: true,
});

export const ZILLOW_AFFORDABILITY_FIELDS = Object.freeze({
  // ----- temporal (monthly) -----
  Date: { kind: TEMPORAL, label: "Month", formatter: "month", granularity: "month" },

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
    values: ["Nation", "Metro"],
  },
  "Housing Scenario": {
    kind: DIMENSION,
    label: "Housing scenario",
    values: ZILLOW_AFFORDABILITY_SCENARIOS,
  },

  // ----- measures -----
  // The two monthly payments share an axis; everything else stands alone.
  "Mortgage Payment": measureField("Monthly mortgage payment", UNITS.USD, "zillowMonthlyCost", BUY_SCENARIOS),
  "Total Monthly Payment": measureField("Total monthly payment", UNITS.USD, "zillowMonthlyCost", BUY_SCENARIOS),
  "Income Needed": measureField("Yearly income needed", UNITS.USD, "zillowIncomeNeeded", [
    "Buy (20% down)",
    "Rent",
  ]),
  "Share of Income": measureField(
    "Share of income",
    UNITS.SHARE,
    "zillowShareOfIncome",
    ["Buy (20% down)", "Rent"],
    SHARE_TRANSFORMS,
  ),
  "Affordable Home Price": measureField("Affordable home price", UNITS.USD, "zillowAffordablePrice", [
    "Buy (20% down)",
  ]),
  "Years to Save": measureField("Years to save", UNITS.YEARS, "zillowYearsToSave", ["Buy (20% down)"]),
});

/**
 * Friendly subset name → stored Geographic Level(s). "Metros and US" is first so
 * a chart can set California metros against the national benchmark; "Metros" is
 * the level a map draws on (lib/visualization/chartAvailability.js).
 */
export const ZILLOW_AFFORDABILITY_SUBSETS = Object.freeze({
  "Metros and US": ["Metro", "Nation"],
  Metros: ["Metro"],
});

const measureKeys = Object.keys(ZILLOW_AFFORDABILITY_FIELDS).filter((key) =>
  isMeasure(ZILLOW_AFFORDABILITY_FIELDS[key]),
);

/** Every measure column the CSV contains (drives numeric parsing). */
export const ZILLOW_AFFORDABILITY_NUMERIC_COLUMNS = Object.freeze(measureKeys);

/** Curated measures exposed in the UI selector. */
export const ZILLOW_AFFORDABILITY_CURATED_MEASURES = Object.freeze(
  measureKeys.filter((key) => ZILLOW_AFFORDABILITY_FIELDS[key].curated),
);

/** Full CSV column order (cleaned ZillowAffordability_Current.csv header, verbatim). */
export const ZILLOW_AFFORDABILITY_CANONICAL_COLUMNS = Object.freeze([
  "Release Date",
  "Geographic Level",
  "Location",
  "Date",
  "Housing Scenario",
  "Mortgage Payment",
  "Total Monthly Payment",
  "Income Needed",
  "Share of Income",
  "Affordable Home Price",
  "Years to Save",
]);

/** v3 monthly period tokens, "YYYY-MM", inclusive of both ends (as in buildingPermits.js). */
function monthlyPeriods(startYearMonth, endYearMonth) {
  const [startYear, startMonth] = startYearMonth.split("-").map(Number);
  const [endYear, endMonth] = endYearMonth.split("-").map(Number);
  const periods = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const firstMonth = year === startYear ? startMonth : 1;
    const lastMonth = year === endYear ? endMonth : 12;
    for (let month = firstMonth; month <= lastMonth; month += 1) {
      periods.push(`${year}-${String(month).padStart(2, "0")}`);
    }
  }
  return periods;
}

// Bump alongside yearRange as new Zillow months land (same convention as Building Permits).
const LATEST_MONTH = "2026-10";

export const ZILLOW_AFFORDABILITY_SCHEMA = Object.freeze({
  id: "zillow-affordability",
  label: "Zillow Housing Affordability",
  // The chart's source line (renderer plan). The data has no per-row source.
  sourceCitations: Object.freeze({
    default: "Zillow Research, Housing Data: Affordability series (smoothed, seasonally adjusted)",
  }),
  apiPath: "/api/zillow-affordability",
  fields: ZILLOW_AFFORDABILITY_FIELDS,
  canonicalColumns: ZILLOW_AFFORDABILITY_CANONICAL_COLUMNS,
  numericColumns: ZILLOW_AFFORDABILITY_NUMERIC_COLUMNS,
  curatedMeasures: ZILLOW_AFFORDABILITY_CURATED_MEASURES,
  subsets: ZILLOW_AFFORDABILITY_SUBSETS,
  // Monthly axis: the slider is year-granular, the data is monthly.
  temporalColumn: "Date",
  temporalGranularity: "month",
  yearRange: [2012, 2026],
  // Every comparison pins one scenario: values never add up across scenarios,
  // and each scenario carries a different set of measures.
  comparisonDimensions: Object.freeze([
    Object.freeze({ id: "Housing Scenario", values: ZILLOW_AFFORDABILITY_SCENARIOS }),
  ]),
  labelMeta: Object.freeze({
    dimensionOrder: Object.freeze(["geography", "Housing Scenario"]),
    omitValues: Object.freeze({}),
    disambiguateBy: Object.freeze(["geography", "time"]),
    // Title wording: "... over time by metro", not "by metros and us".
    subsetScopes: Object.freeze({ "Metros and US": "metro", Metros: "metro" }),
  }),
  time: Object.freeze({
    availablePeriods: Object.freeze(monthlyPeriods("2012-01", LATEST_MONTH)),
    reportingPeriods: Object.freeze([LATEST_MONTH]),
    defaultReportingPeriod: LATEST_MONTH,
  }),
});
