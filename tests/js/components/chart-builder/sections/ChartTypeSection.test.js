/** Phase 5 chart-type tile contract. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: { chartType: "line" },
  schema: { id: "widgets" },
}));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import ChartTypeSection from "@/components/chart-builder/sections/ChartTypeSection";

const orderedLabels = [
  "Line",
  "Bar",
  "Choropleth Map",
  "Forest / Whisker Plot",
  "Diverging Bar",
  "Symbol Map",
  "Dot Plot",
  "Range",
  "Pie / Donut",
  "Scatter",
  "Bubble",
  "Matrix Heatmap",
  "Data Table",
];

describe("ChartTypeSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = { chartType: "line" };
    state.schema = { id: "widgets" };
  });

  it("renders the mockup tiles plus Range in order, two columns per row", () => {
    render(<ChartTypeSection />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent.trim())).toEqual(orderedLabels);
    expect(buttons[0].parentElement).toHaveClass("grid-cols-2");
  });

  it("marks and dispatches the selected chart type", async () => {
    const user = userEvent.setup();
    render(<ChartTypeSection />);
    expect(screen.getByRole("button", { name: "Line" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Bar" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_CHART_TYPE",
      chartType: "bar",
    });
  });

  it("honors a module's supportedChartTypes allowlist", () => {
    state.schema = { id: "widgets", supportedChartTypes: ["line", "pie", "dataTable"] };
    render(<ChartTypeSection />);
    expect(screen.getAllByRole("button").map((button) => button.textContent.trim())).toEqual([
      "Line",
      "Pie / Donut",
      "Data Table",
    ]);
  });
});
