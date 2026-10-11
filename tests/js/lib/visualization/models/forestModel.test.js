import { expect, it } from "vitest";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

import { buildForestModel } from "@/lib/visualization/models/forestModel";
import { tableToObservations } from "@/lib/tabular/toObservations";
it("preserves the estimate and interval endpoints", () => expect(buildForestModel(input("forest")).rows[0]).toMatchObject({ estimate: 50000, lower: 40000, upper: 60000 }));
it("centers the value axis on the chosen value", () => {
  const domain = buildForestModel(input("forest", { appearance: { center: 45000 } })).valueAxis.domain;
  expect((domain[0]+domain[1])/2).toBe(45000);
  expect(domain[0]).toBeLessThanOrEqual(40000);
  expect(domain[1]).toBeGreaterThanOrEqual(60000);
});
it.each([0, 1, null])("draws the line of no effect at the chosen value: %s", noEffectValue => expect(buildForestModel(input("forest", { appearance: { noEffectValue } })).referenceLine).toEqual(noEffectValue === null ? null : { value: noEffectValue }));
it("hides the line of no effect when no value is set", () => expect(buildForestModel(input("forest")).referenceLine).toBeNull());

// Owner review, 2026-10-10: a pasted forest table with no time column names
// each part's period after its column, and the model drew only the lower bound.
it("draws every part of a pasted row when no time column is bound", () => {
  const table = {
    columns: [{ name: "Study", type: "text" }, { name: "Est", type: "number" }, { name: "Low", type: "number" }, { name: "High", type: "number" }],
    rows: [["A", "1.2", "0.9", "1.5"], ["B", "0.8", "0.6", "1.1"]],
    issues: [],
  };
  const observations = tableToObservations(table, {
    chartType: "forest", bindings: { category: "Study", start: "Low", end: "High", point: "Est" }, measure: { id: "Est" },
  });
  const model = buildForestModel(input("forest", { observations, comparisons: [], presentation: {} }));
  expect(model.rows.map((row) => [row.label, row.lower, row.estimate, row.upper])).toEqual([
    ["A", 0.9, 1.2, 1.5],
    ["B", 0.6, 0.8, 1.1],
  ]);
});
