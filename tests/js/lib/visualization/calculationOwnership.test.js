/**
 * Workstream B - the transform guarantees under their new owner.
 *
 * Belongs to `transformRegistry.test.js` and folds back into it - replacing the
 * blocks there - once `lib/data/visualization/calculationRegistry.js` and
 * `lib/tabular/toObservations.js` exist. Split out only so an unwritten module
 * does not stop the live transform tests from collecting.
 */

import { describe, expect, it } from "vitest";

/**
 * Workstream B - the same guarantees, moved to their new owner.
 *
 * The assertions above still describe `transformRegistry.js` while it is live.
 * The block below re-states the five that are load-bearing - null preservation,
 * the zero base, immutability, the rate-unit rule, and benchmark alignment -
 * against `lib/data/visualization/calculationRegistry.js`, which owns them once
 * the calculation moves to the backend.
 *
 * The point is NOT that the browser keeps doing the arithmetic. It is that
 * inline "bring your own data" runs the same functions locally, because there
 * is no server dataset to ask, and so must produce identical numbers. When
 * Workstream H retires `transformRegistry.js`, the blocks above are deleted and
 * this one is what remains.
 *
 * Dynamic imports keep this block failing on its own while the calculation
 * registry is still being written, instead of taking the live transform tests
 * down with it.
 */
const calculationRegistry = () => import("@/lib/data/visualization/calculationRegistry");
const toObservations = () => import("@/lib/tabular/toObservations");

const COMPARISON_ID = "cmp_parity";

/** A one-comparison series as observation-contract rows. */
function observationSeries(values, years = values.map((_, index) => 2020 + index), unit = "people") {
  return values.map((value, index) => ({
    comparisonId: COMPARISON_ID,
    comparisonLabel: "Testville",
    measureId: "Stock",
    measureLabel: "Stock",
    unit,
    period: years[index],
    geographyId: "Testville",
    geographyLabel: "Testville",
    categoryId: null,
    categoryLabel: null,
    value,
    status: value === null ? "missing" : "available",
    valueKind: "observed",
    calculation: { id: "actual", params: {} },
    includedPeriods: null,
    source: "Test",
  }));
}

const countMeasure = {
  id: "Stock",
  unit: "people",
  aggregation: "notAllowed",
  calculations: ["actual", "indexed", "numericChange", "percentChange"],
};
const rateMeasure = {
  id: "Rate",
  unit: "percent",
  aggregation: "notAllowed",
  calculations: ["actual", "percentagePointChange"],
};

describe("calculation eligibility moves to the shared registry", () => {
  it("permits a calculation the field catalog declares", async () => {
    const { isCalculationAllowed } = await calculationRegistry();
    expect(isCalculationAllowed("percentChange", countMeasure)).toBe(true);
  });

  it("blocks percent change on a rate field (guardrail #4)", async () => {
    const { isCalculationAllowed } = await calculationRegistry();
    expect(isCalculationAllowed("percentChange", rateMeasure)).toBe(false);
    expect(isCalculationAllowed("percentagePointChange", rateMeasure)).toBe(true);
  });

  it("only allows actual when a measure declares no calculations", async () => {
    const { isCalculationAllowed } = await calculationRegistry();
    const bare = { id: "Bare", unit: "count" };
    expect(isCalculationAllowed("actual", bare)).toBe(true);
    expect(isCalculationAllowed("indexed", bare)).toBe(false);
  });

  it("decides eligibility from the measure, never from a chart id", async () => {
    const { calculationOptionsFor } = await calculationRegistry();
    // The chart capability narrows the list afterwards; the measure decides
    // what is mathematically valid in the first place.
    const forLine = calculationOptionsFor(rateMeasure, { chartType: "line" });
    const forBar = calculationOptionsFor(rateMeasure, { chartType: "bar" });
    for (const options of [forLine, forBar]) {
      expect(options).not.toContain("percentChange");
    }
  });
});

