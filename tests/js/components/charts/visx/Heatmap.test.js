import React from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

import Heatmap from "@/components/charts/visx/Heatmap";
import { buildHeatmapModel } from "@/lib/visualization/models/heatmapModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildHeatmapModel(input("heatmap", { appearance, ...overrides }));
  return { model, ...render(<Heatmap model={model} width={width} height={400} />) };
}

it("shows no cell values by default", () => expect(draw().container.querySelectorAll('[data-mark="cell-value"]')).toHaveLength(0));
it("shows each cell's value in the readable text color when on", () => {
  const { container } = draw({ showCellValues: true, colorScale: "diverging", divergingStops: ["#FFFFFF", "#808080", "#000000"], decimalPlaces: 0 });
  const labels = container.querySelectorAll('[data-mark="cell-value"]');
  expect(labels).toHaveLength(4);
  const low = [...labels].find(l => l.textContent === "2,500");
  const high = [...labels].find(l => l.textContent === "3,500");
  expect(low).toHaveAttribute("fill", "#595F61");
  expect(high).toHaveAttribute("fill", "#FFFFFF");
});
