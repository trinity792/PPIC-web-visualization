import { expect, it } from "vitest";
import { input, gapRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

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
