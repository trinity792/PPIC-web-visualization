/**
 * Workstream B - lib/data/visualization/calculationRegistry.js.
 *
 * One pure layer owns the meaning of every returned number. The module routes
 * call it on the server; the inline "bring your own data" adapter calls the
 * same functions in the browser because there is no server dataset to ask. The
 * execution location differs - the formula, the validation, the status
 * propagation, and the result metadata do not.
 *
 * Everything asserted here is hand-calculated in
 * `tests/fixtures/visualization-v3/`. No test derives its expectation with the
 * code under test.
 */

import { describe, expect, it } from "vitest";

import {
  CALCULATION_IDS,
  applyCalculation,
  calculationOptionsFor,
  getCalculation,
  isCalculationAllowed,
} from "@/lib/data/visualization/calculationRegistry";
import { OBSERVATION_STATUS, VALUE_KINDS } from "@/lib/visualization/observationContract";
import {
  COMPONENTS_OF_CHANGE_EXPECTED,
  COMPONENTS_OF_CHANGE_MEASURES,
  COMPONENTS_OF_CHANGE_ROWS,
} from "@/tests/fixtures/visualization-v3/componentsOfChange";
import {
  PROJECTIONS_EXPECTED,
  PROJECTIONS_ROWS,
} from "@/tests/fixtures/visualization-v3/projections";

const COMPARISON_ID = "cmp_under_test";

/** Turns fixture rows into observation-contract rows for one comparison. */
function observationsOf(rows, match, options = {}) {
  return rows
    .filter((row) => Object.entries(match).every(([key, value]) => row[key] === value))
    .sort((a, b) => a.Year - b.Year)
    .map((row) => ({
      comparisonId: options.comparisonId || COMPARISON_ID,
      comparisonLabel: options.label || "Comparison under test",
      measureId: options.measureId || "Population",
      measureLabel: options.measureLabel || "Population",
      unit: options.unit || "people",
      period: row.Year,
      geographyId: row.Location,
      geographyLabel: row.Location,
      categoryId: null,
      categoryLabel: null,
      value: "Population" in row ? row.Population : row.value,
      status: row.status,
      valueKind: row.valueKind,
      calculation: { id: "actual", params: {} },
      includedPeriods: null,
      source: row.Source,
    }));
}

const projections = (match, options) => observationsOf(PROJECTIONS_ROWS, match, options);

const coc = (measureId, match, options = {}) =>
  observationsOf(
    COMPONENTS_OF_CHANGE_ROWS,
    { measureId, Source: "DoF", ...match },
    {
      measureId,
      measureLabel: measureId,
      unit: COMPONENTS_OF_CHANGE_MEASURES[measureId].unit,
      ...options,
    },
  );

const sfLatinaWomen = () =>
  projections({
    Location: "San Francisco",
    "Race/Ethnicity": "Hispanic",
    Sex: "Female",
    "Age Group": "All Ages",
    Source: "DoF P-3",
  });

const populationMeasure = {
  id: "Population",
  label: "Population",
  unit: "people",
  aggregation: "notAllowed",
  calculations: [
    "actual",
    "numericChange",
    "percentChange",
    "indexed",
    "benchmarkDifference",
    "ranking",
  ],
};

const rateMeasure = {
  id: "Crude Birth Rate",
  label: "Crude birth rate",
  ...COMPONENTS_OF_CHANGE_MEASURES["Crude Birth Rate"],
};

describe("the registry", () => {
  it("declares every approved calculation and no chart-specific ones", () => {
    expect([...CALCULATION_IDS].sort()).toEqual(
      [
        "actual",
        "averageSelectedYears",
        "benchmarkDifference",
        "indexed",
        "numericChange",
        "percentChange",
        "percentagePointChange",
        "ranking",
        "sum",
        "weightedMean",
      ].sort(),
    );
  });

  it("describes each calculation independently of a chart id", () => {
    for (const id of CALCULATION_IDS) {
      const descriptor = getCalculation(id);
      expect(descriptor, id).toEqual(
        expect.objectContaining({
          id,
          label: expect.any(String),
          requiredPeriods: expect.anything(),
          units: expect.any(Array),
        }),
      );
      expect(descriptor, id).not.toHaveProperty("chartType");
      expect(descriptor, id).not.toHaveProperty("chartTypes");
    }
  });
});

