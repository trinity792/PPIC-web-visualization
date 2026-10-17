import { describe, expect, it } from "vitest";
import { expectations } from "@/tests/fixtures/byod-shapes/expectations";
import { fixtureTable } from "@/tests/fixtures/byod-shapes/helpers";
// Isolated until Stage 4 adds this client-safe module.
import { profileTable, rankInlineCharts } from "@/lib/visualization/inlineProfile";

describe("dataset range: shape ranking", () => {
  it.each(expectations)("ranks one rule per table shape: $id", async entry => {
    const candidates = rankInlineCharts(profileTable(await fixtureTable(entry.id)));
    expect(candidates[0]).toMatchObject({ chartType: entry.chartType, bindings: entry.bindings, appearance: entry.appearance });
  });
  it("profiles column kinds, repeats, grids, row shares, and date headers", async () => {
    // Exercise the profile through its consumer without freezing its internal layout.
    for (const [id, expected] of [["two-labels-grid", "heatmap"], ["two-labels-sparse", "dotPlot"], ["two-labels-shares", "bar"], ["years-across-columns", "line"], ["long-monthly-shares", "line"]]) {
      const table = await fixtureTable(id);
      const original = structuredClone(table);
      expect(rankInlineCharts(profileTable(table))[0].chartType).toBe(expected);
      expect(table).toEqual(original);
    }
  });
  it.each(expectations)("never ranks pie or a map first: $id", async entry => {
    const candidates = rankInlineCharts(profileTable(await fixtureTable(entry.id)));
    expect(candidates.length).toBeGreaterThan(0);
    expect(["pie", "choroplethMap", "symbolMap"]).not.toContain(candidates[0].chartType);
  });
  it.each(expectations)("gives every candidate a reason a reader can understand: $id", async entry => {
    const candidates = rankInlineCharts(profileTable(await fixtureTable(entry.id)));
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.reason).toEqual(expect.any(String));
      expect(candidate.reason).toMatch(/column|label|date|period|value|number|row|pair|grid|share|estimate|bound/i);
      expect(candidate.reason).not.toMatch(/undefined|\[object Object\]|bindings\./);
    }
  });
  it.each([ ["Low", "High"], ["Lower", "Upper"], ["Start", "End"], ["Before", "After"], ["Min", "Max"] ])("recognizes the name pair %s / %s", (start, end) => {
    const table = { columns: [{ name: "Place", type: "text" }, { name: start, type: "number" }, { name: end, type: "number" }], rows: [["A", "5", "10"], ["B", "6", "12"]] };
    expect(rankInlineCharts(profileTable(table))[0]).toMatchObject({ chartType: "dumbbell", bindings: { category: "Place", start, end } });
  });
  it("uses a dot plot for a complete grid with more than 25 row labels", () => {
    const table = { columns: [{ name: "Age", type: "text" }, { name: "Region", type: "text" }, { name: "Count", type: "number" }], rows: Array.from({ length: 26 }, (_, i) => [`Age ${i}`, "North", "10"]) };
    expect(rankInlineCharts(profileTable(table))[0]).toMatchObject({ chartType: "dotPlot", bindings: { y: "Age", x: "Region", color: ["Count"] } });
  });
  it("uses horizontal bars for long labels even with few categories", () => {
    const table = { columns: [{ name: "Place", type: "text" }, { name: "Count", type: "number" }], rows: [["A category longer than twenty characters", "10"], ["B", "20"]] };
    expect(rankInlineCharts(profileTable(table))[0]).toMatchObject({ chartType: "bar", appearance: { orientation: "horizontal" } });
  });
  it("ranks scatter for numbers without labels and bar for the fallback shape", () => {
    expect(rankInlineCharts(profileTable({ columns: [{ name: "Income", type: "number" }, { name: "Rent", type: "number" }], rows: [["3000", "1000"], ["4000", "1200"]] }))[0]).toMatchObject({ chartType: "scatter", bindings: { x: "Income", y: "Rent" } });
    expect(rankInlineCharts(profileTable({ columns: [{ name: "Name", type: "text" }], rows: [["A"], ["B"]] }))[0].chartType).toBe("bar");
  });
});
