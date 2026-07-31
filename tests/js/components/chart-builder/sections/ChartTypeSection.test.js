/** Phase 5 chart-type tile contract. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: { chartType: "line" },
  // A module that holds county geometry, so the two map tiles are offerable.
  schema: { id: "widgets", subsets: { Counties: ["County"], Regions: ["Region"] } },
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
    state.schema = { id: "widgets", subsets: { Counties: ["County"], Regions: ["Region"] } };
  });

  it("renders the mockup tiles plus Range in order, two columns per row", () => {
    render(<ChartTypeSection />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent.trim())).toEqual(orderedLabels);
    expect(buttons[0].parentElement).toHaveClass("grid-cols-2");
  });

  it("does not append the hidden, retired Diverging Bar as a stray tile (Workstream B)", () => {
    render(<ChartTypeSection />);
    expect(
      screen.queryByRole("button", { name: "Diverging Bar" }),
    ).not.toBeInTheDocument();
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

  // Workstream D: a map tile on a module with no county geometry could only
  // ever fail at the data layer — Building Permits offers Metros, Regions and
  // States, none of which we hold shapes or derived points for.
  it("drops both map tiles on a module with no level we hold geometry for", () => {
    state.schema = { id: "permits", subsets: { Metros: ["Metro"], States: ["State"] } };
    render(<ChartTypeSection />);
    const labels = screen.getAllByRole("button").map((button) => button.textContent.trim());
    expect(labels).not.toContain("Choropleth Map");
    expect(labels).not.toContain("Symbol Map");
    expect(labels).toContain("Line");
  });

  it("keeps both map tiles on a module that has a Counties level", () => {
    render(<ChartTypeSection />);
    const labels = screen.getAllByRole("button").map((button) => button.textContent.trim());
    expect(labels).toContain("Choropleth Map");
    expect(labels).toContain("Symbol Map");
  });
});
