import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { input, lineRows, gapRows, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

import LineChart from "@/components/charts/visx/LineChart";
import { buildLineModel } from "@/lib/visualization/models/lineModel";
function draw(appearance = {}, overrides = {}, width = 650) {
  const model = buildLineModel(input("line", { appearance, ...overrides }));
  return { model, ...render(<LineChart model={model} width={width} height={400} />) };
}

it("draws one line per series", () => {
  const { container } = draw();
  expect(container.querySelectorAll('[data-mark="series-line"]')).toHaveLength(2);
  for (const path of container.querySelectorAll('[data-mark="series-line"]')) {
    expect(path).toHaveAttribute("stroke-width", "2");
    expect(path.getAttribute("d")).toMatch(/^M/);
  }
});
it("draws no markers by default", () => expect(draw().container.querySelectorAll('[data-mark="point"]')).toHaveLength(0));
it("draws markers when Markers is on", () => expect(draw({ markerMode: "on" }).container.querySelectorAll('[data-mark="point"]')).toHaveLength(6));
it("draws a marker for a one-point series", () => expect(draw({}, { observations: [lineRows[0]], comparisons: [comparisons[0]] }).container.querySelectorAll('[data-mark="point"]')).toHaveLength(1));
it("draws no vertical grid lines", () => {
  const { container } = draw();
  expect(container.querySelectorAll('[data-grid="vertical"]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-grid="horizontal"]').length).toBeGreaterThan(0);
});
it("draws no dashed segments by default", () => {
  const { container } = draw();
  for (const path of container.querySelectorAll('[data-mark="series-line"]')) expect([null, "", "none"]).toContain(path.getAttribute("stroke-dasharray"));
});
it("breaks the line at suppressed values", () => {
  const { container } = draw({}, { observations: gapRows.filter(r => r.geographyId === "06075"), comparisons: [comparisons[2]] });
  // There is no drawable segment connecting 2020 to 2030 across 2025.
  for (const path of container.querySelectorAll('[data-mark="series-line"]')) expect(path.getAttribute("d")).not.toMatch(/L|C/);
});
// Owner decision 2026-09-29: match PPIC's published (Datawrapper) charts - the
// label names only the one point nearest the pointer, in both directions.
function hover(container, fractionX, fractionY) {
  const surface = container.querySelector('[data-chart-interaction]');
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 650, height: 400, right: 650, bottom: 400 });
  fireEvent.pointerMove(surface, { clientX: 650 * fractionX, clientY: 400 * fractionY });
  return screen.getByRole("tooltip");
}
it("labels only the point nearest the pointer on hover", () => {
  // Mid-height at 2025 (axis 0-80,000) is nearest Latina Women's 50,000.
  const tooltip = hover(draw().container, 0.5, 0.5);
  expect(tooltip).toHaveTextContent("Latina Women");
  expect(tooltip).toHaveTextContent("2025");
  expect(tooltip).toHaveTextContent("50,000");
  expect(tooltip).not.toHaveTextContent("White Women");
  expect(tooltip).not.toHaveTextContent("63,000");
});
it("picks the line nearest the pointer vertically", () => {
  // Near the top at 2025 is nearest White Women's 63,000.
  const tooltip = hover(draw().container, 0.5, 0.2);
  expect(tooltip).toHaveTextContent("White Women");
  expect(tooltip).toHaveTextContent("63,000");
  expect(tooltip).not.toHaveTextContent("Latina Women");
});
it("rings the labeled point with no box around the label", () => {
  const { container } = draw();
  const tooltip = hover(container, 0.5, 0.5);
  expect(container.querySelectorAll('[data-mark="hover-point"] circle')).toHaveLength(1);
  expect(container.querySelector('[data-mark="hover-point"] circle')).toHaveAttribute("fill", "none");
  expect(tooltip.style.backgroundColor).toBe("");
  expect(tooltip.style.border).toBe("");
  expect(tooltip.style.textShadow).toMatch(/#FFFFFF|rgb\(255, 255, 255\)/i);
});
it("moves the tooltip with the arrow keys", () => {
  draw();
  const chart = screen.getByRole("img");
  expect(chart).toHaveAttribute("tabindex", "0");
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: "Home" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("2020");
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("2025");
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("2020");
});
it("moves between lines with the up and down arrow keys", () => {
  draw();
  const chart = screen.getByRole("img");
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: "Home" });
  // 2020: Latina Women 40,000 is below White Women 60,000.
  expect(screen.getByRole("tooltip")).toHaveTextContent("Latina Women");
  fireEvent.keyDown(chart, { key: "ArrowUp" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("White Women");
  expect(screen.getByRole("tooltip")).toHaveTextContent("2020");
  fireEvent.keyDown(chart, { key: "ArrowDown" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("Latina Women");
});
it("clears the tooltip when the data changes", () => {
  const view = draw();
  fireEvent.focus(screen.getByRole("img"));
  fireEvent.keyDown(screen.getByRole("img"), { key: "ArrowRight" });
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  view.rerender(<LineChart model={buildLineModel(input("line", { observations: [lineRows[2]], comparisons: [comparisons[0]] }))} width={650} height={400} />);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

// 2026-09-29: line spacing added margin at the plot edges instead of room
// between values. Fixture: 3 periods (2 gaps), gridlines 0-80,000 (4 gaps).
function gridYs(container) {
  return [...container.querySelectorAll('[data-grid="horizontal"]')].map(l => Number(l.getAttribute("y1"))).sort((a, b) => a - b);
}
it("adds the vertical line spacing between neighbouring periods", () => {
  const base = draw().container.querySelector('svg[role="img"]');
  const baseWidth = Number(base.getAttribute("width"));
  const { container } = draw({ verticalLinePadding: 50 });
  const svg = container.querySelector('svg[role="img"]');
  // 50px more per gap between periods, 2 gaps.
  expect(Number(svg.getAttribute("width"))).toBe(baseWidth + 100);
  // The drawing scrolls sideways inside the width it was given.
  const scroll = container.querySelector("[data-chart-scroll]");
  expect(scroll).toHaveStyle({ width: `${baseWidth}px` });
  expect(scroll.className).toMatch(/overflow-x-auto/);
});
it("adds the horizontal line spacing between neighbouring gridlines", () => {
  const baseGaps = gridYs(draw().container);
  const baseGap = baseGaps[1] - baseGaps[0];
  const { container } = draw({ horizontalLinePadding: 20 });
  const ys = gridYs(container);
  expect(ys).toHaveLength(5);
  for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(baseGap + 20, 5);
  // 20px more per gap, 4 gaps: the drawing is 80px taller than the 400px given.
  expect(Number(container.querySelector('svg[role="img"]').getAttribute("height"))).toBe(480);
});
it("keeps lines flush with the plot edges when no spacing is set", () => {
  const { container } = draw();
  const ys = gridYs(container);
  const path = container.querySelector('[data-mark="series-line"]').getAttribute("d");
  // The first point (2020) sits on the left edge of the plot, x = 0.
  expect(path).toMatch(/^M0[,\s]/);
  expect(ys[0]).toBe(0);
});
