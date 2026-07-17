/**
 * Tests for components/charts/PlotlyChart.js - Phase 5 export integration.
 * PlotlyChart owns the single mounted graph-div handoff and removes Plotly's
 * built-in PNG button so ExportMenu is the only export path.
 */

import React from "react";

import { render, waitFor } from "@testing-library/react";
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

  it("normalizes automatic sizing without exposing the caller layout to Plotly", () => {
    const layout = { title: { text: "Chart" } };

    render(<PlotlyChart data={[]} layout={layout} />);

    expect(plotlyMock.props.layout).not.toBe(layout);
    expect(plotlyMock.props.layout.height).toBe(520);
    expect(layout.height).toBeUndefined();
  });

  it("honors a chart-specific minimum height", () => {
    render(<PlotlyChart data={[]} layout={{ height: 740 }} height={520} />);

    expect(plotlyMock.props.style.height).toBe("740px");
    expect(plotlyMock.props.layout.height).toBe(740);
  });

  it("restores automatic height when the same chart remounts in another step", () => {
    const layout = { height: 740 };
    const first = render(<PlotlyChart data={[]} layout={layout} height={520} />);

    // Plotly's responsive setup mutates the layout object it receives.
    plotlyMock.props.layout.height = 610;
    first.unmount();
    render(<PlotlyChart data={[]} layout={layout} height={520} />);

    expect(layout.height).toBe(740);
    expect(plotlyMock.props.style.height).toBe("740px");
    expect(plotlyMock.props.layout.height).toBe(740);
  });

  it("turns horizontal line spacing into physical and internal Plotly height", () => {
    render(
      <PlotlyChart
        data={[]}
        layout={{
          height: 740,
          meta: {
            ppicLinePadding: { horizontal: 10, horizontalCount: 3 },
          },
        }}
        height={520}
      />,
    );

    expect(plotlyMock.props.style.height).toBe("800px");
    expect(plotlyMock.props.layout.height).toBe(800);
    expect(plotlyMock.props.layout.yaxis?.nticks).toBeUndefined();
  });

  it("turns vertical line spacing into physical width", async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 600 });
    try {
      render(
        <PlotlyChart
          data={[]}
          layout={{
            meta: {
              ppicLinePadding: { vertical: 12, verticalCount: 5 },
            },
          }}
        />,
      );

      await waitFor(() => expect(plotlyMock.props.style.width).toBe("720px"));
      expect(plotlyMock.props.layout.xaxis?.nticks).toBeUndefined();
    } finally {
      rect.mockRestore();
    }
  });
});
