import { describe, expect, it } from "vitest";
import { executeInlineQuestion, tableToObservations } from "@/lib/tabular/toObservations";
import { boundInline } from "@/tests/fixtures/byod-shapes/helpers";

const table = {
  columns: [{ name: "Job", type: "text" }, { name: "Nation", type: "text" }, { name: "Share", type: "number", unit: "percent" }],
  rows: [["Waiter", "Britain", "40"], ["Barber", "Britain", "30"], ["Waiter", "France", "50"], ["Barber", "France", "60"]],
};
const spec = () => boundInline(table, "bar", { category: "Nation", y: "Share" });
describe("dataset range: executor", () => {
  it("warns when rows share every mapped column, naming the unmapped column", () => {
    const result = executeInlineQuestion(spec());
    expect(result.issues).toEqual([expect.objectContaining({ code: "inlineRowsShareMapping", level: "warning", message: expect.stringMatching(/Job/) })]);
    expect(result.issues[0].message).toMatch(/map|remove/i);
    expect(result.issues[0].message).toMatch(/4 rows|2 (places|bars)/i);
    expect(result.status).not.toBe("blocked");
  });
  it("does not warn when every row has its own place", () => {
    const mapped = boundInline(table, "bar", { category: "Nation", group: "Job", y: "Share" });
    expect(executeInlineQuestion(mapped).issues).toEqual([]);
  });
  it("changes no observation when it warns", () => {
    const config = spec();
    const before = structuredClone(config);
    const base = tableToObservations(table, { chartType: "bar", bindings: config.question.dataset.bindings, comparisons: config.question.comparisons, measure: { id: "Share", label: "Share", unit: "percent" } });
    const result = executeInlineQuestion(config);
    expect(result.issues.map(i => i.code)).toContain("inlineRowsShareMapping");
    expect(result.observations).toEqual(base);
    expect(result.observations.map(r => r.value)).toEqual([40, 30, 50, 60]);
    expect(config).toEqual(before);
  });
  it.each(["indexed", "percentChange"])("does not offer count-only calculations on a percent column: %s", id => {
    const config = spec();
    config.question.calculation = { id, params: { baseYear: 2020 } };
    const result = executeInlineQuestion(config);
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "calculationNotAllowedForUnit" })]));
  });
  it("allows a calculation only when every value column's unit does", () => {
    const wide = { columns: [{ name: "Date", type: "date" }, { name: "Count", type: "number", unit: "number" }, { name: "Share", type: "number", unit: "percent" }], rows: [["2020", "100", "20"], ["2021", "120", "30"]] };
    const config = boundInline(wide, "line", { x: "Date", y: ["Count", "Share"] });
    config.question.calculation = { id: "indexed", params: { baseYear: 2020 } };
    expect(executeInlineQuestion(config).issues.map(i => i.code)).toContain("calculationNotAllowedForUnit");
    const counts = { ...wide, columns: wide.columns.map(c => ({ ...c, unit: "number" })) };
    const allowed = boundInline(counts, "line", { x: "Date", y: ["Count", "Share"] });
    allowed.question.calculation = config.question.calculation;
    const result = executeInlineQuestion(allowed);
    expect(result.status).not.toBe("blocked");
    // "Index to Base Year" is change relative to the base period (the shared
    // calculation registry; visualization-specification.md), so the base year is 0.
    expect(result.observations.map(r => r.value)).toEqual([0, 20, 0, 50]);
  });
  it("names the other units when mapped value columns have mixed units", () => {
    const wide = { columns: [{ name: "Date", type: "date" }, { name: "Count", type: "number", unit: "number" }, { name: "Share", type: "number", unit: "percent" }], rows: [["2020-01", "100", "20"]] };
    const result = executeInlineQuestion(boundInline(wide, "line", { x: "Date", y: ["Count", "Share"] }));
    expect(result.issues).toEqual([expect.objectContaining({ level: "information", message: expect.stringMatching(/Share.*percent/i) })]);
  });
  it("suggests tabs above twelve paired series, with no notice at twelve", () => {
    const make = count => ({ columns: [{ name: "Date", type: "date" }, { name: "Nation", type: "text" }, { name: "A", type: "number", unit: "number" }, { name: "B", type: "number", unit: "number" }], rows: Array.from({ length: count }, (_, i) => ["2020-01", `Nation ${i}`, "10", "20"]) });
    const run = count => executeInlineQuestion(boundInline(make(count), "line", { x: "Date", series: "Nation", y: ["A", "B"] }));
    expect(run(6).issues).toEqual([]);
    expect(run(7).issues).toEqual([expect.objectContaining({ level: "information", message: expect.stringMatching(/tabs/i) })]);
    expect(run(7).observations).toHaveLength(14);
  });
});
