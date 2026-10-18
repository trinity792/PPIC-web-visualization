import { expect, it } from "vitest";
import { input, pointRows, pointGroups, comparisons } from "@/tests/fixtures/visualization-v3/renderer";
import { moduleScatterRows } from "@/tests/fixtures/visualization-v3/modulePoints";

import { buildPointModel } from "@/lib/visualization/models/pointModel";
it.each(["scatter", "bubble"])("gives each point its comparison's color: %s", chartType => {
  const fixture = input(chartType, { comparisons: [comparisons[0]] });
  expect(buildPointModel(fixture).points.map(p => p.color)).toEqual(["#CA4F1A", "#CA4F1A"]);
});
it("sizes bubbles by area", () => {
  const points = buildPointModel(input("bubble", { appearance: { sizeByArea: false } })).points;
  expect(points[0].radius).toBeGreaterThan(0);
  expect(points[1].radius / points[0].radius).toBeCloseTo(2);
});
it.each(["x", "y"])("leaves out points with a missing value on either axis: %s", axis => {
  const model = buildPointModel(input("scatter", { observations: [...pointGroups[0], ...pointGroups[1].map(row => (row.measureRole || "y") === axis ? { ...row, value: null, status: "missing" } : row)] }));
  expect(model.points).toHaveLength(1);
  expect(model.points[0]).toMatchObject({ x: 10, y: 40000 });
});
it("keeps a genuine zero on either axis", () => expect(buildPointModel(input("scatter", { observations: pointGroups[0].map(row => ({ ...row, value: 0 })) })).points[0]).toMatchObject({ x: 0, y: 0 }));

// Owner decisions 2026-10-05 (renderer plan J).
it("starts the vertical axis at zero and fits the horizontal one, unless both are fitted", () => {
  const model = buildPointModel(input("scatter"));
  expect(model.yAxis.domain[0]).toBe(0);
  expect(model.xAxis.domain[0]).toBeGreaterThan(0);
  const fitted = buildPointModel(input("scatter", { appearance: { fitAxes: true } }));
  expect(fitted.yAxis.domain[0]).toBeGreaterThan(0);
  expect(fitted.yAxis.domain[1]).toBeGreaterThanOrEqual(50000);
});
it("names points automatically unless point labels are off", () => {
  expect(buildPointModel(input("scatter")).pointLabels).toBe("automatic");
  expect(buildPointModel(input("scatter", { appearance: { pointLabels: "off" } })).pointLabels).toBe("off");
  expect(buildPointModel(input("scatter")).points.map(p => p.name)).toEqual(["San Francisco", "San Francisco"]);
});
it("leaves out a bubble with no size rather than drawing it at zero", () => {
  const model = buildPointModel(input("bubble", { observations: [...pointGroups[0], ...pointGroups[1].map(row => row.measureRole === "size" ? { ...row, value: null, status: "missing" } : row)] }));
  expect(model.points).toHaveLength(1);
});
it("says a module's single outcome has nothing to place across", () => {
  const rows = pointRows.filter(row => !row.measureRole);
  const model = buildPointModel(input("scatter", { observations: rows }));
  expect(model.points).toEqual([]);
  expect(model.emptyMessage).toMatch(/second measure/);
});
it("draws a key only when several comparisons are plotted", () => {
  expect(buildPointModel(input("scatter", { comparisons: [comparisons[0]] })).key.entries).toEqual([]);
  const two = buildPointModel(input("scatter", { observations: [...pointGroups[0], ...pointGroups[1].map(row => ({ ...row, comparisonId: "white", comparisonLabel: "White Women" }))] }));
  expect(two.key.entries.map(e => e.label)).toEqual(["Latina Women", "White Women"]);
  expect(two.key.position).toBe("top");
});

// Workstream Q: a module's scatter arrives as one row per measure.
it("draws a module scatter from paired rows", () => {
  const model = buildPointModel(input("scatter", { observations: moduleScatterRows }));
  // Marin's horizontal value is suppressed, so it is left out, not drawn at zero.
  expect(model.points).toHaveLength(2);
  expect(model.points.map(p => p.name)).toEqual(["San Francisco", "Los Angeles"]);
  expect(model.points[0]).toMatchObject({ x: 10, y: 40000 });
  expect(model.points[1]).toMatchObject({ x: 20, y: 50000 });
  expect(model.emptyMessage).toBeNull();
});
it("draws a module bubble's size from the size measure", () => {
  const model = buildPointModel(input("bubble", { observations: moduleScatterRows }));
  expect(model.points.map(p => p.size)).toEqual([100, 400]);
  expect(model.points[1].radius / model.points[0].radius).toBeCloseTo(2);
});
