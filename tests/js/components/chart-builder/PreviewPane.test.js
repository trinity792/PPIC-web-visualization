/**
 * PreviewPane GraphTabs integration: the filter row lives inside each chart
 * slot, including embedded mode, and dispatches to that slot's chart id.
 */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const dispatch = vi.hoisted(() => vi.fn());
const config = {
  data: {
    source: "inline",
    inline: {
      columns: [
        { name: "Region", type: "text" },
        { name: "Value", type: "number" },
      ],
      rows: [["North", "1"], ["South", "2"]],
    },
  },
  filters: {
    tabColumn: "Region",
    tabValue: "North",
    tabOrder: ["North", "South"],
  },
  appearance: {},
};

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    dispatch,
    workspace: { layout: "1x1", charts: [{ id: "chart-1", config }] },
  }),
}));

vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  usePreview: () => ({
    previews: [
      {
        id: "chart-1",
        name: "Chart 1",
        active: true,
        config,
        status: "ready",
        plotly: { data: [{ x: [1], y: [1] }], layout: {}, config: {} },
        renderError: null,
      },
    ],
    setGraphDiv: vi.fn(),
  }),
}));

vi.mock("@/components/charts/PlotlyChart", () => ({
  default: () => <div data-testid="plotly-chart" />,
}));

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";

describe("PreviewPane GraphTabs", () => {
  it("renders interactive tabs in embedded mode and targets the chart slot", () => {
    render(<PreviewPane embedded />);

    expect(screen.queryByText("Region:")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter chart by Region" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "North" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "South" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      chartId: "chart-1",
      key: "tabValue",
      value: "South",
    });
  });
});
