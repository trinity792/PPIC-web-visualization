import React from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, lineRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

import RangeChart from "@/components/charts/visx/RangeChart";
import { buildRangeModel } from "@/lib/visualization/models/rangeModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildRangeModel(input("dumbbell", { appearance, ...overrides }));
  return { model, ...render(<RangeChart model={model} width={width} height={400} />) };
}

it("draws the connector from the start value to the end value", () => {
  const { container } = draw({}, { observations: [lineRows[0],lineRows[2]], comparisons: [comparisons[0]], periods: [2020,2030] });
  const connector = container.querySelector('[data-mark="connector"]');
  const ends = container.querySelectorAll('[data-mark="endpoint"]');
  expect(ends).toHaveLength(2);
  expect(connector.getAttribute("x1")).toBe(ends[0].getAttribute("cx"));
  expect(connector.getAttribute("x2")).toBe(ends[1].getAttribute("cx"));
  expect(Number(connector.getAttribute("x2"))).toBeGreaterThan(Number(connector.getAttribute("x1")));
});
it("shows each endpoint's value when Show point values is on", () => {
  const { container } = draw({ showPointLabels: true }, { observations: [lineRows[0],lineRows[2]], comparisons: [comparisons[0]] });
  const labels = container.querySelectorAll('[data-mark="value-label"]');
  expect(labels).toHaveLength(2);
  expect(labels[0]).toHaveTextContent("40,000");
  expect(labels[1]).toHaveTextContent("60,000");
});
it("shows only the first line of a two-line value label", () => {
  const model = buildRangeModel(input("dumbbell", { appearance: { showPointLabels: true, pointLabelsFirstLineOnly: true } }));
  model.rows[0].start.label = "40,000\n2020";
  model.rows[0].end.label = "60,000\n2030";
  const { container } = render(<RangeChart model={model} width={650} height={400} />);
  const labels = container.querySelectorAll('[data-mark="value-label"]');
  expect(labels[0]).toHaveTextContent(/^40,000$/);
  expect(labels[1]).toHaveTextContent(/^60,000$/);
});
