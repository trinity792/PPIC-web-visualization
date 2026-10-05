/**
 * The bring-your-own-data v3 executor: a typed table becomes the same
 * observations a module adapter returns, per chart family, and an inline
 * question runs through the shared calculation registry.
 */

import { describe, expect, it } from "vitest";

import { executeInlineQuestion, tableToObservations } from "@/lib/tabular/toObservations";
import { validateObservation } from "@/lib/visualization/observationContract";

const TABLE = {
  columns: [
    { name: "Year", type: "date" },
    { name: "Region", type: "text" },
    { name: "Population", type: "number" },
    { name: "Share", type: "number" },
    { name: "Low", type: "number" },
    { name: "High", type: "number" },
  ],
  rows: [
    ["2020", "North", "100", "0.4", "90", "110"],
    ["2021", "North", "150", "0.5", "140", "160"],
    ["2020", "South", "80", "", "70", "90"],
    ["2021", "South", "120", "0.35", "110", "130"],
  ],
};

const measure = { id: "Population", unit: "number" };

function inlineSpec({ chartType, bindings, time = { contract: "none" }, calculation, comparisons = [] }) {
  return {
    version: 3,
    question: {
      dataset: { kind: "inline", inline: TABLE, bindings },
      outcome: { measureId: bindings.y || bindings.color || bindings.start, unit: "number" },
      time,
      calculation: calculation || { id: "actual", params: {} },
      comparisons,
    },
    presentation: { chartType },
  };
}

describe("tableToObservations per chart family", () => {
  it("draws a line's series from the bound series column and keeps period tokens", () => {
    const rows = tableToObservations(TABLE, {
      chartType: "line",
      bindings: { x: "Year", y: "Population", series: "Region" },
      measure,
    });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.comparisonLabel))).toEqual(new Set(["North", "South"]));
    expect(rows.map((row) => row.period)).toEqual([2020, 2021, 2020, 2021]);
    for (const row of rows) expect(validateObservation(row).valid).toBe(true);
  });

  it("keeps a month token whole instead of truncating it to a year", () => {
    const monthly = {
      columns: [{ name: "Month", type: "date" }, { name: "Units", type: "number" }],
      rows: [["2024-01", "5"], ["2024-02", "7"]],
    };
    const rows = tableToObservations(monthly, {
      chartType: "line",
      bindings: { x: "Month", y: "Units" },
      measure: { id: "Units" },
    });
    expect(rows.map((row) => row.period)).toEqual(["2024-01", "2024-02"]);
  });

  it("reports an empty number cell as missing, never as zero", () => {
    const rows = tableToObservations(TABLE, {
      chartType: "bar",
      bindings: { category: "Region", y: "Share" },
      measure: { id: "Share" },
    });
    const blank = rows.find((row) => row.categoryLabel === "South" && row.value === null);
    expect(blank.status).toBe("missing");
  });

  it("expands a forest row into estimate, lower and upper bound observations", () => {
    const first = tableToObservations(TABLE, {
      chartType: "forest",
      bindings: { category: "Region", start: "Low", end: "High", point: "Population" },
      measure,
    }).slice(0, 3);
    expect(first.map((row) => [row.measureRole, row.value])).toEqual([
      ["estimate", 100],
      ["lowerBound", 90],
      ["upperBound", 110],
    ]);
  });

  it("uses the interval midpoint as the estimate when no estimate column is bound", () => {
    const [estimate] = tableToObservations(TABLE, {
      chartType: "forest",
      bindings: { category: "Region", start: "Low", end: "High" },
      measure: { id: "Low" },
    });
    expect(estimate).toMatchObject({ measureRole: "estimate", value: 100 });
  });

  it("gives a range its two endpoints, named by column when there is no time", () => {
    const rows = tableToObservations(TABLE, {
      chartType: "dumbbell",
      bindings: { category: "Region", start: "Low", end: "High" },
      measure: { id: "Low" },
    });
    // No time column is bound for a range, so the endpoint column names are the
    // periods the table and export show.
    expect(rows.slice(0, 2).map((row) => [row.period, row.value])).toEqual([
      ["Low", 90],
      ["High", 110],
    ]);
  });

  it("carries a scatter's x and a bubble's size as extra measures", () => {
    const rows = tableToObservations(TABLE, {
      chartType: "bubble",
      bindings: { x: "Population", y: "Share", size: "Low", unit: "Region" },
      measure: { id: "Share" },
    });
    expect(rows.slice(0, 3)).toMatchObject([
      { value: 0.4, categoryLabel: "North" },
      { measureRole: "x", value: 100, categoryLabel: "North" },
      { measureRole: "size", value: 90, categoryLabel: "North" },
    ]);
  });

  it("turns a pasted scatter table into one row per measure", () => {
    // Workstream Q: pasted data takes the module shape, one row per measure,
    // the extra measures tagged with their role and each with its own status.
    const rows = tableToObservations(TABLE, {
      chartType: "scatter",
      bindings: { x: "Population", y: "Share", unit: "Region" },
      measure: { id: "Share" },
    });

    // 4 table rows x 2 measures.
    expect(rows).toHaveLength(8);
    expect(rows.some((row) => "xValue" in row)).toBe(false);
    const y = rows.filter((row) => row.measureRole === undefined);
    const x = rows.filter((row) => row.measureRole === "x");
    expect(y).toHaveLength(4);
    expect(x).toHaveLength(4);
    expect(y.every((row) => row.measureId === "Share")).toBe(true);
    expect(x.every((row) => row.measureId === "Population")).toBe(true);
    expect(x[0]).toMatchObject({ value: 100, status: "available", categoryLabel: "North" });
    // South 2020 has an empty Share cell: the y row is missing, its x is not.
    const southY = y.find((row) => row.categoryLabel === "South" && row.period == null && row.value === null);
    expect(southY?.status).toBe("missing");
    expect(x.filter((row) => row.categoryLabel === "South").map((row) => row.value)).toEqual([80, 120]);
  });

  it("turns a pasted bubble table into x and size rows, and keeps a forest weight on sizeValue", () => {
    const bubble = tableToObservations(TABLE, {
      chartType: "bubble",
      bindings: { x: "Population", y: "Share", size: "Low", unit: "Region" },
      measure: { id: "Share" },
    });
    expect(bubble).toHaveLength(12);
    expect(bubble.filter((row) => row.measureRole === "size").map((row) => row.value)).toEqual([
      90, 140, 70, 110,
    ]);
    expect(bubble.some((row) => "sizeValue" in row)).toBe(false);

    const forest = tableToObservations(TABLE, {
      chartType: "forest",
      bindings: { category: "Region", start: "Low", end: "High", point: "Population", size: "Share" },
      measure: { id: "Population" },
    });
    expect(forest.every((row) => "sizeValue" in row)).toBe(true);
  });

  it("still accepts the chart-agnostic part names", () => {
    const rows = tableToObservations(TABLE, {
      bindings: { period: "Year", value: "Population", comparison: "Region" },
      measure,
    });
    expect(rows[0]).toMatchObject({ period: 2020, value: 100, comparisonLabel: "North" });
  });
});

