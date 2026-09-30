import React from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

import PieChart from "@/components/charts/visx/PieChart";
import { buildPieModel } from "@/lib/visualization/models/pieModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildPieModel(input("pie", { appearance, ...overrides }));
  return { model, ...render(<PieChart model={model} width={width} height={400} />) };
}

it("labels every slice", () => {
  const { container } = draw({ showValueLabels: false });
  expect(container.querySelectorAll('[data-mark="slice"]')).toHaveLength(2);
  const labels = container.querySelectorAll('[data-mark="slice-label"]');
  expect(labels).toHaveLength(2);
  expect(labels[0]).toHaveTextContent("0-4");
  expect(labels[0]).toHaveTextContent("3,000");
  expect(labels[1]).toHaveTextContent("5-9");
});
it("draws a full pie when no hole is saved", () => {
  const { container } = draw();
  expect(container.querySelector('[data-mark="slice"]')).toHaveAttribute("data-inner-radius", "0");
});
it.each([0,0.4,0.6])("draws a donut at the chosen hole size: %s", hole => {
  const { container } = draw({ hole });
  const slice = container.querySelector('[data-mark="slice"]');
  expect(Number(slice.getAttribute("data-outer-radius"))).toBeGreaterThan(0);
  expect(Number(slice.getAttribute("data-inner-radius"))/Number(slice.getAttribute("data-outer-radius"))).toBeCloseTo(hole);
});
