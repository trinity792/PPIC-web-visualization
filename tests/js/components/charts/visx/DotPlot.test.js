import React from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, lineRows } from "@/tests/fixtures/visualization-v3/renderer";

import DotPlot from "@/components/charts/visx/DotPlot";
import { buildDotPlotModel } from "@/lib/visualization/models/dotPlotModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildDotPlotModel(input("dotPlot", { appearance, ...overrides }));
  return { model, ...render(<DotPlot model={model} width={width} height={400} />) };
}

it("keeps overlapping dots visible", () => {
  const { container } = draw({}, { observations: [lineRows[0], { ...lineRows[0], comparisonId: "white", comparisonLabel: "White Women" }] });
  const dots = container.querySelectorAll('[data-mark="point"]');
  expect(dots).toHaveLength(2);
  expect(dots[0].getAttribute("cx")).toBe(dots[1].getAttribute("cx"));
  expect(dots[1]).toHaveAttribute("stroke", "#FFFFFF");
  expect(Number(dots[1].getAttribute("stroke-width"))).toBeGreaterThan(0);
});
it("draws dots at the chosen marker size", () => {
  const { container } = draw({ markerSize: 14 });
  const dots = container.querySelectorAll('[data-mark="point"]');
  expect(dots).toHaveLength(4);
  for (const dot of dots) expect(dot).toHaveAttribute("r", "7");
});
