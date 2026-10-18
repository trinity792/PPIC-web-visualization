/**
 * seriesNamesFor — the editor's series names, which used to be the Plotly
 * adapter's trace names (renderer plan O). Each case pins the name the old
 * Plotly trace carried, and the line and bar cases also check that the names
 * match what the visx drawing labels.
 */

import { describe, expect, it } from "vitest";

import { buildChartModel } from "@/lib/visualization/models";
import { seriesNamesFor } from "@/lib/visualization/seriesNames";
import { input, observations } from "@/tests/fixtures/visualization-v3/renderer";

describe("seriesNamesFor", () => {
  it("names line series as the line chart labels them", () => {
    const value = input("line");
    expect(seriesNamesFor(value)).toEqual(["Latina Women", "White Women"]);
    expect(seriesNamesFor(value)).toEqual(buildChartModel(value).series.map((s) => s.label));
  });

  it("names bar series as the bar chart labels them, period included", () => {
    const value = input("bar", {
      observations: observations.filter((r) => r.comparisonId !== "black" && [2020, 2025].includes(r.period)),
    });
    expect(seriesNamesFor(value)).toEqual([
      "Latina Women · 2020",
      "Latina Women · 2025",
      "White Women · 2020",
      "White Women · 2025",
    ]);
    expect(seriesNamesFor(value)).toEqual(buildChartModel(value).series.map((s) => s.label));
  });

  it.each(["dotPlot", "scatter", "bubble"])("names one series per visible comparison: %s", (type) => {
    expect(seriesNamesFor(input(type))).toEqual(["Latina Women", "White Women"]);
  });

  it("leaves out a hidden comparison", () => {
    const value = input("dotPlot", {
      presentation: { comparisonPresentation: "combined", comparisonVisibility: { white: false } },
    });
    expect(seriesNamesFor(value)).toEqual(["Latina Women"]);
  });

  it.each(["pie", "heatmap", "forest"])("has no series names, as its Plotly trace had none: %s", (type) => {
    expect(seriesNamesFor(input(type))).toEqual([]);
  });

  it("still reads a symbol map's name from its Plotly trace", () => {
    expect(seriesNamesFor(input("symbolMap"))).toEqual(["Latina Women"]);
  });
});
