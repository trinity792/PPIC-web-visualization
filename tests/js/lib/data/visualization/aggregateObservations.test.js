/**
 * Workstream B - lib/data/visualization/aggregateObservations.js.
 *
 * Two failure modes this module exists to prevent, both of which the v2 path
 * could produce silently:
 *
 *   1. **Zero standing in for "no value".** `existing[PARAMETER] += row[PARAMETER] ?? 0`
 *      in `lib/data/demographic_projections.js` turned an unavailable input into
 *      a contribution of zero, so an incomplete sum looked like a small one.
 *      A missing or suppressed input makes the whole result unavailable.
 *   2. **Double-counting an aggregate.** The Projections CSV ships precomputed
 *      "All Ages", "Both Sexes", and "All" rows beside their components. Adding
 *      an aggregate to its own components inside one comparison is arithmetic
 *      nonsense, and it is easy to reach by ticking one box too many.
 *
 * Separate comparisons may still overlap - comparing a subgroup with its total
 * is a normal request. The rule is about what goes into ONE number.
 */

import { describe, expect, it } from "vitest";

import { aggregateObservations } from "@/lib/data/visualization/aggregateObservations";
import { OBSERVATION_STATUS } from "@/lib/visualization/observationContract";
import {
  COMPONENTS_OF_CHANGE_EXPECTED,
  COMPONENTS_OF_CHANGE_MEASURES,
  COMPONENTS_OF_CHANGE_ROWS,
} from "@/tests/fixtures/visualization-v3/componentsOfChange";
import {
  PROJECTIONS_DIMENSION_ROLES,
  PROJECTIONS_EXPECTED,
  PROJECTIONS_ROWS,
} from "@/tests/fixtures/visualization-v3/projections";

const COMPARISON_ID = "cmp_under_test";

const additiveMeasure = {
  id: "Population",
  label: "Population",
  unit: "people",
  aggregation: "sum",
};

const weightedRateMeasure = {
  id: "Crude Birth Rate",
  label: "Crude birth rate",
  ...COMPONENTS_OF_CHANGE_MEASURES["Crude Birth Rate"],
};

/** Projections fixture rows as observations carrying their dimension values. */
function projectionObservations(match) {
  return PROJECTIONS_ROWS.filter((row) =>
    Object.entries(match).every(([key, value]) =>
      Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
    ),
  ).map((row) => ({
    comparisonId: COMPARISON_ID,
    comparisonLabel: "Comparison under test",
    measureId: "Population",
    measureLabel: "Population",
    unit: "people",
    period: row.Year,
    geographyId: row.Location,
    geographyLabel: row.Location,
    dimensions: {
      "Age Group": row["Age Group"],
      Sex: row.Sex,
      "Race/Ethnicity": row["Race/Ethnicity"],
    },
    value: row.Population,
    status: row.status,
    valueKind: row.valueKind,
    calculation: { id: "actual", params: {} },
    includedPeriods: null,
    source: row.Source,
  }));
}

function cocObservations(measureId, locations, year) {
  return COMPONENTS_OF_CHANGE_ROWS.filter(
    (row) =>
      row.measureId === measureId &&
      row.Source === "DoF" &&
      row.Year === year &&
      locations.includes(row.Location),
  ).map((row) => ({
    comparisonId: COMPARISON_ID,
    comparisonLabel: "Comparison under test",
    measureId,
    measureLabel: measureId,
    unit: COMPONENTS_OF_CHANGE_MEASURES[measureId].unit,
    period: row.Year,
    geographyId: row.Location,
    geographyLabel: row.Location,
    dimensions: {},
    value: row.value,
    status: row.status,
    valueKind: row.valueKind,
    calculation: { id: "actual", params: {} },
    includedPeriods: null,
    source: row.Source,
  }));
}

const aggregate = (observations, options) =>
  aggregateObservations(observations, {
    measure: additiveMeasure,
    groupBy: ["period", "geographyId"],
    dimensionRoles: PROJECTIONS_DIMENSION_ROLES,
    comparisonId: COMPARISON_ID,
    ...options,
  });

