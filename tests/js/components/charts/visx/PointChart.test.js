import React from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, pointRows } from "@/tests/fixtures/visualization-v3/renderer";

import PointChart from "@/components/charts/visx/PointChart";
import { buildPointModel } from "@/lib/visualization/models/pointModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildPointModel(input("bubble", { appearance, ...overrides }));
  return { model, ...render(<PointChart model={model} width={width} height={400} />) };
}

it("sizes bubbles by area", () => {
  const { container } = draw();
  const points = container.querySelectorAll('[data-mark="point"]');
  expect(points).toHaveLength(2);
  expect(Number(points[1].getAttribute("r"))/Number(points[0].getAttribute("r"))).toBeCloseTo(2);
});
it("leaves out points with a missing value on either axis", () => {
  const { container } = draw({}, { observations: [pointRows[0], { ...pointRows[1], xValue: null }] });
  expect(container.querySelectorAll('[data-mark="point"]')).toHaveLength(1);
});