describe("executeInlineQuestion", () => {
  it("reads every row of a timeless bar of categories", () => {
    const result = executeInlineQuestion(
      inlineSpec({ chartType: "bar", bindings: { category: "Region", y: "Population" } }),
    );
    expect(result.status).toBe("ok");
    expect(result.observations).toHaveLength(4);
    // No time column is bound, so the answer carries no periods at all.
    expect(result.periods).toEqual([]);
  });

  it("filters a line by its time range and names the derived comparisons", () => {
    const result = executeInlineQuestion(
      inlineSpec({
        chartType: "line",
        bindings: { x: "Year", y: "Population", series: "Region" },
        time: { contract: "range", startYear: 2021, endYear: 2021 },
        comparisons: [
          { id: "cmp_north", label: "North", dimensions: {} },
          { id: "cmp_south", label: "South", dimensions: {}, customLabel: "Southern" },
        ],
      }),
    );
    expect(result.periods).toEqual([2021]);
    expect(result.comparisons).toEqual([
      { id: "cmp_north", label: "North", status: "ok" },
      { id: "cmp_south", label: "Southern", status: "ok" },
    ]);
    expect(result.observations.map((row) => [row.comparisonId, row.value])).toEqual([
      ["cmp_north", 150],
      ["cmp_south", 120],
    ]);
  });

  it("runs the shared calculation with defaulted parameters", () => {
    const result = executeInlineQuestion(
      inlineSpec({
        chartType: "line",
        bindings: { x: "Year", y: "Population", series: "Region" },
        time: { contract: "range", startYear: 2020, endYear: 2021 },
        calculation: { id: "percentChange", params: {} },
      }),
    );
    // 100 → 150 and 80 → 120: both +50%, endpoints defaulted from the range.
    expect(result.observations.map((row) => row.value)).toEqual([50, 50]);
    expect(result.observations[0].calculation.id).toBe("percentChange");
  });

  it("ranks a bar's categories on the calculated values", () => {
    const result = executeInlineQuestion(
      inlineSpec({
        chartType: "bar",
        bindings: { category: "Region", y: "Population" },
        calculation: { id: "actual", params: { ranking: { n: 1, direction: "top" } } },
      }),
    );
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ categoryLabel: "North", value: 150 });
  });

  it("blocks with a plain reason when no table or outcome is present", () => {
    const result = executeInlineQuestion({
      version: 3,
      question: { dataset: { kind: "inline", inline: null, bindings: {} }, outcome: {} },
      presentation: { chartType: "line" },
    });
    expect(result.status).toBe("blocked");
    expect(result.issues[0]).toMatchObject({ code: "inlineQuestionIncomplete", level: "blocking" });
  });
});

it("ranks a pasted scatter by x and retains the same place's y", () => {
  const spec = inlineSpec({ chartType: "scatter", bindings: { x: "Share", y: "Population", unit: "Region" }, calculation: { id: "actual", params: { ranking: { role: "x", n: 1, direction: "top" } } } });
  spec.question.dataset.inline = { ...TABLE, rows: [TABLE.rows[0], TABLE.rows[3]] };
  const result = executeInlineQuestion(spec);
  expect(result.observations).toHaveLength(2);
  expect(result.observations.every(row => row.categoryLabel === "North")).toBe(true);
  expect(result.observations.find(row => !row.measureRole).value).toBe(100);
  expect(result.observations.find(row => row.measureRole === "x").value).toBe(0.4);
});
