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

import { boundInline as datasetSpec, modelInput as datasetInput, fixtureTable as datasetFixture } from "@/tests/fixtures/byod-shapes/helpers";
it("spaces uneven survey dates by their distance in time", async () => {
  const config = datasetSpec(await datasetFixture("irregular-dates"), "line", { x: "Survey date", y: "Responses" });
  const points = buildLineModel(datasetInput(config)).series[0].points;
  expect(points.map(p => p.period)).toEqual(["2020-01-01", "2020-01-02", "2020-04-10"]);
  expect(points[0].periodPosition).toBe(2020);
  expect((points[2].periodPosition - points[0].periodPosition) / (points[1].periodPosition - points[0].periodPosition)).toBeCloseTo(100, 6);
});
it("draws one line per value column", async () => {
  const config = datasetSpec(await datasetFixture("wide-monthly-shares"), "line", { x: "Date", y: ["Chrome", "IE", "Firefox", "Safari", "Edge", "Other"] });
  const model = buildLineModel(datasetInput(config));
  expect(model.series.map(s => s.label)).toEqual(["Chrome", "IE", "Firefox", "Safari", "Edge", "Other"]);
  const edge = model.series.find(s => s.label === "Edge");
  expect(edge.points.slice(0, 2).map(p => p.value)).toEqual([null, null]);
  expect(edge.points.some(p => p.value > 0)).toBe(true);
});

it("shows a pasted percent column's values as percentages on hover", () => {
  const table = { columns: [{ name: "Month", type: "date", granularity: "month" }, { name: "Share", type: "number", unit: "percent", decimals: 1 }], rows: [["2020-01", "40.5"], ["2020-02", "41"]] };
  const model = buildLineModel(datasetInput(datasetSpec(table, "line", { x: "Month", y: "Share" })));
  expect(model.series[0].points.map(point => point.text)).toEqual(["40.5%", "41.0%"]);
  expect(model.yAxis.tickText.every(text => text.endsWith("%"))).toBe(true);
});
