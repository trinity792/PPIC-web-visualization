/**
 * Tests for components/charts/PlotlyChart.js - Phase 5 export integration.
 * PlotlyChart owns the single mounted graph-div handoff and removes Plotly's
 * built-in PNG button so ExportMenu is the only export path.
 */

import React from "react";

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const plotlyMock = vi.hoisted(() => ({
  props: null,
  graphDiv: { id: "plotly-graph-div" },
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockPlot(props) {
      plotlyMock.props = props;
      props.onInitialized?.({}, plotlyMock.graphDiv);
      props.onUpdate?.({}, plotlyMock.graphDiv);
      return <div data-testid="plotly-chart" />;
    },
}));

vi.mock("@/components/ui/use-mobile", () => ({
  useIsMobile: () => false,
}));

import PlotlyChart from "@/components/charts/PlotlyChart";

describe("PlotlyChart export integration", () => {
  beforeEach(() => {
    plotlyMock.props = null;
  });

  it("hands the mounted graph div to onGraphDiv on init/update", () => {
    const onGraphDiv = vi.fn();

    render(<PlotlyChart data={[]} layout={{}} onGraphDiv={onGraphDiv} />);

    expect(onGraphDiv).toHaveBeenCalledWith(plotlyMock.graphDiv);
  });

  it("removes Plotly's built-in image export button while preserving caller config", () => {
    render(
      <PlotlyChart
        data={[]}
        layout={{}}
        config={{
          displayModeBar: true,
          modeBarButtonsToRemove: ["lasso2d"],
        }}
      />,
    );

    expect(plotlyMock.props.config.displayModeBar).toBe(true);
    expect(plotlyMock.props.config.modeBarButtonsToRemove).toEqual(
      expect.arrayContaining(["lasso2d", "toImage"]),
    );
    expect(new Set(plotlyMock.props.config.modeBarButtonsToRemove).size).toBe(
      plotlyMock.props.config.modeBarButtonsToRemove.length,
    );
  });
});
