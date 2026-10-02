import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, lineRows, gapRows, observations, comparisons } from "@/tests/fixtures/visualization-v3/renderer";

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
// Renderer plan F: First line only labels the first row, as the editor has
// always drawn it (toPlotly's range labels). The Stage 1 version of this test
// read it as the first text line of a label, but no range label has two lines,
// so that reading would have left the switch doing nothing.
it("labels only the first row when First line only is on", () => {
  const { model, container } = draw({ showPointLabels: true, pointLabelsFirstLineOnly: true });
  expect(model.rows).toHaveLength(2);
  const labels = [...container.querySelectorAll('[data-mark="value-label"]')];
  expect(labels).toHaveLength(2);
  expect(labels.every(label => label.getAttribute("data-key") === model.rows[0].key)).toBe(true);
});

// ── Added with the Workstream F build (2026-10-01) ──
const fallingRows = observations.filter(r => r.geographyId === "06037" && r.comparisonId === "white");
const groupedRows = observations.filter(r => r.comparisonId !== "black");
it("fills each end with its own color, the same on every row", () => {
  const { model, container } = draw();
  const fills = end => [...container.querySelectorAll(`[data-mark="endpoint"][data-endpoint="${end}"]`)].map(dot => dot.getAttribute("fill"));
  expect(fills("start")).toEqual([model.ends.start.color, model.ends.start.color]);
  expect(fills("end")).toEqual([model.ends.end.color, model.ends.end.color]);
});
it("draws a grid line at each labeled tick and a dotted line along each row", () => {
  const { container } = draw();
  expect(container.querySelectorAll('[data-grid="vertical"]').length).toBe(container.querySelectorAll('[data-mark="axis-tick-label"]').length);
  const rowLines = container.querySelectorAll('[data-mark="row-line"]');
  expect(rowLines).toHaveLength(2);
  expect(rowLines[0]).toHaveAttribute("stroke-dasharray");
});
it("draws a darker zero line only when the axis reaches zero", () => {
  expect(draw().container.querySelector('[data-mark="zero-line"]')).toBeNull();
  const { container } = draw({}, { observations: lineRows.map(r => ({ ...r, value: r.value - 50000 })) });
  expect(container.querySelector('[data-mark="zero-line"]')).not.toBeNull();
});
it("draws arrows from the start to the end in Arrow style", () => {
  const { container } = draw({ rangeStyle: "arrow" }, { observations: [...lineRows, ...fallingRows], comparisons: comparisons.slice(0, 2), periods: [2020,2030] });
  expect(container.querySelectorAll('[data-mark="endpoint"]')).toHaveLength(0);
  expect([...container.querySelectorAll('[data-mark="arrow"]')].map(a => a.getAttribute("data-direction"))).toContain("left");
  expect([...container.querySelectorAll('[data-mark="arrow"]')].map(a => a.getAttribute("data-direction"))).toContain("right");
});
it("puts the value axis on top when asked", () => {
  const bottom = draw().container.querySelector('[data-mark="axis-tick-label"]');
  const top = draw({ valueAxisPosition: "top" }).container.querySelector('[data-mark="axis-tick-label"]');
  expect(Number(top.getAttribute("y"))).toBeLessThan(0);
  expect(Number(bottom.getAttribute("y"))).toBeGreaterThan(0);
});
it("runs the connector backward when the value falls", () => {
  const { container } = draw({}, { observations: fallingRows, comparisons: [comparisons[1]], periods: [2020,2030] });
  const connector = container.querySelector('[data-mark="connector"]');
  expect(Number(connector.getAttribute("x2"))).toBeLessThan(Number(connector.getAttribute("x1")));
});
it("draws a row with one missing endpoint with its dot and label, without a connector", () => {
  const { container } = draw({}, { observations: gapRows.filter(r => r.geographyId === "06075" && r.period !== 2030), comparisons: [comparisons[2]], periods: [2020,2025] });
  expect(container.querySelectorAll('[data-mark="endpoint"]')).toHaveLength(1);
  expect(container.querySelector('[data-mark="connector"]')).toBeNull();
  expect(container.querySelector('[data-mark="row-label"]')).toHaveTextContent("San Francisco");
});
it("left-aligns row labels by default and honors right alignment", () => {
  const { container, unmount } = draw();
  expect(container.querySelector('[data-mark="row-label"]')).toHaveAttribute("text-anchor", "start");
  unmount();
  expect(draw({ variableLabelAlignment: "right" }).container.querySelector('[data-mark="row-label"]')).toHaveAttribute("text-anchor", "end");
});
it("draws a bold header for each group of rows", () => {
  const { container } = draw({ groupLabelAlignment: "center" }, { observations: groupedRows, periods: [2020,2030] });
  const headers = [...container.querySelectorAll('[data-mark="group-label"]')];
  expect(headers.map(h => h.textContent)).toEqual(["San Francisco", "Los Angeles"]);
  expect(headers[0]).toHaveAttribute("font-weight", "700");
  expect(headers[0]).toHaveAttribute("text-anchor", "middle");
  expect([...container.querySelectorAll('[data-mark="row-label"]')].map(l => l.textContent)).toEqual(["Latina Women", "White Women", "Latina Women", "White Women"]);
});
it("leaves out the value axis when Hide X-Axis is on", () => {
  expect(draw().container.querySelectorAll('[data-mark="axis-tick-label"]').length).toBeGreaterThan(0);
  expect(draw({ hideXAxis: true }).container.querySelectorAll('[data-mark="axis-tick-label"]')).toHaveLength(0);
});
it("puts each value outside its row's range", () => {
  const { container } = draw({ showPointLabels: true }, { observations: fallingRows, comparisons: [comparisons[1]], periods: [2020,2030] });
  const [start, end] = container.querySelectorAll('[data-mark="value-label"]');
  // The value fell, so the start is the higher value, on the right.
  expect(start).toHaveAttribute("text-anchor", "start");
  expect(end).toHaveAttribute("text-anchor", "end");
});
it("shows both values of the hovered row and bolds its label", () => {
  const { container } = draw();
  fireEvent.pointerEnter(container.querySelectorAll('[data-mark="row-hit"]')[0]);
  expect([...container.querySelectorAll('[data-mark="hover-label"]')].map(l => l.textContent)).toEqual(["40,000", "60,000"]);
  expect(container.querySelectorAll('[data-mark="row-label"]')[0]).toHaveAttribute("font-weight", "700");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Latina Women, San Francisco: 2020, 40,000; 2030, 60,000");
});
it("fades the other series while one is hovered", () => {
  const { container } = draw();
  const ends = () => [...container.querySelectorAll('[data-mark="endpoint"][data-endpoint="end"]')].map(dot => dot.getAttribute("fill"));
  const before = ends();
  fireEvent.pointerEnter(container.querySelectorAll('[data-mark="row-hit"]')[0]);
  expect(ends()[0]).toBe(before[0]);
  expect(ends()[1]).not.toBe(before[1]);
});
it("draws no hover changes once the pointer leaves", () => {
  const { container } = draw();
  const hit = container.querySelectorAll('[data-mark="row-hit"]')[0];
  fireEvent.pointerEnter(hit);
  fireEvent.pointerLeave(hit);
  expect(container.querySelectorAll('[data-mark="hover-label"]')).toHaveLength(0);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
it("moves between rows with the arrow keys", () => {
  const { container } = draw();
  const svg = container.querySelector("svg");
  fireEvent.keyDown(svg, { key: "ArrowDown" });
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^Latina Women/);
  fireEvent.keyDown(svg, { key: "ArrowDown" });
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^White Women/);
  fireEvent.keyDown(svg, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});
it("thins value axis labels that would touch at 330px", () => {
  const { model, container } = draw({}, {}, 330);
  const labels = [...container.querySelectorAll('[data-mark="axis-tick-label"]')];
  expect(labels.length).toBeLessThan(model.valueAxis.ticks.length);
  expect(labels[0]).toHaveTextContent(model.valueAxis.tickText[0]);
});
