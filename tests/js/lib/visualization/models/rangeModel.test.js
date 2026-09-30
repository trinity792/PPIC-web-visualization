import { expect, it } from "vitest";
import { input, lineRows, gapRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

import { buildRangeModel } from "@/lib/visualization/models/rangeModel";
it("draws the connector from the start value to the end value", () => {
  const model = buildRangeModel(input("dumbbell", { observations: [lineRows[2], lineRows[0]], comparisons: [comparisons[0]], periods: [2020,2030] }));
  expect(model.rows[0]).toMatchObject({ start: { period: 2020, value: 40000 }, end: { period: 2030, value: 60000 }, connector: { from: 40000, to: 60000 } });
});
it("keeps a row with one missing endpoint, without a connector", () => {
  const model = buildRangeModel(input("dumbbell", { observations: gapRows.filter(r => r.geographyId === "06075" && r.period !== 2030), comparisons: [comparisons[2]], periods: [2020,2025] }));
  expect(model.rows).toHaveLength(1);
  expect(model.rows[0]).toMatchObject({ start: { value: 10000 }, end: { value: null }, connector: null });
});
it("opens an old view with showValueAxis false as hideXAxis true", () => expect(buildRangeModel(input("dumbbell", { appearance: { showValueAxis: false } })).valueAxis.visible).toBe(false));
it("lets the explicit hideXAxis setting win over the old name", () => expect(buildRangeModel(input("dumbbell", { appearance: { showValueAxis: false, hideXAxis: false } })).valueAxis.visible).toBe(true));
