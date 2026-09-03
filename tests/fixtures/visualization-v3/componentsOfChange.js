/**
 * Shared Components of Change fixture for the v3 visualization backend
 * (implementation plan, Workstream F).
 *
 * Companion to `projections.js`. Where the Projections fixture carries the
 * demographic strata, aggregates, and projected values, this one carries the
 * three unit families (a population stock, a component count, and a crude rate)
 * that decide which calculations a measure may be offered, plus the ranking
 * ties and the zero base that the calculation engine has to refuse.
 *
 * Grain: one row per Year x Location x Measure x Source.
 * Column names mirror lib/visualization/moduleSchemas/componentsOfChange.js.
 */

const AVAILABLE = "available";
const MISSING = "missing";
const SUPPRESSED = "suppressed";

function row(year, location, measure, value, options = {}) {
  const status = options.status || (value === null ? MISSING : AVAILABLE);
  return Object.freeze({
    Year: year,
    Location: location,
    "Geographic Level": options.level || "County",
    Source: options.source || "DoF",
    measureId: measure,
    value: status === AVAILABLE ? value : null,
    status,
    valueKind: "observed",
  });
}

export const COMPONENTS_OF_CHANGE_ROWS = Object.freeze([
  // ---- Total Population: the stock measure (unit "people") ---------------
  // Fresno grows 25%; Kern grows 25%; Merced grows 20%. Alpine starts at a
  // real, deliberate zero so percent change has a mathematically invalid base.
  row(2020, "Fresno", "Total Population", 800000),
  row(2025, "Fresno", "Total Population", 1000000),
  row(2020, "Kern", "Total Population", 2400000),
  row(2025, "Kern", "Total Population", 3000000),
  row(2020, "Merced", "Total Population", 250000),
  row(2025, "Merced", "Total Population", 300000),
  row(2020, "Alpine", "Total Population", 0),
  row(2025, "Alpine", "Total Population", 1200),

  // ---- Births: the count measure (unit "count") --------------------------
  // Fresno and Kern tie at 12000 in 2025, so Top N has to break the tie by a
  // stable label rather than by row order. Alpine 2025 is suppressed.
  row(2020, "Fresno", "Births", 11200),
  row(2025, "Fresno", "Births", 12000),
  row(2020, "Kern", "Births", 10000),
  row(2025, "Kern", "Births", 12000),
  row(2020, "Merced", "Births", 7500),
  row(2025, "Merced", "Births", 8000),
  row(2020, "Alpine", "Births", 10),
  row(2025, "Alpine", "Births", null, { status: SUPPRESSED }),

  // ---- Crude Birth Rate: the rate measure (per 1,000) --------------------
  // A rate takes percentage-point change, never percent change. Merced 2025 is
  // absent from the source and is reported as an explicit gap.
  row(2020, "Fresno", "Crude Birth Rate", 14),
  row(2025, "Fresno", "Crude Birth Rate", 12),
  row(2020, "Kern", "Crude Birth Rate", 15),
  row(2025, "Kern", "Crude Birth Rate", 16),
  row(2020, "Merced", "Crude Birth Rate", 13),
  row(2025, "Merced", "Crude Birth Rate", null, { status: MISSING }),
  row(2020, "Alpine", "Crude Birth Rate", 9),
  row(2025, "Alpine", "Crude Birth Rate", 8),

  // ---- The second source -------------------------------------------------
  // Census reports a different Fresno stock for the same year. A comparison
  // pins one source, and the response says which one produced the value.
  row(2025, "Fresno", "Total Population", 1010000, { source: "Census" }),
  row(2025, "Kern", "Total Population", 3030000, { source: "Census" }),

  // ---- California: the benchmark geography -------------------------------
  row(2020, "California", "Total Population", 39000000, { level: "State" }),
  row(2025, "California", "Total Population", 39500000, { level: "State" }),
]);

export const COMPONENTS_OF_CHANGE_TIME = Object.freeze({
  availablePeriods: Object.freeze([2020, 2025]),
  reportingPeriods: Object.freeze([2020, 2025]),
  defaultReportingPeriod: 2025,
});

/**
 * Unit and aggregation metadata the module schema is expected to declare. The
 * weight field is what makes a crude rate averageable across geographies at
 * all: a rate is never summed, and its unweighted mean is not a real number
 * for a combined population.
 */
export const COMPONENTS_OF_CHANGE_MEASURES = Object.freeze({
  "Total Population": Object.freeze({
    unit: "people",
    aggregation: "sum",
    calculations: Object.freeze([
      "actual",
      "numericChange",
      "percentChange",
      "indexed",
      "benchmarkDifference",
      "ranking",
    ]),
  }),
  Births: Object.freeze({
    unit: "count",
    aggregation: "sum",
    calculations: Object.freeze([
      "actual",
      "numericChange",
      "percentChange",
      "indexed",
      "benchmarkDifference",
      "ranking",
    ]),
  }),
  "Crude Birth Rate": Object.freeze({
    unit: "ratePerThousand",
    aggregation: "weightedMean",
    weightField: "Total Population",
    calculations: Object.freeze([
      "actual",
      "percentagePointChange",
      "benchmarkDifference",
      "ranking",
    ]),
  }),
});

/** Hand-calculated answers. No test may compute these for itself. */
export const COMPONENTS_OF_CHANGE_EXPECTED = Object.freeze({
  fresnoTotalPopulation: Object.freeze({
    numericChange2020to2025: 200000,
    percentChange2020to2025: 25,
    indexedToBase2020: Object.freeze({ 2020: 100, 2025: 125 }),
    benchmarkDifference2025: 1000000 - 39500000,
  }),
  fresnoCrudeBirthRate: Object.freeze({
    // A rate moves in percentage points: 12 - 14.
    percentagePointChange2020to2025: -2,
  }),
  // (1,000,000 x 12) + (3,000,000 x 16) = 60,000,000 over 4,000,000 people.
  fresnoKernWeightedCrudeBirthRate2025: 15,
  // Fresno + Kern births, 2025. Both available, so the sum is available.
  fresnoKernBirths2025: 24000,
  // Top 2 by 2025 births. Fresno and Kern tie at 12000 and the tie is broken by
  // the stable display label, so Fresno precedes Kern on every run.
  topTwoBirths2025: Object.freeze(["Fresno", "Kern"]),
  // Alpine is suppressed and Merced is 8000: neither can enter the top two, and
  // Alpine must not be ranked as if it were zero.
  rankedOrderBirths2025: Object.freeze(["Fresno", "Kern", "Merced"]),
  unrankedBirths2025: Object.freeze(["Alpine"]),
});

export default COMPONENTS_OF_CHANGE_ROWS;
