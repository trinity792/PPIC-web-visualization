/**
 * Tests for lib/visualization/toPlotly.js - Phase 6 catalog builders and
 * variants. These supplement the Phase 2 adapter tests with the new base chart
 * families and named-form variants.
 */

import { describe, expect, it } from "vitest";

import { toPlotly } from "@/lib/visualization/toPlotly";

describe("toPlotly pie/donut", () => {
  it("renders a pie chart from category/value records", () => {
    const { data, layout } = toPlotly({
      chartType: "pie",
      bindings: { category: "category", y: "value" },
      series: [
        { category: "Renters", value: 60 },
        { category: "Owners", value: 40 },
      ],
      labels: { title: "Housing tenure" },
      appearance: {},
    });

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      type: "pie",
      labels: ["Renters", "Owners"],
      values: [60, 40],
      hole: 0,
    });
    expect(layout.title.text).toBe("Housing tenure");
  });

  it("renders a donut as the same pie chart with appearance.hole", () => {
    const { data } = toPlotly({
      chartType: "pie",
      bindings: { category: "category", y: "value" },
      series: [{ category: "A", value: 1 }],
      labels: {},
      appearance: { hole: 0.55 },
    });

    expect(data[0].type).toBe("pie");
    expect(data[0].hole).toBe(0.55);
  });
});

describe("toPlotly divergingBar", () => {
  const records = [
    { category: "Bay Area", value: 1.2 },
    { category: "Inland Empire", value: 0.6 },
    { category: "Central Coast", value: null },
  ];

  it("anchors each bar at the center reference and diverges by side", () => {
    const { data, layout } = toPlotly({
      chartType: "divergingBar",
      bindings: { category: "category", y: "value" },
      series: records,
      labels: { title: "Median on-track score by region" },
      appearance: { center: 1.0 },
    });

    expect(data).toHaveLength(1);
    const trace = data[0];
    expect(trace.type).toBe("bar");
    expect(trace.orientation).toBe("h");
    expect(trace.base).toBe(1.0);
    // Horizontal: categories on y, offsets-from-center on x.
    expect(trace.y).toEqual(["Bay Area", "Inland Empire", "Central Coast"]);
    expect(trace.x[0]).toBeCloseTo(0.2); // 1.2 - 1.0, above center
    expect(trace.x[1]).toBeCloseTo(-0.4); // 0.6 - 1.0, below center
    expect(trace.x[2]).toBeNull(); // non-finite value drops out
    // Above vs below center get distinct colors; missing is neutral gray.
    expect(trace.marker.color[0]).not.toBe(trace.marker.color[1]);
    // A center reference line is drawn at the center value.
    expect(layout.shapes?.some((shape) => shape.x0 === 1.0 && shape.x1 === 1.0)).toBe(true);
    expect(layout.yaxis.autorange).toBe("reversed");
  });

  it("defaults the center to 0 and flips to vertical on request", () => {
    const { data, layout } = toPlotly({
      chartType: "divergingBar",
      bindings: { category: "category", y: "value" },
      series: [{ category: "A", value: 5 }],
      labels: {},
      appearance: { orientation: "vertical" },
    });

    const trace = data[0];
    expect(trace.orientation).toBe("v");
    expect(trace.base).toBe(0);
    expect(trace.x).toEqual(["A"]);
    expect(trace.y).toEqual([5]);
    // Vertical: center line is horizontal at y = 0.
    expect(layout.shapes?.some((shape) => shape.y0 === 0 && shape.y1 === 0)).toBe(true);
  });
});

describe("toPlotly symbolMap", () => {
  it("renders proportional symbols from records with coordinates and a size binding", () => {
    const { data, layout } = toPlotly({
      chartType: "symbolMap",
      bindings: { geography: "location", size: "value" },
      series: [
        { location: "Alameda", lat: 37.65, lon: -121.91, value: 100 },
        { location: "Butte", lat: 39.65, lon: -121.59, value: 50 },
      ],
      labels: {},
      appearance: {},
    });

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      type: "scattergeo",
      mode: "markers",
      lat: [37.65, 39.65],
      lon: [-121.91, -121.59],
      text: ["Alameda", "Butte"],
    });
    expect(data[0].marker.size).toEqual([100, 50]);
    expect(layout.geo).toEqual(expect.objectContaining({ fitbounds: "locations" }));
  });
});

describe("toPlotly dataTable", () => {
  it("short-circuits to a table payload consumed by DataTableView", () => {
    const table = {
      columns: [
        { name: "Location", type: "text" },
        { name: "Population", type: "number" },
      ],
      rows: [
        ["Alameda", 100],
        ["Butte", 50],
      ],
    };

    expect(
      toPlotly({
        chartType: "dataTable",
        bindings: {},
        series: table,
        labels: {},
        appearance: {},
      }),
    ).toEqual({ table });
  });
});

describe("toPlotly variants", () => {
  it("renders stacked/percent bars through bar appearance instead of separate chart ids", () => {
    const stacked = toPlotly({
      chartType: "bar",
      bindings: { category: "category", y: "value", group: "group" },
      series: [
        { category: "A", group: "Renters", value: 60 },
        { category: "A", group: "Owners", value: 40 },
      ],
      labels: {},
      appearance: { stackMode: "percent" },
    });

    expect(stacked.layout.barmode).toBe("relative");
    expect(stacked.layout.barnorm).toBe("percent");
  });

  it("renders an area chart through the line appearance flag", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Population" },
      series: [{ location: "A", years: [2020, 2021], values: [1, 2] }],
      labels: {},
      appearance: { area: true },
    });

    expect(data[0]).toMatchObject({ stackgroup: "one", fill: "tonexty" });
  });

  it("renders a population-pyramid-style mirrored bar through appearance.mirror", () => {
    const { data, layout } = toPlotly({
      chartType: "bar",
      bindings: { category: "Age Group", y: "Population", group: "Sex" },
      series: [
        { category: "0-4", group: "Male", value: 52 },
        { category: "0-4", group: "Female", value: 48 },
      ],
      labels: {},
      appearance: { mirror: true, orientation: "horizontal" },
    });

    expect(data.find((trace) => trace.name === "Male").x).toEqual([-52]);
    expect(data.find((trace) => trace.name === "Female").x).toEqual([48]);
    expect(layout.xaxis.tickformat).toBe("~s");
  });
});
