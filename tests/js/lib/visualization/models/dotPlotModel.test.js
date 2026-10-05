import { expect, it } from "vitest";
import { input, gapRows, comparisons, observations } from "@/tests/fixtures/visualization-v3/renderer";

import { buildDotPlotModel } from "@/lib/visualization/models/dotPlotModel";
import { adaptObservations } from "@/lib/visualization/adapters";
it("gives each series the same color the Plotly dot plot gives it", () => {
  expect(buildDotPlotModel(input("dotPlot")).series.map(s => s.color)).toEqual(["#CA4F1A", "#293B54"]);
  expect(adaptObservations(input("dotPlot")).data.map(s => s.marker.color)).toEqual(["#CA4F1A", "#293B54"]);
});
it("keeps missing values as gaps", () => {
  const model = buildDotPlotModel(input("dotPlot", { observations: gapRows, comparisons: [comparisons[2]] }));
  expect(model.points.map(p => p.value)).toEqual([10000,9000,90000]);
});
it("labels only the chosen series", () => {
  const model = buildDotPlotModel(input("dotPlot", { appearance: { showPointLabels: true, pointLabelSeries: { "Latina Women": true, "White Women": false } } }));
  expect(model.points.filter(p => p.label).map(p => p.comparisonId)).toEqual(["latina", "latina"]);
});
it("uses the standard dot size when none is saved", () => expect(buildDotPlotModel(input("dotPlot")).points.map(p => p.radius)).toEqual([4.5,4.5,4.5,4.5]));

// Renderer plan G, as built 2026-10-05.
it("draws one dot per period, Navy then Orange, when one comparison spans two periods", () => {
  const rows = observations.filter(r => r.comparisonId === "latina" && [2020, 2030].includes(r.period));
  const model = buildDotPlotModel(input("dotPlot", { observations: rows, comparisons: [comparisons[0]] }));
  expect(model.dotsBy).toBe("period");
  expect(model.series.map(s => [s.label, s.color])).toEqual([["2020", "#293B54"], ["2030", "#CA4F1A"]]);
  expect(model.rows.map(r => r.label)).toEqual(["San Francisco", "Los Angeles"]);
});
it("groups period rows by place when several comparisons span several periods and places", () => {
  const rows = observations.filter(r => r.comparisonId !== "black" && [2020, 2030].includes(r.period));
  const model = buildDotPlotModel(input("dotPlot", { observations: rows }));
  expect(model.dotsBy).toBe("comparison");
  expect(model.groups.map(g => g.label)).toEqual(["San Francisco", "Los Angeles"]);
  expect(model.rows.map(r => r.label)).toEqual(["2020", "2030", "2020", "2030"]);
});
it("joins a row's dots with a band from the lowest to the highest", () => {
  const model = buildDotPlotModel(input("dotPlot"));
  expect(model.rows[0].band).toEqual({ from: 50000, to: 63000 });
  const one = buildDotPlotModel(input("dotPlot", { comparisons: [comparisons[0]], observations: input("dotPlot").observations.filter(r => r.comparisonId === "latina") }));
  expect(one.rows[0].band).toBeNull();
});
it("keeps a missing value's text for hover while drawing no dot", () => {
  const model = buildDotPlotModel(input("dotPlot", { observations: gapRows, comparisons: [comparisons[2]] }));
  expect(model.rows[0].values.map(v => v.text)).toEqual(["10,000", expect.stringMatching(/suppress|not/i), "9,000"]);
});
it("keeps a saved marker size within the slider's limits", () => {
  expect(buildDotPlotModel(input("dotPlot", { appearance: { markerSize: 100 } })).radius).toBe(10);
  expect(buildDotPlotModel(input("dotPlot", { appearance: { markerSize: 1 } })).radius).toBe(3);
});
it("opens an old view with showValueAxis false as a hidden value axis", () => {
  expect(buildDotPlotModel(input("dotPlot", { appearance: { showValueAxis: false } })).valueAxis.visible).toBe(false);
});
it("never colors a period dot the band's light gray", () => {
  const model = buildDotPlotModel(input("dotPlot", { observations: gapRows, comparisons: [comparisons[2]] }));
  expect(model.series.map(s => s.color)).toEqual(["#293B54", "#CA4F1A", expect.not.stringMatching(/^#CFCFCF$/i)]);
});
