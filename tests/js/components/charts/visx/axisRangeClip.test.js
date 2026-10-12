import React from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

import BarChart from "@/components/charts/visx/BarChart";
import DotPlot from "@/components/charts/visx/DotPlot";
import ForestPlot from "@/components/charts/visx/ForestPlot";
import LineChart from "@/components/charts/visx/LineChart";
import PointChart from "@/components/charts/visx/PointChart";
import RangeChart from "@/components/charts/visx/RangeChart";
import { buildChartModel } from "@/lib/visualization/models";

// Axis range (Advanced mode, 2026-10-12): a range narrower than the data clips
// the marks to the plot; labels, axes, and the key are never clipped.
const RANGE = [0, 1000];
const CHARTS = [
  ["line", "verticalAxisRange", LineChart],
  ["bar", "verticalAxisRange", BarChart],
  ["dumbbell", "horizontalAxisRange", RangeChart],
  ["dotPlot", "horizontalAxisRange", DotPlot],
  ["forest", "horizontalAxisRange", ForestPlot],
  ["scatter", "horizontalAxisRange", PointChart],
  ["scatter", "verticalAxisRange", PointChart],
];
function draw(type, Chart, appearance = {}) {
  const model = buildChartModel(input(type, { appearance }));
  return render(<Chart model={model} width={650} height={400} />).container;
}

it.each(CHARTS)("%s clips its marks to a set %s", (type, key, Chart) => {
  const container = draw(type, Chart, { [key]: RANGE });
  const clipped = container.querySelector("[data-plot-clip]");
  expect(clipped).not.toBeNull();
  const id = clipped.getAttribute("clip-path").match(/^url\(#(.+)\)$/)[1];
  expect(container.querySelector(`clipPath[id="${id}"] rect`)).not.toBeNull();
  expect(clipped.querySelector("[data-mark]")).not.toBeNull();
});

it.each(CHARTS)("%s clips nothing without a range (%s unset)", (type, key, Chart) => {
  const container = draw(type, Chart);
  expect(container.querySelector("[clip-path]")).toBeNull();
  expect(container.querySelector("clipPath")).toBeNull();
});

// A scatter point past the range is clipped away, so its name and hover go too.
it("scatter: points past the range take no name label or keyboard stop", () => {
  const all = buildChartModel(input("scatter"));
  const xs = all.points.map((point) => point.x).sort((a, b) => a - b);
  const cut = (xs[0] + xs.at(-1)) / 2;
  const inside = all.points.filter((point) => point.x <= cut).length;
  expect(inside).toBeLessThan(all.points.length);

  const container = draw("scatter", PointChart, { horizontalAxisRange: [null, cut] });
  const labels = container.querySelectorAll('[data-mark="point-label"]');
  const allLabels = draw("scatter", PointChart).querySelectorAll('[data-mark="point-label"]');
  expect(labels.length).toBeLessThanOrEqual(inside);
  expect(labels.length).toBeLessThan(allLabels.length);
});
