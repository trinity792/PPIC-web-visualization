import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, lineRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

import BarChart from "@/components/charts/visx/BarChart";
import { buildBarModel } from "@/lib/visualization/models/barModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildBarModel(input("bar", { appearance, ...overrides }));
  return { model, ...render(<BarChart model={model} width={width} height={400} />) };
}

it("never draws a bar narrower than 10px", () => {
  const { container } = draw({}, {}, 330);
  const bars = container.querySelectorAll('[data-mark="bar"]');
  expect(bars.length).toBeGreaterThan(0);
  for (const bar of bars) expect(Number(bar.getAttribute("width"))).toBeGreaterThanOrEqual(10);
});
it("asks for fewer categories when the minimum bar width cannot fit", () => {
  const rows = Array.from({length:80}, (_,i) => ({ ...lineRows[0], geographyId: String(i), geographyLabel: `County ${i}` }));
  const { container } = draw({}, { observations: rows, comparisons: [comparisons[0]] }, 330);
  expect(screen.getByRole("status")).toHaveTextContent(/fewer categories/i);
  expect(container.querySelectorAll('[data-mark="bar"]')).toHaveLength(0);
});
it("draws no vertical grid lines", () => expect(draw().container.querySelectorAll('[data-grid="vertical"]')).toHaveLength(0));
it("draws horizontal bars with right-aligned labels", () => {
  const { container } = draw({ orientation: "horizontal" });
  const labels = container.querySelectorAll('[data-mark="category-label"]');
  expect(labels).toHaveLength(2);
  for (const label of labels) expect(label).toHaveAttribute("text-anchor", "end");
  const bar = container.querySelector('[data-mark="bar"]');
  expect(Number(bar.getAttribute("width"))).toBeGreaterThan(0);
});
it.each([0,60000])("draws the reference line and its label: %s", referenceValue => {
  const { container } = draw({ diverging: true, referenceValue, referenceLabel: "Target" });
  expect(container.querySelector('[data-mark="reference-line"]')).toHaveAttribute("data-value", String(referenceValue));
  expect(screen.getByText("Target")).toBeInTheDocument();
});
it("draws the track rail behind each bar", () => {
  const { container } = draw({ diverging: true, trackRail: true });
  const rails = container.querySelectorAll('[data-mark="track-rail"]');
  expect(rails).toHaveLength(4);
  expect(rails[0].compareDocumentPosition(container.querySelector('[data-mark="bar"]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("draws the minimal axis", () => {
  const { container } = draw({ diverging: true, minimalAxis: true });
  expect(container.querySelectorAll('[data-mark="axis-tick-label"]')).toHaveLength(0);
  expect(container.querySelector('[data-mark="axis-line"]')).toBeInTheDocument();
});
it("shows the bar's value on hover", () => {
  const { container } = draw();
  fireEvent.pointerEnter(container.querySelector('[data-mark="bar"]'));
  expect(screen.getByRole("tooltip")).toHaveTextContent("50,000");
  expect(screen.getByRole("tooltip")).toHaveTextContent("San Francisco");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Latina Women");
});
