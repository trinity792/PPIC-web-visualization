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
