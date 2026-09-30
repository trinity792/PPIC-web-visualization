import { expect, it } from "vitest";
import { input, pointRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

import { buildPointModel } from "@/lib/visualization/models/pointModel";
import { adaptObservations } from "@/lib/visualization/adapters";
it.each(["scatter", "bubble"])("gives each comparison the same color the Plotly chart gives it: %s", chartType => {
  const fixture = input(chartType, { comparisons: [comparisons[0]] });
  expect(buildPointModel(fixture).points.map(p => p.color)).toEqual(["#CA4F1A", "#CA4F1A"]);
  expect(adaptObservations(fixture).data[0].marker.color).toBe("#CA4F1A");
});
it("sizes bubbles by area", () => {
  const points = buildPointModel(input("bubble", { appearance: { sizeByArea: false } })).points;
  expect(points[0].radius).toBeGreaterThan(0);
  expect(points[1].radius / points[0].radius).toBeCloseTo(2);
});
it.each(["xValue", "yValue"])("leaves out points with a missing value on either axis: %s", axis => {
  const model = buildPointModel(input("scatter", { observations: [pointRows[0], { ...pointRows[1], [axis]: null }] }));
  expect(model.points).toHaveLength(1);
  expect(model.points[0]).toMatchObject({ x: 10, y: 40000 });
});
it("keeps a genuine zero on either axis", () => expect(buildPointModel(input("scatter", { observations: [{ ...pointRows[0], xValue: 0, yValue: 0 }] })).points[0]).toMatchObject({ x: 0, y: 0 }));
