/** Hide grid lines: every chart that draws an internal grid drops it, and only it. */

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { input } from "@/tests/fixtures/visualization-v3/renderer";

import BarChart from "@/components/charts/visx/BarChart";
import DotPlot from "@/components/charts/visx/DotPlot";
import ForestPlot from "@/components/charts/visx/ForestPlot";
import LineChart from "@/components/charts/visx/LineChart";
import PointChart from "@/components/charts/visx/PointChart";
import RangeChart from "@/components/charts/visx/RangeChart";
import { getChartType } from "@/lib/visualization/chartRegistry";
import { buildChartModel } from "@/lib/visualization/models";
import { getSetting } from "@/lib/visualization/settingsRegistry";

const RENDERERS = {
  line: LineChart,
  bar: BarChart,
  dumbbell: RangeChart,
  dotPlot: DotPlot,
  forest: ForestPlot,
  scatter: PointChart,
  bubble: PointChart,
};

function draw(chartType, appearance = {}) {
  const Chart = RENDERERS[chartType];
  const model = buildChartModel(input(chartType, { appearance }));
  return render(<Chart model={model} width={650} height={400} />).container;
}

describe("Hide grid lines", () => {
  it("is offered on exactly the charts that draw a grid", () => {
    expect(getSetting("hideGridLines").charts).toEqual(Object.keys(RENDERERS));
    for (const chartType of Object.keys(RENDERERS)) {
      expect(getChartType(chartType).drawsGrid, chartType).toBe(true);
    }
    for (const chartType of ["heatmap", "pie", "choroplethMap", "symbolMap", "dataTable"]) {
      expect(getChartType(chartType).drawsGrid, chartType).toBeUndefined();
    }
  });

  it.each(Object.keys(RENDERERS))("%s: removes the grid and keeps the axes", (chartType) => {
    const shown = draw(chartType);
    const hidden = draw(chartType, { hideGridLines: true });

    expect(shown.querySelectorAll("[data-grid]").length, chartType).toBeGreaterThan(0);
    expect(hidden.querySelectorAll("[data-grid]"), chartType).toHaveLength(0);
    // Tick labels belong to the axes, not the grid, so they all stay.
    expect(hidden.querySelectorAll("text").length, chartType).toBe(
      shown.querySelectorAll("text").length,
    );
  });
});
