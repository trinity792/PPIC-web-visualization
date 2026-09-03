/**
 * Shared Age, Sex & Race Projections fixture for the v3 visualization backend
 * (implementation plan, Workstream F).
 *
 * Hand-readable on purpose: every expected result in the contract, calculation,
 * route, adapter, and export tests is calculable by eye from the rows below.
 * Do NOT grow this into a data extract — if a test needs a case that is not
 * here, add the one row that expresses it and add the expectation to
 * PROJECTIONS_EXPECTED so no test computes its own answer.
 *
 * Grain: one row per Year x Location x Age Group x Sex x Race/Ethnicity x Source.
 * Column names mirror lib/visualization/moduleSchemas/demographicProjections.js
 * so an adapter can be pointed at this fixture without a rename map.
 *
 * Availability (`status`) is separate from value kind (`valueKind`):
 *   status    - available | missing | suppressed  (can this number be plotted?)
 *   valueKind - observed | projected | derived    (what does the number mean?)
 * A missing or suppressed row carries `Population: null`. It never carries 0.
 */

const AVAILABLE = "available";
const MISSING = "missing";
const SUPPRESSED = "suppressed";
const OBSERVED = "observed";
const PROJECTED = "projected";

/** 2020 and 2025 are Census-anchored observations; 2030 is a DoF projection. */
const kindForYear = (year) => (year >= 2030 ? PROJECTED : OBSERVED);

function row(year, location, race, sex, ageGroup, population, options = {}) {
  const status = options.status || (population === null ? MISSING : AVAILABLE);
  return Object.freeze({
    Year: year,
    Location: location,
    "Geographic Level": options.level || "County",
    "Age Group": ageGroup,
    Sex: sex,
    "Race/Ethnicity": race,
    Source: options.source || "DoF P-3",
    Population: status === AVAILABLE ? population : null,
    status,
    valueKind: options.valueKind || kindForYear(year),
  });
}

export const PROJECTIONS_ROWS = Object.freeze([
  // ---- San Francisco, Hispanic, All Ages aggregate ------------------------
  // The primary series: clean arithmetic for change, percent change, and index.
  row(2020, "San Francisco", "Hispanic", "Female", "All Ages", 40000),
  row(2025, "San Francisco", "Hispanic", "Female", "All Ages", 50000),
  row(2030, "San Francisco", "Hispanic", "Female", "All Ages", 60000),
  row(2020, "San Francisco", "Hispanic", "Male", "All Ages", 42000),
  row(2025, "San Francisco", "Hispanic", "Male", "All Ages", 52500),
  row(2030, "San Francisco", "Hispanic", "Male", "All Ages", 63000),
  row(2025, "San Francisco", "Hispanic", "Both Sexes", "All Ages", 102500),

  // ---- San Francisco, Hispanic, base age components ----------------------
  // Two component rows under the same aggregate. 3000 + 3500 = 6500, which is
  // deliberately NOT 50000: summing components must never reach the aggregate.
  row(2025, "San Francisco", "Hispanic", "Female", "0-4", 3000),
  row(2025, "San Francisco", "Hispanic", "Female", "5-9", 3500),
  row(2020, "San Francisco", "Hispanic", "Female", "0-4", 2500),
  row(2020, "San Francisco", "Hispanic", "Female", "5-9", 2800),
  // A third component with no reported value: any additive result that
  // includes it is missing, never the sum of the two that are present.
  row(2025, "San Francisco", "Hispanic", "Female", "10-14", null, { status: MISSING }),

  // ---- San Francisco, White ----------------------------------------------
  row(2020, "San Francisco", "White", "Female", "All Ages", 60000),
  row(2025, "San Francisco", "White", "Female", "All Ages", 63000),
  row(2030, "San Francisco", "White", "Female", "All Ages", 66000),
  row(2020, "San Francisco", "White", "Male", "All Ages", 58000),
  row(2025, "San Francisco", "White", "Male", "All Ages", 60900),
  row(2030, "San Francisco", "White", "Male", "All Ages", 63800),

  // ---- San Francisco, Black: one suppressed cell -------------------------
  // The source withheld 2025 for disclosure control. It is null, not zero, and
  // it must not be averaged, summed, indexed, or ranked into anything.
  row(2020, "San Francisco", "Black", "Female", "All Ages", 10000),
  row(2025, "San Francisco", "Black", "Female", "All Ages", null, { status: SUPPRESSED }),
  row(2030, "San Francisco", "Black", "Female", "All Ages", 9000),

  // ---- San Francisco, AIAN: one real zero --------------------------------
  // A true count of zero. It is data, and it must survive every calculation as
  // 0 rather than being read back as "no value".
  row(2025, "San Francisco", "AIAN", "Male", "0-4", 0),
  row(2025, "San Francisco", "AIAN", "Male", "5-9", 25),
  row(2025, "San Francisco", "AIAN", "Male", "All Ages", 1200),

  // ---- Los Angeles: the second geography ---------------------------------
  row(2020, "Los Angeles", "Hispanic", "Female", "All Ages", 2400000),
  row(2025, "Los Angeles", "Hispanic", "Female", "All Ages", 2520000),
  row(2030, "Los Angeles", "Hispanic", "Female", "All Ages", 2640000),
  row(2020, "Los Angeles", "White", "Female", "All Ages", 1200000),
  row(2025, "Los Angeles", "White", "Female", "All Ages", 1188000),
  row(2030, "Los Angeles", "White", "Female", "All Ages", 1176000),
  // An explicitly reported gap, distinct from a row that is simply absent. The
  // 2020 value beside it is what makes "one selected year is missing" testable:
  // the set is otherwise complete.
  row(2020, "Los Angeles", "Black", "Female", "All Ages", 90000),
  row(2025, "Los Angeles", "Black", "Female", "All Ages", null, { status: MISSING }),

  // ---- California: the benchmark geography -------------------------------
  row(2020, "California", "Hispanic", "Female", "All Ages", 7800000, { level: "State" }),
  row(2025, "California", "Hispanic", "Female", "All Ages", 8000000, { level: "State" }),
  row(2030, "California", "Hispanic", "Female", "All Ages", 8200000, { level: "State" }),

  // ---- Census cc-est: the second source ----------------------------------
  // Same population, different vintage. A comparison must never mix the two
  // silently, and the source must reach the response so a reader can tell.
  row(2025, "San Francisco", "Hispanic", "Female", "All Ages", 49500, {
    source: "Census cc-est",
  }),
]);

