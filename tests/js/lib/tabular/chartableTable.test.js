/**
 * Import overhaul, phase 1: ignored columns and marked rows stay in the grid
 * but never reach a chart, a ranking, or the mapping.
 */

import { describe, expect, it } from "vitest";

import { createChartConfig, reduceChartConfig } from "@/components/chart-builder/chartConfigStore";
import { chartableTable, profileColumns } from "@/lib/tabular/columnTypes";
import { parsePaste } from "@/lib/tabular/parseTable";
import { executeInlineQuestion, tableToObservations } from "@/lib/tabular/toObservations";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { autoMapInlineBindings, inlineFields } from "@/lib/visualization/inlineMapping";
import { profileTable, rankInlineCharts } from "@/lib/visualization/inlineProfile";
import { deriveInlineComparisons, guessInlineBindings } from "@/lib/visualization/inlineQuestion";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";
import { boundInline } from "@/tests/fixtures/byod-shapes/helpers";

const table = () => ({
  columns: [
    { name: "Nation", type: "text" },
    { name: "Note", type: "text", ignored: true },
    { name: "Yes", type: "number", unit: "number" },
    { name: "No", type: "number", unit: "number" },
  ],
  rows: [
    ["Britain", "a", "40", "60"],
    ["France", "b", "30", "70"],
    ["Total", "c", "70", "130"],
  ],
  rowMarks: { 2: "total" },
});

describe("chartableTable", () => {
  it("drops ignored columns and marked rows, keeping everything else", () => {
    const chartable = chartableTable(table());
    expect(chartable.columns.map((c) => c.name)).toEqual(["Nation", "Yes", "No"]);
    expect(chartable.rows).toEqual([["Britain", "40", "60"], ["France", "30", "70"]]);
  });
  it("returns a table with nothing to drop unchanged", () => {
    const plain = { columns: [{ name: "A", type: "text" }], rows: [["x"]] };
    expect(chartableTable(plain)).toBe(plain);
  });
});

describe("consumers read the chartable table", () => {
  it("finds parts of a whole without the marked total row", () => {
    // Without the total row every remaining row adds up to 100.
    expect(profileColumns(table()).filter((c) => c.type === "number").map((c) => c.unit)).toEqual(["percent", "percent"]);
  });
  it("never ranks or maps an ignored column", () => {
    const profile = profileTable(table());
    expect(profile.labels.map((label) => label.name)).toEqual(["Nation"]);
    expect(Object.keys(inlineFields(table()))).toEqual(["Nation", "Yes", "No"]);
    expect(Object.values(autoMapInlineBindings("bar", table()))).not.toContain("Note");
    expect(Object.values(guessInlineBindings("bar", table())).flat()).not.toContain("Note");
    expect(rankInlineCharts(profile)[0].bindings.category).toBe("Nation");
  });
  it("draws no observation for a marked row", () => {
    const rows = tableToObservations(table(), { chartType: "bar", bindings: { category: "Nation", y: "Yes" }, measure: { id: "Yes" } });
    expect(rows.map((row) => row.categoryLabel)).toEqual(["Britain", "France"]);
  });
  it("derives no comparison from a marked row", () => {
    const labels = deriveInlineComparisons(table(), "bar", { category: "Yes", y: "No", group: "Nation" }).map((c) => c.label);
    expect(labels).toEqual(["Britain", "France"]);
  });
  it("does not warn about rows that share a place when the extra row is marked", () => {
    const shared = { ...table(), rows: [...table().rows, ["Britain", "d", "1", "2"]], rowMarks: { 2: "total", 3: "excluded" } };
    const result = executeInlineQuestion(boundInline(shared, "bar", { category: "Nation", y: "Yes" }));
    expect(result.issues.map((issue) => issue.code)).not.toContain("inlineRowsShareMapping");
  });
});

describe("the store recalculates formulas", () => {
  it("writes formula values on every table edit", () => {
    const fresh = createChartConfig(BYOD_SCHEMA, getDefaultQuestion("byod"), { autoBind: true });
    const edited = reduceChartConfig(fresh, {
      type: "SET_DATA_SOURCE",
      source: "inline",
      inline: { ...table(), rows: table().rows.map((row, index) => (index === 0 ? [row[0], row[1], "", row[3]] : row)), formulas: { "0:2": "=100 - D2" } },
    }, BYOD_SCHEMA);
    expect(edited.question.dataset.inline.rows[0][2]).toBe("40");
  });
});

describe("the import keeps what it read", () => {
  it("records the raw grid so the table can be read again", async () => {
    const { value } = await parsePaste("Title line\t\nRegion\tJobs\nNorth\t12\n");
    expect(value.meta.raw).toEqual([["Title line", ""], ["Region", "Jobs"], ["North", "12"]]);
  });
});
