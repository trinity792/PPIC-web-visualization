/**
 * v3 authoring for bring-your-own-data: the bridge from role→column bindings
 * to a question's outcome, comparisons, and periods.
 */

import { describe, expect, it } from "vitest";

import {
  deriveInlineComparisons,
  guessInlineBindings,
  inlineMeasureColumn,
  inlinePeriods,
  inlineTableOf,
  periodToken,
  resolveInlineRoles,
  unboundInlineRoles,
  withInlineBindings,
} from "@/lib/visualization/inlineQuestion";

const TABLE = {
  columns: [
    { name: "Year", type: "date" },
    { name: "Region", type: "text" },
    { name: "Population", type: "number" },
    { name: "Share", type: "number" },
  ],
  rows: [
    ["2021", "North", "150", "0.5"],
    ["2020", "North", "100", "0.4"],
    ["2020", "South", "80", "0.3"],
  ],
};

describe("periodToken", () => {
  it("makes years numeric and leaves finer tokens as strings", () => {
    expect(periodToken("2020")).toBe(2020);
    expect(periodToken(2020)).toBe(2020);
    expect(periodToken("2020-06")).toBe("2020-06");
    expect(periodToken("")).toBeNull();
  });
});

describe("resolveInlineRoles", () => {
  it("maps each chart family's roles onto the observation parts", () => {
    expect(resolveInlineRoles("line", { x: "Year", y: "Population", series: "Region" })).toEqual({
      period: "Year",
      value: "Population",
      // Dataset-range plan, workstream 4: a value-list role always reports its list.
      values: ["Population"],
      comparison: "Region",
    });
    expect(resolveInlineRoles("bar", { category: "Region", y: "Share", group: "Year" })).toEqual({
      category: "Region",
      value: "Share",
      values: ["Share"],
      comparison: "Year",
    });
    expect(resolveInlineRoles("dotPlot", { y: "Region", x: "Year", color: "Share" })).toEqual({
      category: "Region",
      comparison: "Year",
      value: "Share",
      values: ["Share"],
    });
    expect(
      resolveInlineRoles("bubble", { x: "Population", y: "Share", size: "Population", unit: "Region" }),
    ).toMatchObject({ xValue: "Population", value: "Share", size: "Population", category: "Region" });
    expect(resolveInlineRoles("forest", { category: "Region", start: "Low", end: "High" })).toMatchObject({
      interval: { start: "Low", end: "High", midpointEstimate: true },
    });
    expect(resolveInlineRoles("dumbbell", { category: "Region", start: "Low", end: "High" })).toMatchObject({
      interval: { midpointEstimate: false },
    });
  });

  it("names the outcome column from the chart's measure role", () => {
    expect(inlineMeasureColumn("line", { x: "Year", y: "Population" })).toBe("Population");
    expect(inlineMeasureColumn("heatmap", { x: "Year", y: "Region", color: "Share" })).toBe("Share");
    expect(inlineMeasureColumn("forest", { category: "Region", start: "Low", end: "High" })).toBe("Low");
    expect(inlineMeasureColumn("line", { x: "Year" })).toBeNull();
  });
});

describe("derived question parts", () => {
  it("lists the bound time column's periods, sorted and distinct", () => {
    expect(inlinePeriods(TABLE, "line", { x: "Year", y: "Population" })).toEqual([2020, 2021]);
    expect(inlinePeriods(TABLE, "bar", { category: "Region", y: "Population" })).toEqual([]);
  });

  it("makes one comparison per distinct comparison value, keeping ids and edits", () => {
    const first = deriveInlineComparisons(TABLE, "line", { x: "Year", y: "Population", series: "Region" });
    expect(first.map((entry) => [entry.id, entry.label])).toEqual([
      ["cmp_inline_1", "North"],
      ["cmp_inline_2", "South"],
    ]);

    const edited = [{ ...first[1], customLabel: "The South", color: "#123456" }];
    const again = deriveInlineComparisons(
      TABLE,
      "line",
      { x: "Year", y: "Population", series: "Region" },
      edited,
    );
    expect(again[1]).toMatchObject({ id: "cmp_inline_2", customLabel: "The South", color: "#123456" });
  });

  it("names the single comparison after its value column when no comparison column is bound", () => {
    expect(deriveInlineComparisons(TABLE, "line", { x: "Year", y: "Population" })).toEqual([
      { id: "cmp_inline_1", label: "Population", dimensions: {}, customLabel: null, color: null },
    ]);
  });

  it("names the required roles still unbound", () => {
    expect(unboundInlineRoles("line", TABLE, { y: "Population" })).toEqual(["x"]);
    expect(unboundInlineRoles("line", TABLE, { x: "Gone", y: "Population" })).toEqual(["x"]);
    expect(unboundInlineRoles("line", TABLE, { x: "Year", y: "Population" })).toEqual([]);
  });

  it("rebuilds dataset, outcome and comparisons from the bindings", () => {
    const spec = withInlineBindings(
      { version: 3, question: { comparisons: [] }, presentation: { chartType: "line" } },
      TABLE,
      "line",
      { x: "Year", y: "Population", series: "Region" },
    );
    expect(spec.question.dataset).toEqual({
      kind: "inline",
      inline: TABLE,
      bindings: { x: "Year", y: "Population", series: "Region" },
    });
    expect(spec.question.outcomes).toEqual([{
      role: "y",
      measureId: "Population",
      measureLabel: "Population",
      unit: "number",
    }]);
    expect(spec.question.comparisons).toHaveLength(2);
  });
});

