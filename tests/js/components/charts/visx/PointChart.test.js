import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { input, pointRows, pointGroups } from "@/tests/fixtures/visualization-v3/renderer";

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
  const { container } = draw({}, { observations: [...pointGroups[0], ...pointGroups[1].map(row => row.measureRole === "x" ? { ...row, value: null, status: "missing" } : row)] });
  expect(container.querySelectorAll('[data-mark="point"]')).toHaveLength(1);
});

// Owner decisions 2026-10-05 (renderer plan J).
function drawScatter(appearance = {}, overrides = {}) {
  const model = buildPointModel(input("scatter", { appearance, ...overrides }));
  return render(<PointChart model={model} width={650} height={400} />);
}
it("names each point beside it on Automatic, and not when labels are off", () => {
  const rows = [...pointGroups[0].map(row => ({ ...row, categoryLabel: "Bay Area" })), ...pointGroups[1].map(row => ({ ...row, categoryLabel: "Inland Empire" }))];
  const { container, unmount } = drawScatter({}, { observations: rows });
  expect([...container.querySelectorAll('[data-mark="point-label"]')].map(l => l.textContent)).toEqual(["Bay Area", "InlandEmpire"]);
  unmount();
  const off = drawScatter({ pointLabels: "off" }, { observations: rows });
  expect(off.container.querySelectorAll('[data-mark="point-label"]')).toHaveLength(0);
});
it("draws axis titles inside the plot and grid lines both ways", () => {
  const { container } = drawScatter();
  expect(container.querySelector('[data-axis-title="x"]')).toHaveTextContent("Year");
  expect(container.querySelector('[data-axis-title="y"]')).toHaveTextContent("People");
  expect(container.querySelectorAll('[data-grid="vertical"]').length).toBeGreaterThan(1);
  expect(container.querySelectorAll('[data-grid="horizontal"]').length).toBeGreaterThan(1);
});
it("labels the focused point for the keyboard and clears on Escape", () => {
  const { container } = drawScatter({}, { observations: [...pointGroups[0].map(row => ({ ...row, categoryLabel: "Bay Area" })), ...pointGroups[1]] });
  const chart = container.querySelector("svg");
  fireEvent.keyDown(chart, { key: "Home" });
  expect(screen.getByRole("tooltip")).toHaveTextContent("Bay Area");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Year: 10");
  fireEvent.keyDown(chart, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
it("says why a scatter has nothing to draw", () => {
  const rows = pointRows.filter(row => !row.measureRole);
  drawScatter({}, { observations: rows });
  expect(screen.getByRole("status")).toHaveTextContent(/second measure/);
});

// Owner, 2026-10-05: hover starts only with the pointer over a point itself,
// not over its name label or empty plot.
function pointerAt(container, x, y) {
  const surface = container.querySelector("[data-chart-interaction]");
  const width = Number(surface.getAttribute("width"));
  const height = Number(surface.getAttribute("height"));
  // A box the size of the plot, so client px are plot px.
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height });
  fireEvent.pointerMove(surface, { clientX: x, clientY: y });
}
it("labels a point only while the pointer is over it, not over its name", () => {
  const rows = [...pointGroups[0].map(row => ({ ...row, categoryLabel: "Bay Area" })), ...pointGroups[1].map(row => ({ ...row, categoryLabel: "Inland Empire" }))];
  const { container } = drawScatter({}, { observations: rows });
  const dot = container.querySelector('[data-mark="point"]');
  const [cx, cy, r] = ["cx", "cy", "r"].map(name => Number(dot.getAttribute(name)));

  // The point's own name, read before hovering (a hovered point's name moves
  // into the hover label).
  const name = [...container.querySelectorAll('[data-mark="point-label"]')].find(label => label.textContent === "Bay Area");
  const anchor = name.getAttribute("text-anchor");
  const nameX = Number(name.getAttribute("x")) + (anchor === "end" ? -20 : anchor === "start" ? 20 : 0);
  const nameY = Number(name.getAttribute("y"));

  // Over the point, and just past its edge.
  pointerAt(container, cx, cy);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Bay Area");
  pointerAt(container, cx + r + 2, cy);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Bay Area");

  // Over the point's name: no hover.
  pointerAt(container, nameX, nameY);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  // Empty plot, far from every point.
  pointerAt(container, 1, 1);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
it("picks the smaller bubble inside a larger one when the pointer is over both", () => {
  const { container, model } = draw({}, { observations: [...pointGroups[0], ...pointGroups[1]] });
  const dots = [...container.querySelectorAll('[data-mark="point"]')];
  const [small, large] = [...dots].sort((a, b) => Number(a.getAttribute("r")) - Number(b.getAttribute("r")));
  // Move the pointer onto the small bubble's center, even if the large one covers it.
  pointerAt(container, Number(small.getAttribute("cx")), Number(small.getAttribute("cy")));
  const smallName = model.points[dots.indexOf(small)].name;
  expect(screen.getByRole("tooltip")).toHaveTextContent(smallName);
  expect(large).toBeTruthy();
});
