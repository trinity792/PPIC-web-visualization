import { expect, it } from "vitest";
import { buildChartModel } from "@/lib/visualization/models";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

// Axis range (Advanced mode, 2026-10-12): every numeric axis a chart draws
// takes the reader's range exactly, and its ticks stay inside it.
const RANGE = [-1000, 123456];
const domainOf = {
  line: [["verticalAxisRange", (model) => model.yAxis]],
  bar: [["verticalAxisRange", (model) => model.valueAxis]],
  dumbbell: [["horizontalAxisRange", (model) => model.valueAxis]],
  dotPlot: [["horizontalAxisRange", (model) => model.valueAxis]],
  forest: [["horizontalAxisRange", (model) => model.valueAxis]],
  scatter: [["horizontalAxisRange", (model) => model.xAxis], ["verticalAxisRange", (model) => model.yAxis]],
  bubble: [["horizontalAxisRange", (model) => model.xAxis], ["verticalAxisRange", (model) => model.yAxis]],
};
const cases = Object.entries(domainOf).flatMap(([type, axes]) => axes.map(([key, axis]) => [type, key, axis]));

it.each(cases)("%s: %s sets the axis exactly", (type, key, axisOf) => {
  const axis = axisOf(buildChartModel(input(type, { appearance: { [key]: RANGE } })));
  expect(axis.domain).toEqual(RANGE);
  expect(axis.ticks.every((tick) => tick >= RANGE[0] && tick <= RANGE[1])).toBe(true);
});

it("horizontal bars take the horizontal range", () => {
  const model = buildChartModel(input("bar", { appearance: { orientation: "horizontal", horizontalAxisRange: RANGE } }));
  expect(model.valueAxis.domain).toEqual(RANGE);
});

it("a forest plot's range overrides centering", () => {
  const model = buildChartModel(input("forest", { appearance: { center: 45000, horizontalAxisRange: RANGE } }));
  expect(model.valueAxis.domain).toEqual(RANGE);
});

// The diverging bar's own range (`valueRange`) folded into the axis range;
// saved views that still carry it draw as before, and the new range wins.
it("diverging bars still read a saved valueRange", () => {
  const model = buildChartModel(input("bar", { appearance: { diverging: true, valueRange: [-100, 3000000] } }));
  expect(model.valueAxis.domain).toEqual([-100, 3000000]);
});
it("the axis range wins over a saved valueRange", () => {
  const model = buildChartModel(input("bar", { appearance: { diverging: true, valueRange: [-100, 3000000], horizontalAxisRange: RANGE } }));
  expect(model.valueAxis.domain).toEqual(RANGE);
});

// The range may cut through the data, so the model tells the renderer to clip;
// without one every mark is inside the axis and nothing is clipped.
it.each(cases)("%s: %s asks the renderer to clip only when set", (type, key, axisOf) => {
  expect(axisOf(buildChartModel(input(type, { appearance: { [key]: RANGE } }))).clip).toBe(true);
  expect(axisOf(buildChartModel(input(type))).clip).toBe(false);
});