describe("actual", () => {
  it("preserves the value and the source kind", () => {
    const { rows, issues } = applyCalculation("actual", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      comparisonId: COMPARISON_ID,
    });

    expect(issues).toEqual([]);
    expect(rows.map((row) => [row.period, row.value])).toEqual([
      [2020, PROJECTIONS_EXPECTED.sfLatinaWomen.actual[2020]],
      [2025, PROJECTIONS_EXPECTED.sfLatinaWomen.actual[2025]],
      [2030, PROJECTIONS_EXPECTED.sfLatinaWomen.actual[2030]],
    ]);
    // 2030 stays a projection; nothing about "actual" makes it an observation.
    expect(rows.map((row) => row.valueKind)).toEqual(["observed", "observed", "projected"]);
  });
});

describe("change calculations", () => {
  it("calculates numeric change from two available periods", () => {
    const { rows, issues } = applyCalculation("numericChange", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      params: { startYear: 2020, endYear: 2025 },
      comparisonId: COMPARISON_ID,
    });

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(PROJECTIONS_EXPECTED.sfLatinaWomen.numericChange2020to2025);
    expect(rows[0].valueKind).toBe(VALUE_KINDS.DERIVED);
    // The result names both periods, or a reader cannot tell what changed.
    expect(rows[0].includedPeriods).toEqual([2020, 2025]);
    expect(rows[0].calculation).toEqual({
      id: "numericChange",
      params: { startYear: 2020, endYear: 2025 },
    });
  });

  it("calculates percent change and keeps the sign of a decline", () => {
    const { rows } = applyCalculation("percentChange", {
      observations: projections({
        Location: "Los Angeles",
        "Race/Ethnicity": "White",
        Sex: "Female",
        "Age Group": "All Ages",
        Source: "DoF P-3",
      }),
      measure: populationMeasure,
      params: { startYear: 2020, endYear: 2025 },
      comparisonId: COMPARISON_ID,
    });

    expect(rows[0].value).toBe(PROJECTIONS_EXPECTED.laWhiteWomen.percentChange2020to2025);
  });

  it("rejects percent change from a zero base", () => {
    // Alpine reports a real zero in 2020. Dividing by it is not infinity and
    // not zero; it is a question with no answer, and it has to say so.
    const { rows, issues } = applyCalculation("percentChange", {
      observations: coc("Total Population", { Location: "Alpine" }),
      measure: { id: "Total Population", ...COMPONENTS_OF_CHANGE_MEASURES["Total Population"] },
      params: { startYear: 2020, endYear: 2025 },
      comparisonId: COMPARISON_ID,
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "zeroBaseValue",
        level: "comparison",
        comparisonId: COMPARISON_ID,
        message: expect.any(String),
      }),
    ]);
    expect(rows.filter((row) => Number.isFinite(row.value))).toEqual([]);
    for (const row of rows) {
      expect(row.value).toBeNull();
      expect(row.status).not.toBe(OBSERVATION_STATUS.AVAILABLE);
    }
  });

  it("offers percentage-point change for a rate and not percent change", () => {
    const rateOptions = calculationOptionsFor(rateMeasure, { chartType: "bar" });
    expect(rateOptions).toContain("percentagePointChange");
    expect(rateOptions).not.toContain("percentChange");

    const countOptions = calculationOptionsFor(populationMeasure, { chartType: "bar" });
    expect(countOptions).toContain("percentChange");
    expect(countOptions).not.toContain("percentagePointChange");

    expect(isCalculationAllowed("percentChange", rateMeasure)).toBe(false);
    expect(isCalculationAllowed("percentagePointChange", populationMeasure)).toBe(false);
  });

  it("calculates percentage-point change in points, not percent", () => {
    const { rows } = applyCalculation("percentagePointChange", {
      observations: coc("Crude Birth Rate", { Location: "Fresno" }),
      measure: rateMeasure,
      params: { startYear: 2020, endYear: 2025 },
      comparisonId: COMPARISON_ID,
    });

    // 12 - 14 = -2 points. A percent change would have said about -14.3%.
    expect(rows[0].value).toBe(
      COMPONENTS_OF_CHANGE_EXPECTED.fresnoCrudeBirthRate.percentagePointChange2020to2025,
    );
    expect(rows[0].unit).toBe("percentagePoints");
  });

  it("requires exactly two ordered periods for every change calculation", () => {
    for (const id of ["numericChange", "percentChange", "percentagePointChange"]) {
      const { issues } = applyCalculation(id, {
        observations: sfLatinaWomen(),
        measure: id === "percentagePointChange" ? rateMeasure : populationMeasure,
        params: { startYear: 2025, endYear: 2025 },
        comparisonId: COMPARISON_ID,
      });
      expect(issues, id).toEqual([
        expect.objectContaining({ code: "distinctPeriodsRequired", level: "comparison" }),
      ]);
    }
  });

  it("returns a missing change when either endpoint is unavailable", () => {
    const { rows } = applyCalculation("numericChange", {
      observations: projections({
        Location: "San Francisco",
        "Race/Ethnicity": "Black",
        Sex: "Female",
        "Age Group": "All Ages",
        Source: "DoF P-3",
      }),
      measure: populationMeasure,
      params: { startYear: 2020, endYear: 2025 },
      comparisonId: COMPARISON_ID,
    });

    // 2025 is suppressed. The change inherits the suppression rather than
    // treating the hole as zero and reporting a 10,000-person collapse.
    expect(rows[0].status).toBe(OBSERVATION_STATUS.SUPPRESSED);
    expect(rows[0].value).toBeNull();
  });
});

