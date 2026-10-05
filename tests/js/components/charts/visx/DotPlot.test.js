import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, lineRows, gapRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

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

// Renderer plan G, as built 2026-10-05.
it("joins each row's dots with a light band", () => {
  const { container } = draw();
  expect(container.querySelectorAll('[data-mark="band"]')).toHaveLength(2);
});
it("shows the chosen series' values when Show point values is on", () => {
  const { container } = draw({ showPointLabels: true, pointLabelSeries: { "White Women": false } });
  expect([...container.querySelectorAll('[data-mark="value-label"]')].map(l => l.textContent)).toEqual(["50,000", "2,520,000"]);
});
it("names every value in a hovered row, missing ones included", () => {
  const { container } = draw({}, { observations: gapRows, comparisons: [comparisons[2]] });
  fireEvent.keyDown(container.querySelector("svg"), { key: "Home" });
  const tip = screen.getByRole("tooltip");
  expect(tip).toHaveTextContent("San Francisco: 2020, 10,000;");
  expect(tip).toHaveTextContent("2030, 9,000");
  expect(container.querySelectorAll('[data-mark="hover-label"]')).toHaveLength(2);
});

// Owner, 2026-10-05: hover starts only with the pointer over a dot, not over
// the row label, band, or empty row.
it("shows a row's values only while the pointer is over one of its dots", () => {
  const { container } = draw();
  expect(container.querySelector('[data-mark="row-hit"]')).toBeNull();
  // The label, band, and row line take no pointer events at all.
  for (const mark of ["row-label", "band", "row-line"]) {
    for (const element of container.querySelectorAll(`[data-mark="${mark}"]`)) {
      expect(element, mark).toHaveAttribute("pointer-events", "none");
    }
  }

  const hits = container.querySelectorAll('[data-mark="point-hit"]');
  expect(hits).toHaveLength(container.querySelectorAll('[data-mark="point"]').length);
  // A dot's hit area reaches a few px past its edge.
  const dot = container.querySelector('[data-mark="point"]');
  expect(Number(hits[0].getAttribute("r"))).toBeGreaterThan(Number(dot.getAttribute("r")));

  fireEvent.pointerEnter(hits[0]);
  expect(screen.getByRole("tooltip")).toHaveTextContent("San Francisco");
  expect(container.querySelector('[data-mark="row-label"][font-weight="700"]')).toHaveTextContent("San Francisco");
  fireEvent.pointerLeave(hits[0]);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
