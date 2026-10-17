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

import { boundInline as datasetSpec } from "@/tests/fixtures/byod-shapes/helpers";
const datasetTable = {
  columns: [{ name: "Date", type: "date", granularity: "month" }, { name: "Chrome", type: "number", unit: "percent" }, { name: "Budget", type: "number", unit: "usd" }],
  rows: [["2020-01", "40%", ""], ["2020-02", "n/a", "$1,200"], ["2020-03", "(D)", "$1,400"]],
};
const datasetRows = (table = datasetTable, y = ["Chrome", "Budget"]) => tableToObservations(table, {
  chartType: "line", bindings: { x: "Date", y }, measure: { id: "Chrome", unit: "percent" },
});
describe("dataset range: observations", () => {
  it("gives suppressed cells suppressed status and placeholders missing status", () => {
    expect(datasetRows(datasetTable, "Chrome").map(r => [r.value, r.status])).toEqual([[40, "available"], [null, "missing"], [null, "suppressed"]]);
  });
  it("uses the table's detected source in place of Inline data", () => {
    const rows = datasetRows({ ...datasetTable, meta: { source: "Example survey" } }, "Chrome");
    expect(rows.map(r => r.source)).toEqual(["Example survey", "Example survey", "Example survey"]);
  });
  it("adds periodPosition and keeps the period label", () => {
    const rows = datasetRows(datasetTable, "Chrome");
    expect(rows.map(r => r.period)).toEqual(["2020-01", "2020-02", "2020-03"]);
    [2020, 2020 + 1 / 12, 2020 + 2 / 12].forEach((position, i) => expect(rows[i].periodPosition).toBeCloseTo(position, 8));
  });
  it("emits one observation per row per value column with that column's unit", () => {
    const rows = datasetRows();
    expect(rows).toHaveLength(6);
    expect(rows.filter(r => r.measureId === "Chrome")).toHaveLength(3);
    expect(rows.filter(r => r.measureId === "Budget")).toHaveLength(3);
    for (const row of rows) {
      expect(row.measureLabel).toBe(row.measureId);
      expect(row.unit).toBe(row.measureId === "Chrome" ? "percent" : "usd");
      expect(validateObservation(row).valid).toBe(true);
    }
    expect(rows.filter(r => r.measureId === "Budget").map(r => r.value)).toEqual([null, 1200, 1400]);
    expect(new Set(rows.map(r => r.comparisonId)).size).toBe(2);
  });
  it("reads years across the top as periods", () => {
    const table = { columns: [{ name: "Location", type: "text" }, ...["2019", "2020", "2021"].map(name => ({ name, type: "number", unit: "number" }))], rows: [["North", "10", "20", "30"], ["South", "40", "50", "60"]] };
    const spec = datasetSpec(table, "line", { series: "Location", y: ["2019", "2020", "2021"], valuesArePeriods: true });
    const result = executeInlineQuestion(spec);
    expect(result.observations).toHaveLength(6);
    expect(result.periods).toEqual([2019, 2020, 2021]);
    expect(result.observations.map(r => [r.comparisonLabel, r.period, r.value])).toEqual([
      ["North", 2019, 10], ["North", 2020, 20], ["North", 2021, 30],
      ["South", 2019, 40], ["South", 2020, 50], ["South", 2021, 60],
    ]);
  });
  it("starts a series at its first filled cell", () => {
    expect(datasetRows().filter(r => r.measureId === "Budget").map(r => [r.value, r.status])).toEqual([[null, "missing"], [1200, "available"], [1400, "available"]]);
  });
  it("uses the detected number convention in observations", () => {
    const table = { columns: [{ name: "Date", type: "date" }, { name: "Chrome", type: "number", unit: "number", locale: "eu" }], rows: [["2020-01", "1.234,5"]] };
    expect(datasetRows(table, "Chrome")[0].value).toBe(1234.5);
  });
});