describe("indexing", () => {
  it("indexes every available period to a declared base of 100", () => {
    const { rows } = applyCalculation("indexed", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      params: { baseYear: 2020 },
      comparisonId: COMPARISON_ID,
    });

    expect(Object.fromEntries(rows.map((row) => [row.period, row.value]))).toEqual(
      PROJECTIONS_EXPECTED.sfLatinaWomen.indexedToBase2020,
    );
    expect(rows.every((row) => row.unit === "index")).toBe(true);
  });

  it("retains null gaps rather than closing them", () => {
    const { rows } = applyCalculation("indexed", {
      observations: projections({
        Location: "San Francisco",
        "Race/Ethnicity": "Black",
        Sex: "Female",
        "Age Group": "All Ages",
        Source: "DoF P-3",
      }),
      measure: populationMeasure,
      params: { baseYear: 2020 },
      comparisonId: COMPARISON_ID,
    });

    // 10000 -> suppressed -> 9000, indexed on 2020.
    expect(rows.map((row) => [row.period, row.value, row.status])).toEqual([
      [2020, 100, OBSERVATION_STATUS.AVAILABLE],
      [2025, null, OBSERVATION_STATUS.SUPPRESSED],
      [2030, 90, OBSERVATION_STATUS.AVAILABLE],
    ]);
  });

  it("blocks the comparison when the base period has no value", () => {
    const { issues } = applyCalculation("indexed", {
      observations: projections({
        Location: "San Francisco",
        "Race/Ethnicity": "Black",
        Sex: "Female",
        "Age Group": "All Ages",
        Source: "DoF P-3",
      }),
      measure: populationMeasure,
      params: { baseYear: 2025 },
      comparisonId: COMPARISON_ID,
    });

    expect(issues).toEqual([
      expect.objectContaining({ code: "baseValueUnavailable", level: "comparison" }),
    ]);
  });
});

