/**
 * Tests for lib/visualization/chartRegistry.js - Phase 6 catalog growth.
 * The overhaul adds three base chart ids and moves named visual forms into
 * descriptor variants rather than separate one-off components.
 */

import { describe, expect, it } from "vitest";

import {
  CHART_TYPE_IDS,
  CHART_TYPES,
  getChartType,
} from "@/lib/visualization/chartRegistry";
import { toPlotly } from "@/lib/visualization/toPlotly";

describe("Phase 6 catalog ids", () => {
  it("registers pie, symbolMap, and dataTable as base chart types", () => {
    expect(CHART_TYPE_IDS).toEqual(
      expect.arrayContaining(["pie", "symbolMap", "dataTable"]),
    );
  });

  it("keeps donut as a pie variant through appearance.hole", () => {
    const pie = getChartType("pie");
    expect(pie).toMatchObject({
      id: "pie",
      transformCapable: false,
      requiredRoles: ["category", "y"],
    });
    expect(pie.roleConstraints.category).toContain("dimension");
    expect(pie.roleConstraints.y).toContain("measure");
    expect(pie.defaults).toMatchObject({ hole: 0 });
  });

  it("registers divergingBar as a Bar-family variant with a center reference default", () => {
    const divergingBar = getChartType("divergingBar");
    expect(divergingBar).toMatchObject({
      id: "divergingBar",
      transformCapable: true,
      requiredRoles: ["category", "y"],
    });
    expect(divergingBar.roleConstraints.category).toContain("dimension");
    expect(divergingBar.roleConstraints.y).toContain("measure");
    expect(divergingBar.defaults).toMatchObject({
      orientation: "horizontal",
      center: 0,
    });
  });

  it("registers proportional-symbol maps as the symbolMap chart family", () => {
    const symbolMap = getChartType("symbolMap");
    expect(symbolMap).toMatchObject({
      id: "symbolMap",
      transformCapable: false,
      requiredRoles: ["geography", "size"],
      requiresGeometry: true,
    });
    expect(symbolMap.roleConstraints.geography).toContain("dimension");
    expect(symbolMap.roleConstraints.size).toContain("measure");
  });

  it("registers dataTable as a chart type with table-specific appearance defaults", () => {
    const dataTable = getChartType("dataTable");
    expect(dataTable).toMatchObject({
      id: "dataTable",
      transformCapable: false,
      requiredRoles: [],
    });
    expect(dataTable.defaults).toMatchObject({
      search: true,
      sortable: true,
      pageSize: 25,
    });
  });
});

describe("descriptor metadata", () => {
  it("declares Group sectioning and spacing on every applicable chart family", () => {
    for (const chartType of [
      "bar",
      "divergingBar",
      "dumbbell",
      "dotPlot",
      "forest",
    ]) {
      const chart = getChartType(chartType);
      expect(chart.optionalRoles).toContain("group");
      expect(chart.roleConstraints.group).toContain("dimension");
      expect(chart.defaults.groupGap).toBeGreaterThan(0);
    }
  });

  it("exposes grid spacing only for Cartesian chart families", () => {
    for (const chartType of [
      "line",
      "bar",
      "divergingBar",
      "heatmap",
      "dumbbell",
      "dotPlot",
      "forest",
      "scatter",
      "bubble",
    ]) {
      expect(getChartType(chartType).lineAxes).toEqual(["horizontal", "vertical"]);
    }
    for (const chartType of ["choroplethMap", "pie", "symbolMap", "dataTable"]) {
      expect(getChartType(chartType).lineAxes).toBeUndefined();
    }
  });

  it("tags every chart descriptor with transform capability", () => {
    for (const [id, descriptor] of Object.entries(CHART_TYPES)) {
      expect(typeof descriptor.transformCapable, `chart type: ${id}`).toBe("boolean");
      expect(descriptor.controlTiers, `chart type: ${id}`).toBeUndefined();
      expect(descriptor.tierHints, `chart type: ${id}`).toBeUndefined();
    }
  });

  it("does not register the retired Slopegraph", () => {
    expect(CHART_TYPE_IDS).not.toContain("slope");
    expect(getChartType("slope")).toBeUndefined();
  });

  it("keeps a working toPlotly builder for every remaining registered type", () => {
    const specs = {
      line: {
        bindings: { x: "Year", y: "Value" },
        series: [{ location: "A", years: [2024, 2025], values: [1, 2] }],
      },
      bar: {
        bindings: { category: "category", y: "value" },
        series: [{ category: "A", value: 1 }],
      },
      divergingBar: {
        bindings: { category: "category", y: "value" },
        series: [{ category: "A", value: 1 }],
      },
      choroplethMap: {
        bindings: { geography: "geoid", color: "value" },
        series: [{ geoid: "06001", value: 1 }],
        geometry: { type: "FeatureCollection", features: [] },
      },
      dumbbell: {
        bindings: { category: "category", start: "start", end: "end" },
        series: [{ category: "A", start: 1, end: 2 }],
      },
      dotPlot: {
        bindings: { y: "row", x: "column", color: "value" },
        series: { x: ["X"], y: ["A"], z: [[1]] },
      },
      forest: {
        bindings: { category: "category", start: "start", end: "end" },
        series: [{ category: "A", start: 1, end: 2 }],
      },
      scatter: {
        bindings: { unit: "location", x: "x", y: "y" },
        series: [{ location: "A", x: 1, y: 2 }],
      },
      bubble: {
        bindings: { unit: "location", x: "x", y: "y", size: "size" },
        series: [{ location: "A", x: 1, y: 2, size: 3 }],
      },
      heatmap: {
        bindings: { x: "column", y: "row", color: "value" },
        series: { x: ["X"], y: ["A"], z: [[1]] },
      },
      pie: {
        bindings: { category: "category", y: "value" },
        series: [{ category: "A", value: 1 }],
      },
      symbolMap: {
        bindings: { geography: "location", size: "value" },
        series: [{ location: "A", lat: 37, lon: -122, value: 1 }],
      },
      dataTable: {
        bindings: {},
        series: { columns: [{ name: "Value" }], rows: [[1]] },
      },
    };

    for (const chartType of CHART_TYPE_IDS) {
      expect(() =>
        toPlotly({
          chartType,
          labels: {},
          appearance: {},
          period: {},
          ...specs[chartType],
        }),
      `chart type: ${chartType}`).not.toThrow();
    }
  });

  it("keeps variants on base chart descriptors instead of growing one id per named form", () => {
    expect(CHART_TYPE_IDS).not.toEqual(
      expect.arrayContaining([
        "donut",
        "populationPyramid",
        "stackedBar",
        "groupedBar",
        "area",
      ]),
    );
    expect(getChartType("bar").defaults).toEqual(
      expect.objectContaining({ stackMode: expect.any(String), mirror: expect.any(Boolean) }),
    );
    expect(getChartType("line").defaults).toEqual(
      expect.objectContaining({ area: expect.any(Boolean) }),
    );
  });
});