describe("guessInlineBindings", () => {
  it("binds a lone spare dimension as the series so rows do not fold into one line", () => {
    // ("Share" wins y by name synonym - the auto-map's own rule, unchanged.)
    expect(guessInlineBindings("line", TABLE)).toEqual({
      x: "Year",
      y: "Share",
      series: "Region",
    });
  });

  it("gives a roleless data table implicit period, comparison, and value columns", () => {
    expect(guessInlineBindings("dataTable", TABLE)).toEqual({
      value: "Population",
      period: "Year",
      comparison: "Region",
    });
  });
});

describe("inlineTableOf", () => {
  it("reads the table from a v3 question or a v2 data block", () => {
    expect(inlineTableOf({ question: { dataset: { kind: "inline", inline: TABLE } } })).toBe(TABLE);
    expect(inlineTableOf({ data: { source: "inline", inline: TABLE } })).toBe(TABLE);
    expect(inlineTableOf({ question: { dataset: { kind: "module" } } })).toBeNull();
  });
});

import * as datasetInlineQuestion from "@/lib/visualization/inlineQuestion";
import { boundInline as datasetBoundInline } from "@/tests/fixtures/byod-shapes/helpers";
const wideDataset = {
  columns: [{ name: "Date", type: "date" }, { name: "Nation", type: "text" },
    { name: "Share", type: "number", unit: "percent" }, { name: "Cost", type: "number", unit: "usd" }],
  rows: [["Feb 2020", "Britain", "40", "120"], ["Jan 2020", "France", "60", "130"]],
};
describe("dataset range: inline bindings", () => {
  it("reads a single column name and a list the same way", () => {
    expect(datasetInlineQuestion.bindingColumns("Share")).toEqual(["Share"]);
    expect(datasetInlineQuestion.bindingColumns(["Share"])).toEqual(["Share"]);
    expect(datasetInlineQuestion.bindingColumns(null)).toEqual([]);
    for (const y of ["Share", ["Share"]]) expect(resolveInlineRoles("line", { x: "Date", y })).toMatchObject({ value: "Share", values: ["Share"] });
  });
  it("makes one comparison per value column, labelled by the column", () => {
    expect(deriveInlineComparisons(wideDataset, "line", { x: "Date", y: ["Share", "Cost"] })).toMatchObject([
      { label: "Share", valueColumn: "Share" }, { label: "Cost", valueColumn: "Cost" },
    ]);
  });
  it("makes one comparison per pair when a comparison column is also mapped", () => {
    expect(deriveInlineComparisons(wideDataset, "line", { x: "Date", y: ["Share", "Cost"], series: "Nation" }).map(c => c.label)).toEqual([
      "Britain - Share", "Britain - Cost", "France - Share", "France - Cost",
    ]);
  });
  it("keeps a custom label and color when the value list changes", () => {
    const previous = [{ id: "stable", label: "Share", valueColumn: "Share", customLabel: "Our share", color: "#293B54" }];
    const result = deriveInlineComparisons(wideDataset, "line", { x: "Date", y: ["Cost", "Share"] }, previous);
    expect(result.map(c => c.label)).toEqual(["Cost", "Share"]);
    expect(result[1]).toMatchObject(previous[0]);
    expect(new Set(result.map(c => c.id)).size).toBe(2);
  });
  it("takes each outcome's unit from its column", () => {
    const spec = datasetBoundInline(wideDataset, "scatter", { x: "Cost", y: "Share", unit: "Nation" });
    expect(spec.question.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "x", measureId: "Cost", unit: "usd" }),
      expect.objectContaining({ role: "y", measureId: "Share", unit: "percent" }),
    ]));
    expect(datasetBoundInline(wideDataset, "line", { x: "Date", y: ["Share", "Cost"] }).question.outcomes).toMatchObject([{ role: "y", measureId: "Share", unit: "percent" }]);
  });
  it("sorts month-name periods by date, not alphabetically", () => {
    expect(inlinePeriods(wideDataset, "line", { x: "Date", y: "Share" })).toEqual(["Jan 2020", "Feb 2020"]);
  });
  it("names a lone series after its value column, not Data", () => {
    expect(deriveInlineComparisons(wideDataset, "line", { x: "Date", y: "Share" }).map(c => c.label)).toEqual(["Share"]);
  });
  it("auto-maps all value columns unless a comparison column is present", () => {
    const table = { columns: wideDataset.columns.filter(c => c.name !== "Nation"), rows: wideDataset.rows.map(([date, , share, cost]) => [date, share, cost]) };
    expect(guessInlineBindings("line", table)).toEqual({ x: "Date", y: ["Share", "Cost"] });
    expect(guessInlineBindings("line", wideDataset)).toEqual({ x: "Date", y: "Share", series: "Nation" });
  });
});
