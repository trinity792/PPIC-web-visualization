import React from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, forestRows } from "@/tests/fixtures/visualization-v3/renderer";

import ForestPlot from "@/components/charts/visx/ForestPlot";
import { buildForestModel } from "@/lib/visualization/models/forestModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildForestModel(input("forest", { appearance, ...overrides }));
  return { model, ...render(<ForestPlot model={model} width={width} height={400} />) };
}

it("draws every estimate marker at one size", () => {
  const rows = [...forestRows.map(r => ({ ...r, weight: 1 })), ...forestRows.map(r => ({ ...r, categoryId: "other", categoryLabel: "Other", weight: 100 }))];
  const { container } = draw({ pointStyle: "dot" }, { observations: rows });
  const dots = container.querySelectorAll('[data-mark="estimate"]');
  expect(dots).toHaveLength(2);
  expect(Number(dots[0].getAttribute("r"))).toBeGreaterThan(0);
  expect(dots[0].getAttribute("r")).toBe(dots[1].getAttribute("r"));
});
it.each([["caps", "line"], ["dots", "circle"], ["diamonds", "path"], ["none", null]])("draws the chosen interval end style: %s", (endpointStyle, tag) => {
  const { container } = draw({ endpointStyle });
  const ends = container.querySelectorAll('[data-mark="interval-end"]');
  expect(ends).toHaveLength(tag ? 2 : 0);
  if (tag) for (const end of ends) expect(end.tagName.toLowerCase()).toBe(tag);
});
it.each([["square", "rect"], ["diamond", "path"], ["dot", "circle"], ["none", null]])("draws the chosen estimate marker: %s", (pointStyle, tag) => {
  const { container } = draw({ pointStyle });
  const marks = container.querySelectorAll('[data-mark="estimate"]');
  expect(marks).toHaveLength(tag ? 1 : 0);
  if (tag) expect(marks[0].tagName.toLowerCase()).toBe(tag);
});
