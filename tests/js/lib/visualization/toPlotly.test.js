/**
 * Tests for lib/visualization/toPlotly.js — the declarative-spec → Plotly
 * adapter. Focused on the graph-editor overhaul Phase 2 changes: heatmap
 * transforms, and colors sourced through lib/visualization/palettes.js.
 */

import { describe, expect, it } from "vitest";

import { BASE_PLOTLY_COLORS, COLORS } from "@/lib/constants";
import { paletteForScale, resolveToken } from "@/lib/visualization/palettes";
import { toPlotly } from "@/lib/visualization/toPlotly";

const countField = {
  kind: "measure",
  unit: "count",
  transforms: ["actual", "indexed", "numericChange", "percentChange"],
};

describe("toPlotly heatmap", () => {
  const matrix = { x: [2020, 2021, 2022], y: ["A", "B"], z: [
    [10, 20, 30],
    [5, 10, 15],
  ] };

  it("leaves the matrix unchanged for the default 'actual' transform", () => {
    const { data } = toPlotly({
      chartType: "heatmap",
      series: matrix,
      appearance: {},
      field: countField,
    });
    expect(data[0].z).toEqual(matrix.z);
  });

  it("indexes each row to 100 at the base-year column", () => {
    const { data } = toPlotly({
      chartType: "heatmap",
      series: matrix,
      appearance: {},
      field: countField,
      transforms: { id: "indexed", baseYear: 2020 },
    });
    expect(data[0].z).toEqual([
      [100, 200, 300],
      [100, 200, 300],
    ]);
  });

  it("is null-safe: a missing cell stays null rather than becoming 0", () => {
    const withGap = { x: [2020, 2021], y: ["A"], z: [[10, null]] };
    const { data } = toPlotly({
      chartType: "heatmap",
      series: withGap,
      appearance: {},
      field: countField,
      transforms: { id: "numericChange", baseYear: 2020 },
    });
    expect(data[0].z).toEqual([[0, null]]);
  });
});

describe("toPlotly bar (unchanged for 'actual')", () => {
  it("renders raw values and the default palette's first color", () => {
    const { data } = toPlotly({
      chartType: "bar",
      bindings: { category: "category", y: "value" },
      series: [
        { category: "A", value: 10 },
        { category: "B", value: 20 },
      ],
      appearance: {},
    });
    expect(data).toHaveLength(1);
    expect(data[0].y).toEqual([10, 20]);
    expect(data[0].marker.color).toBe(BASE_PLOTLY_COLORS[0]);
  });
});

describe("toPlotly choropleth (unchanged for 'actual')", () => {
  it("renders raw values with the legacy sequential ramp", () => {
    const { data } = toPlotly({
      chartType: "choroplethMap",
      bindings: { geography: "geoid", color: "value" },
      series: [{ geoid: "06001", value: 5 }],
      geometry: { type: "FeatureCollection", features: [] },
      appearance: {},
    });
    expect(data[0].z).toEqual([5]);
    expect(data[0].colorscale).toEqual(paletteForScale("sequential"));
  });

  it("switches to the diverging ramp when appearance.colorScale is 'diverging'", () => {
    const { data } = toPlotly({
      chartType: "choroplethMap",
      bindings: { geography: "geoid", color: "value" },
      series: [{ geoid: "06001", value: 5 }],
      geometry: { type: "FeatureCollection", features: [] },
      appearance: { colorScale: "diverging" },
    });
    expect(data[0].colorscale).toBe("RdBu");
  });
});

describe("toPlotly line series colors", () => {
  const series = [
    { location: "A", years: [2020, 2021], values: [1, 2] },
    { location: "B", years: [2020, 2021], values: [3, 4] },
  ];

  it("uses the default palette cycle when no override or palette is set", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series,
      appearance: {},
    });
    expect(data[0].line.color).toBe(BASE_PLOTLY_COLORS[0]);
    expect(data[1].line.color).toBe(BASE_PLOTLY_COLORS[1]);
  });

  it("honors a per-series seriesColors override", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series,
      appearance: { seriesColors: { B: "burntOrange" } },
    });
    expect(data[0].line.color).toBe(BASE_PLOTLY_COLORS[0]);
    // "burntOrange" overrides B's default-cycle color ("orange3" at index 1).
    expect(data[1].line.color).toBe(COLORS.burntOrange);
    expect(data[1].line.color).not.toBe(BASE_PLOTLY_COLORS[1]);
  });

  it("switches every un-overridden series when the palette changes", () => {
    const { data } = toPlotly({
      chartType: "line",
      bindings: { x: "Year", y: "Value" },
      series,
      appearance: { palette: "colorblind-safe" },
    });
    expect(data[0].line.color).toBe(resolveToken("blue5"));
    expect(data[1].line.color).toBe(resolveToken("orange2"));
  });
});