describe("additive aggregation", () => {
  it("sums nonoverlapping age components", () => {
    const { rows, issues } = aggregate(
      projectionObservations({
        Location: "San Francisco",
        "Race/Ethnicity": "Hispanic",
        Sex: "Female",
        "Age Group": ["0-4", "5-9"],
        Year: 2025,
        Source: "DoF P-3",
      }),
    );

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(PROJECTIONS_EXPECTED.sfLatinaWomenAgeComponentSum2025);
    expect(rows[0].status).toBe(OBSERVATION_STATUS.AVAILABLE);
    // A declared age group is the sum of its components and nothing else: 6500,
    // never the 50000 the stored "All Ages" row happens to hold.
    expect(rows[0].value).not.toBe(PROJECTIONS_EXPECTED.sfLatinaWomen.actual[2025]);
  });

  it("does not add All Ages to age components", () => {
    const { rows, issues } = aggregate(
      projectionObservations({
        Location: "San Francisco",
        "Race/Ethnicity": "Hispanic",
        Sex: "Female",
        "Age Group": ["All Ages", "0-4", "5-9"],
        Year: 2025,
        Source: "DoF P-3",
      }),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: "overlappingAggregate",
        level: "comparison",
        comparisonId: COMPARISON_ID,
      }),
    ]);
    // Rejected outright rather than quietly returning 56500, which is the
    // number a reader would have no way to recognise as wrong.
    expect(rows.filter((row) => Number.isFinite(row.value))).toEqual([]);
  });

  it("keeps a real zero in an additive measure", () => {
    const { rows, issues } = aggregate(
      projectionObservations({
        Location: "San Francisco",
        "Race/Ethnicity": "AIAN",
        Sex: "Male",
        "Age Group": ["0-4", "5-9"],
        Year: 2025,
        Source: "DoF P-3",
      }),
    );

    expect(issues).toEqual([]);
    // 0 + 25. The zero is data: it takes part in the sum and leaves the result
    // available, which is exactly what an unavailable input must NOT do.
    expect(rows[0].value).toBe(PROJECTIONS_EXPECTED.sfAianMenAgeComponentSum2025);
    expect(rows[0].status).toBe(OBSERVATION_STATUS.AVAILABLE);
  });

  it("propagates a missing additive input", () => {
    const { rows } = aggregate(
      projectionObservations({
        Location: "San Francisco",
        "Race/Ethnicity": "Hispanic",
        Sex: "Female",
        "Age Group": ["0-4", "5-9", "10-14"],
        Year: 2025,
        Source: "DoF P-3",
      }),
    );

    // The old `?? 0` fallback returned 6500 here and called it a complete
    // three-group total.
    expect(rows[0].status).toBe(OBSERVATION_STATUS.MISSING);
    expect(rows[0].value).toBeNull();
    expect(rows[0].unavailableInputs).toEqual([
      expect.objectContaining({ dimensions: { "Age Group": "10-14" } }),
    ]);
  });

  it("propagates a suppressed additive input as suppressed", () => {
    const { rows } = aggregate(
      projectionObservations({
        Location: "San Francisco",
        "Race/Ethnicity": ["Hispanic", "Black"],
        Sex: "Female",
        "Age Group": "All Ages",
        Year: 2025,
        Source: "DoF P-3",
      }),
      { dimensionRoles: PROJECTIONS_DIMENSION_ROLES },
    );

    // Hispanic (50000) plus a suppressed Black cell. Suppression is the
    // stronger signal and must reach the reader as suppression.
    expect(rows[0].status).toBe(OBSERVATION_STATUS.SUPPRESSED);
    expect(rows[0].value).toBeNull();
  });

  it("refuses to aggregate a measure whose schema does not allow it", () => {
    const { rows, issues } = aggregate(
      projectionObservations({
        Location: "San Francisco",
        "Race/Ethnicity": "Hispanic",
        Sex: "Female",
        "Age Group": ["0-4", "5-9"],
        Year: 2025,
        Source: "DoF P-3",
      }),
      { measure: { ...additiveMeasure, aggregation: "notAllowed" } },
    );

    expect(issues).toEqual([
      expect.objectContaining({ code: "aggregationNotAllowed", level: "comparison" }),
    ]);
    expect(rows).toEqual([]);
  });
});

describe("weighted mean", () => {
  it("calculates a weighted mean from declared weights", () => {
    const { rows, issues } = aggregateObservations(
      cocObservations("Crude Birth Rate", ["Fresno", "Kern"], 2025),
      {
        measure: weightedRateMeasure,
        groupBy: ["period"],
        weights: cocObservations("Total Population", ["Fresno", "Kern"], 2025),
        comparisonId: COMPARISON_ID,
      },
    );

    expect(issues).toEqual([]);
    // (1,000,000 x 12 + 3,000,000 x 16) / 4,000,000 = 15.
    // The unweighted mean would have been 14, which is the wrong rate for the
    // combined population and the reason a rate never gets a plain average.
    expect(rows[0].value).toBe(
      COMPONENTS_OF_CHANGE_EXPECTED.fresnoKernWeightedCrudeBirthRate2025,
    );
    expect(rows[0].value).not.toBe(14);
  });

  it("rejects a weighted mean with zero total weight", () => {
    const { rows, issues } = aggregateObservations(
      cocObservations("Crude Birth Rate", ["Alpine"], 2020),
      {
        measure: weightedRateMeasure,
        groupBy: ["period"],
        weights: cocObservations("Total Population", ["Alpine"], 2020),
        comparisonId: COMPARISON_ID,
      },
    );

    // Alpine's 2020 population is a real zero, so the denominator is zero.
    // Failing is correct; returning the unweighted 9 would be a made-up rate.
    expect(issues).toEqual([
      expect.objectContaining({ code: "zeroTotalWeight", level: "comparison" }),
    ]);
    expect(rows.filter((row) => Number.isFinite(row.value))).toEqual([]);
  });

  it("propagates an unavailable weight rather than dropping the row", () => {
    const observations = cocObservations("Crude Birth Rate", ["Fresno", "Kern"], 2025);
    const weights = cocObservations("Total Population", ["Fresno", "Kern"], 2025).map((row) =>
      row.geographyId === "Kern"
        ? { ...row, value: null, status: OBSERVATION_STATUS.SUPPRESSED }
        : row,
    );

    const { rows } = aggregateObservations(observations, {
      measure: weightedRateMeasure,
      groupBy: ["period"],
      weights,
      comparisonId: COMPARISON_ID,
    });

    // Silently dropping Kern would return Fresno's 12 as if it described both
    // counties.
    expect(rows[0].status).toBe(OBSERVATION_STATUS.SUPPRESSED);
    expect(rows[0].value).toBeNull();
  });

  it("requires a weight field before it will average a rate", () => {
    const { issues } = aggregateObservations(
      cocObservations("Crude Birth Rate", ["Fresno", "Kern"], 2025),
      {
        measure: { ...weightedRateMeasure, weightField: undefined },
        groupBy: ["period"],
        comparisonId: COMPARISON_ID,
      },
    );

    expect(issues).toEqual([
      expect.objectContaining({ code: "weightFieldRequired", level: "comparison" }),
    ]);
  });
});