describe("the preserved arithmetic guarantees, under their new owner", () => {
  it("preserves nulls instead of coercing them to zero", async () => {
    const { applyCalculation } = await calculationRegistry();
    const { rows } = applyCalculation("indexed", {
      observations: observationSeries([100, null, 150]),
      measure: countMeasure,
      params: { baseYear: 2020 },
      comparisonId: COMPARISON_ID,
    });
    expect(rows.map((row) => row.value)).toEqual([100, null, 150]);
  });

  it("rejects a zero base instead of returning infinity or zero", async () => {
    const { applyCalculation } = await calculationRegistry();
    const { rows, issues } = applyCalculation("percentChange", {
      observations: observationSeries([0, 120], [2020, 2021]),
      measure: countMeasure,
      params: { startYear: 2020, endYear: 2021 },
      comparisonId: COMPARISON_ID,
    });
    expect(issues).toEqual([
      expect.objectContaining({ code: "zeroBaseValue", comparisonId: COMPARISON_ID }),
    ]);
    expect(rows.some((row) => row.value === Infinity || row.value === 0)).toBe(false);
  });

  it("does not mutate the observations it was given", async () => {
    const { applyCalculation } = await calculationRegistry();
    const input = observationSeries([100, 200]);
    const snapshot = JSON.parse(JSON.stringify(input));
    applyCalculation("indexed", {
      observations: input,
      measure: countMeasure,
      params: { baseYear: 2020 },
      comparisonId: COMPARISON_ID,
    });
    expect(input).toEqual(snapshot);
  });

  it("subtracts a benchmark aligned by period and returns null where either side is missing", async () => {
    const { applyCalculation } = await calculationRegistry();
    const { rows } = applyCalculation("benchmarkDifference", {
      observations: observationSeries([15, 25], [2020, 2021]),
      measure: countMeasure,
      params: {
        benchmark: {
          geographyId: "Testville",
          observations: observationSeries([10, null], [2020, 2021]),
        },
      },
      comparisonId: COMPARISON_ID,
    });
    expect(rows.map((row) => row.value)).toEqual([5, null]);
  });
});

describe("inline data runs the same functions, not a second implementation", () => {
  const inlineTable = {
    columns: [
      { name: "County", type: "text" },
      { name: "Year", type: "date" },
      { name: "Population", type: "number" },
    ],
    rows: [
      ["Fresno", "2020", "100"],
      ["Fresno", "2021", "150"],
    ],
  };

  it("produces observation-contract rows from an imported table", async () => {
    const { tableToObservations } = await toObservations();
    const rows = tableToObservations(inlineTable, {
      bindings: { period: "Year", value: "Population", comparison: "County" },
      measure: { id: "Population", unit: "count" },
    });

    expect(rows.map((row) => [row.period, row.value, row.status])).toEqual([
      [2020, 100, "available"],
      [2021, 150, "available"],
    ]);
    expect(new Set(rows.map((row) => row.comparisonId)).size).toBe(1);
  });

  it("gives an inline percent change the same answer as a module percent change", async () => {
    const { applyCalculation } = await calculationRegistry();
    const { tableToObservations } = await toObservations();

    const inline = applyCalculation("percentChange", {
      observations: tableToObservations(inlineTable, {
        bindings: { period: "Year", value: "Population", comparison: "County" },
        measure: { id: "Population", unit: "count" },
      }),
      measure: { id: "Population", unit: "count", calculations: ["actual", "percentChange"] },
      params: { startYear: 2020, endYear: 2021 },
      comparisonId: "cmp_inline",
    });

    const module = applyCalculation("percentChange", {
      observations: observationSeries([100, 150], [2020, 2021]),
      measure: countMeasure,
      params: { startYear: 2020, endYear: 2021 },
      comparisonId: COMPARISON_ID,
    });

    expect(inline.rows[0].value).toBe(50);
    expect(inline.rows[0].value).toBe(module.rows[0].value);
    expect(inline.rows[0].includedPeriods).toEqual(module.rows[0].includedPeriods);
    expect(inline.rows[0].valueKind).toBe(module.rows[0].valueKind);
  });

  it("blocks an inline calculation the imported measure cannot support", async () => {
    const { isCalculationAllowed } = await calculationRegistry();
    // An imported column typed as a percentage gets the same rate rule as a
    // module rate. Inline data is not an escape hatch from the unit gate.
    expect(
      isCalculationAllowed("percentChange", {
        id: "Share",
        unit: "percent",
        calculations: ["actual", "percentagePointChange"],
      }),
    ).toBe(false);
  });
});