describe("difference from benchmark", () => {
  it("aligns a benchmark by period and geography", () => {
    const benchmark = projections({
      Location: "California",
      "Race/Ethnicity": "Hispanic",
      Sex: "Female",
      "Age Group": "All Ages",
      Source: "DoF P-3",
    });

    const { rows } = applyCalculation("benchmarkDifference", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      params: { benchmark: { geographyId: "California", observations: benchmark } },
      comparisonId: COMPARISON_ID,
    });

    const row2025 = rows.find((row) => row.period === 2025);
    expect(row2025.value).toBe(PROJECTIONS_EXPECTED.sfLatinaWomen.benchmarkDifference2025);
    // Every output period is subtracted against its OWN benchmark period. A
    // single benchmark value reused across years is the bug this guards.
    expect(rows.map((row) => row.value)).toEqual([
      40000 - 7800000,
      50000 - 8000000,
      60000 - 8200000,
    ]);
  });

  it("never subtracts a mismatched period", () => {
    const benchmark = projections({
      Location: "California",
      "Race/Ethnicity": "Hispanic",
      Sex: "Female",
      "Age Group": "All Ages",
      Source: "DoF P-3",
    }).filter((row) => row.period === 2025);

    const { rows } = applyCalculation("benchmarkDifference", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      params: { benchmark: { geographyId: "California", observations: benchmark } },
      comparisonId: COMPARISON_ID,
    });

    // 2020 and 2030 have no aligned benchmark, so they are missing - not
    // silently compared against the 2025 value.
    expect(rows.map((row) => [row.period, row.status])).toEqual([
      [2020, OBSERVATION_STATUS.MISSING],
      [2025, OBSERVATION_STATUS.AVAILABLE],
      [2030, OBSERVATION_STATUS.MISSING],
    ]);
  });

  it("propagates missing and suppressed status from either side", () => {
    const suppressedBenchmark = projections({
      Location: "San Francisco",
      "Race/Ethnicity": "Black",
      Sex: "Female",
      "Age Group": "All Ages",
      Source: "DoF P-3",
    });

    const { rows } = applyCalculation("benchmarkDifference", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      params: {
        benchmark: { geographyId: "San Francisco", observations: suppressedBenchmark },
      },
      comparisonId: COMPARISON_ID,
    });

    expect(rows.find((row) => row.period === 2025)).toMatchObject({
      status: OBSERVATION_STATUS.SUPPRESSED,
      value: null,
    });
  });
});

describe("average of selected years", () => {
  it("averages only a complete selected-year set", () => {
    const { rows, issues } = applyCalculation("averageSelectedYears", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      params: { years: [2020, 2025, 2030] },
      comparisonId: COMPARISON_ID,
    });

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(PROJECTIONS_EXPECTED.sfLatinaWomen.averageOfAllThreeYears);
    expect(rows[0].valueKind).toBe(VALUE_KINDS.DERIVED);
    // The included years travel with the number so the chart note, the table,
    // and the CSV can all say which years went into it.
    expect(rows[0].includedPeriods).toEqual([2020, 2025, 2030]);
  });

  it("requires at least two selected years", () => {
    const { issues } = applyCalculation("averageSelectedYears", {
      observations: sfLatinaWomen(),
      measure: populationMeasure,
      params: { years: [2025] },
      comparisonId: COMPARISON_ID,
    });
    expect(issues).toEqual([
      expect.objectContaining({ code: "twoYearsRequiredForAverage", level: "comparison" }),
    ]);
  });

  it("does not average when one selected year is missing", () => {
    const { rows } = applyCalculation("averageSelectedYears", {
      observations: projections({
        Location: "Los Angeles",
        "Race/Ethnicity": "Black",
        Sex: "Female",
        "Age Group": "All Ages",
        Source: "DoF P-3",
      }),
      measure: populationMeasure,
      params: { years: [2020, 2025] },
      comparisonId: COMPARISON_ID,
    });

    // 90000 and a gap do not average to 90000, and they do not average to
    // 45000 either. The mean of an incomplete set is not a number.
    expect(rows[0]).toMatchObject({
      status: OBSERVATION_STATUS.MISSING,
      value: null,
    });
    expect(rows[0].includedPeriods).toEqual([2020]);
    expect(rows[0].unavailablePeriods).toEqual([2025]);
  });

  it("does not average when one selected year is suppressed", () => {
    const { rows } = applyCalculation("averageSelectedYears", {
      observations: projections({
        Location: "San Francisco",
        "Race/Ethnicity": "Black",
        Sex: "Female",
        "Age Group": "All Ages",
        Source: "DoF P-3",
      }),
      measure: populationMeasure,
      params: { years: [2020, 2025] },
      comparisonId: COMPARISON_ID,
    });

    // Suppression is stronger than absence: returning an average here would
    // hand back an inferred value for a cell the source deliberately withheld.
    expect(rows[0]).toMatchObject({
      status: OBSERVATION_STATUS.SUPPRESSED,
      value: null,
    });
    expect(rows[0].unavailablePeriods).toEqual([2025]);
  });
});