/**
 * Time metadata the module schema is expected to declare (Workstream A). The
 * reporting year is 2025 - the latest observed estimate - and is deliberately
 * NOT the 2030 projection horizon in this fixture, nor the 2070 horizon in the
 * real dataset.
 */
export const PROJECTIONS_TIME = Object.freeze({
  availablePeriods: Object.freeze([2020, 2025, 2030]),
  reportingPeriods: Object.freeze([2020, 2025]),
  defaultReportingPeriod: 2025,
});

/**
 * Which dimension values are precomputed aggregates, which are components of
 * one, and which are derived groupings. The calculation engine reads this to
 * refuse a sum that would double-count.
 */
export const PROJECTIONS_DIMENSION_ROLES = Object.freeze({
  "Age Group": Object.freeze({
    "All Ages": "aggregate",
    "0-4": "component",
    "5-9": "component",
    "10-14": "component",
  }),
  Sex: Object.freeze({ "Both Sexes": "aggregate", Female: "component", Male: "component" }),
  "Race/Ethnicity": Object.freeze({
    All: "aggregate",
    Hispanic: "component",
    White: "component",
    Black: "component",
    AIAN: "component",
  }),
});

/**
 * Hand-calculated answers. Every test that asserts a number reads it from here
 * so no test can quietly re-derive an expectation with the code under test.
 */
export const PROJECTIONS_EXPECTED = Object.freeze({
  reportingYear: 2025,

  // San Francisco / Hispanic / Female / All Ages / DoF P-3
  sfLatinaWomen: Object.freeze({
    label: "San Francisco Latina Women",
    actual: Object.freeze({ 2020: 40000, 2025: 50000, 2030: 60000 }),
    numericChange2020to2025: 10000,
    percentChange2020to2025: 25,
    indexedToBase2020: Object.freeze({ 2020: 100, 2025: 125, 2030: 150 }),
    averageOfAllThreeYears: 50000,
    // California Hispanic women, same year, subtracted from the county value.
    benchmarkDifference2025: 50000 - 8000000,
  }),

  // The two declared base age groups only. Never 50000, and never 56500.
  sfLatinaWomenAgeComponentSum2025: 6500,
  // San Francisco / AIAN / Male, 2025: 0 + 25. The zero is data and takes part
  // in the sum; a missing input would have made the whole result missing.
  sfAianMenAgeComponentSum2025: 25,

  // Los Angeles / White / Female shrinks, so the sign of change is exercised.
  laWhiteWomen: Object.freeze({
    numericChange2020to2025: -12000,
    percentChange2020to2025: -1,
  }),

  labels: Object.freeze({
    sfLatinaWomen: "San Francisco Latina Women",
    sfLatinoMen: "San Francisco Latino Men",
    sfWhiteWomen: "San Francisco White Women",
    laLatinaWomen: "Los Angeles Latina Women",
    // Same dimensions, different source: the shortest differing label is added.
    sfLatinaWomenCensus: "San Francisco Latina Women (Census cc-est)",
  }),
});

export default PROJECTIONS_ROWS;
