import { expect, it } from "vitest";
import { input, observations, gapRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

import { buildLineModel } from "@/lib/visualization/models/lineModel";
import { adaptObservations } from "@/lib/visualization/adapters";
it("gives each series the same color the Plotly line chart gives it", () => {
  const model = buildLineModel(input());
  expect(model.series.map(s => s.color)).toEqual(["#CA4F1A", "#293B54"]);
  expect(adaptObservations(input()).data.map(s => s.line.color)).toEqual(["#CA4F1A", "#293B54"]);
});
it("keeps series order and names from the Plotly line chart", () => {
  const model = buildLineModel(input());
  expect(model.series.map(s => s.label)).toEqual(["Latina Women", "White Women"]);
  expect(adaptObservations(input()).data.map(s => s.name)).toEqual(["Latina Women", "White Women"]);
  expect(model.periods).toEqual([2020, 2025, 2030]);
  expect(model.series[0].points.map(p => p.value)).toEqual([40000, 50000, 60000]);
  expect(model.series[0].points[2]).toMatchObject({ period: 2030, status: "available", valueKind: "projected" });
});
it("keeps missing and suppressed values as gaps, not zero", () => {
  const model = buildLineModel(input("line", { observations: gapRows, comparisons: [comparisons[2]] }));
  expect(model.series[0].points.map(p => p.value)).toEqual([10000, null, 9000]);
  expect(model.series[1].points.map(p => p.value)).toEqual([90000, null, null]);
  expect(model.series[0].points[1].status).toBe("suppressed");
  expect(model.series[1].points[1].status).toBe("missing");
});
it("leaves hidden comparisons out", () => {
  const model = buildLineModel(input("line", { presentation: { comparisonPresentation: "combined", comparisonVisibility: { white: false } } }));
  expect(model.series.map(s => s.comparisonId)).toEqual(["latina"]);
});
it("orders series by the dragged location order", () => {
  const model = buildLineModel(input("line", { observations: observations.filter(r => r.comparisonId === "latina"), comparisons: [comparisons[0]], appearance: { categoryOrder: ["Los Angeles", "San Francisco"] } }));
  expect(model.series.map(s => s.geographyId)).toEqual(["06037", "06075"]);
});
it("reads the dashed range from appearance", () => {
  expect(buildLineModel(input("line", { appearance: { dashedRange: { from: 2025, to: 2030, label: "Projected" } } })).dashedRange).toEqual({ from: 2025, to: 2030, label: "Projected" });
});
it.each([undefined, "automatic"])("uses direct labels when legendPosition is %s", legendPosition => expect(buildLineModel(input("line", { appearance: { legendPosition } })).key.position).toBe("automatic"));
