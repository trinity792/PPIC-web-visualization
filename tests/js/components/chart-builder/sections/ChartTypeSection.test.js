/** Phase 5 chart-type tile contract. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  editorModel: null,
  config: { chartType: "line" },
  // A module that holds county geometry, so the two map tiles are offerable.
  schema: { id: "widgets", fields: { Y: { kind: "measure" }, X: { kind: "measure" }, Size: { kind: "measure" } }, subsets: { Counties: ["County"], Regions: ["Region"] } },
}));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));
vi.mock("@/lib/visualization/chartRegistry", async (importOriginal) => {
  const actual = await importOriginal();
  const experimental = {
    id: "experimental",
    label: "Experimental",
    purpose: "A registered chart omitted from the curated design order.",
    requiredRoles: [],
    optionalRoles: [],
    roleConstraints: {},
    defaults: {},
  };
  return {
    ...actual,
    CHART_TYPE_IDS: [...actual.CHART_TYPE_IDS, experimental.id],
    getChartType: (id) => (id === experimental.id ? experimental : actual.getChartType(id)),
  };
});

import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "@/lib/visualization/moduleSchemas/demographicProjections";
import ChartTypeSection from "@/components/chart-builder/sections/ChartTypeSection";

const orderedLabels = [
  "Line",
  "Bar",
  // One tile for the choropleth and symbol maps (owner, 2026-10-12).
  "Maps",
  // No Forest tile: a module question never returns interval bounds, so the
  // forest plot is offered only on pasted data (owner review, 2026-10-10).
  // One tile for the scatter, bubble, and dot plot charts (owner, 2026-10-05).
  "Scatter",
  "Range",
  "Pie / Donut",
  "Matrix Heatmap",
  "Data Table",
  "Experimental",
];

describe("ChartTypeSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = { chartType: "line" };
    state.editorModel = null;
    state.schema = { id: "widgets", fields: { Y: { kind: "measure" }, X: { kind: "measure" }, Size: { kind: "measure" } }, subsets: { Counties: ["County"], Regions: ["Region"] } };
  });

  it("renders one flat grid, the only layout", () => {
    render(<ChartTypeSection />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent.trim())).toEqual(orderedLabels);
    expect(buttons[0].parentElement).toHaveClass("grid-cols-2");
  });

  // The retired family headings (Line, Bar, Pie, Map, …) were labels, not
  // buttons; every tile label must now be a tile.
  it("renders no family headings alongside the tiles", () => {
    const { container } = render(<ChartTypeSection />);
    const nonTileText = [...container.querySelectorAll("*")].filter(
      (node) => !node.closest("button") && node.children.length === 0 && node.textContent.trim(),
    );
    expect(nonTileText).toHaveLength(0);
  });

  it("appends a registered type missing from the design order", () => {
    render(<ChartTypeSection />);
    expect(screen.getByRole("button", { name: "Experimental" })).toBeInTheDocument();
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
  it("drops the Maps tile on a module with no level we hold geometry for", () => {
    state.schema = { id: "permits", subsets: { Metros: ["Metro"], States: ["State"] } };
    render(<ChartTypeSection />);
    const labels = screen.getAllByRole("button").map((button) => button.textContent.trim());
    expect(labels).not.toContain("Maps");
    expect(labels).toContain("Line");
  });

  it("keeps the Maps tile on a module that has a Counties level", () => {
    render(<ChartTypeSection />);
    const labels = screen.getAllByRole("button").map((button) => button.textContent.trim());
    expect(labels).toContain("Maps");
  });

  // Owner, 2026-10-12: one Maps tile, opening on the choropleth, with a
  // Variant choice to draw symbols instead.
  describe("the Maps family tile", () => {
    it("opens on the choropleth", async () => {
      const user = userEvent.setup();
      render(<ChartTypeSection />);
      await user.click(screen.getByRole("button", { name: "Maps" }));
      expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_CHART_TYPE", chartType: "choroplethMap" });
    });

    it("switches between Choropleth and Symbols as chart types", async () => {
      const user = userEvent.setup();
      state.config = { chartType: "choroplethMap" };
      render(<ChartTypeSection />);
      expect(screen.getByRole("button", { name: "Maps" })).toHaveAttribute("aria-pressed", "true");
      const variants = screen.getByRole("group", { name: "Variant" });
      expect(
        [...variants.querySelectorAll("button")].map((button) => button.textContent),
      ).toEqual(["Choropleth", "Symbols"]);
      await user.click(screen.getByRole("button", { name: "Symbols" }));
      expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_CHART_TYPE", chartType: "symbolMap" });
    });
  });

  // Owner, 2026-10-05: Dot plot, Scatter, and Bubble are one tile with a
  // Variant control; each variant stays its own chart type.
  describe("the Scatter family tile", () => {
    const moduleChoices = [
      { id: "scatter", available: false, reason: "Scatter and bubble charts need two measures." },
      { id: "bubble", available: false, reason: "Scatter and bubble charts need two measures." },
      { id: "dotPlot", available: true },
    ];

    it("shows no Variant control for a chart that is its own tile", () => {
      render(<ChartTypeSection />);
      expect(screen.queryByRole("group", { name: "Variant" })).not.toBeInTheDocument();
    });

    it("marks the Scatter tile selected for each of its variants", () => {
      for (const chartType of ["scatter", "bubble", "dotPlot"]) {
        state.config = { chartType };
        const { container, unmount } = render(<ChartTypeSection />);
        // The tile is in the grid; the Variant control also has a Scatter button.
        const tile = [...container.querySelectorAll(".grid-cols-2 > button")].find((button) => button.textContent === "Scatter");
        expect(tile).toHaveAttribute("aria-pressed", "true");
        unmount();
      }
    });

    it("opens on the first variant the surface can draw", async () => {
      const user = userEvent.setup();
      render(<ChartTypeSection />);
      await user.click(screen.getByRole("button", { name: "Scatter" }));
      expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_CHART_TYPE", chartType: "scatter" });

      state.dispatch.mockClear();
      state.editorModel = { chartChoices: moduleChoices };
      render(<ChartTypeSection />);
      await user.click(screen.getAllByRole("button", { name: "Scatter" }).at(-1));
      expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_CHART_TYPE", chartType: "dotPlot" });
    });

    it("switches variants as chart types", async () => {
      const user = userEvent.setup();
      state.config = { chartType: "scatter" };
      render(<ChartTypeSection />);
      const variants = screen.getByRole("group", { name: "Variant" });
      expect(
        [...variants.querySelectorAll("button")].map((button) => button.textContent),
      ).toEqual(["Scatter", "Bubble", "Dot plot"]);
      await user.click(screen.getByRole("button", { name: "Bubble" }));
      expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_CHART_TYPE", chartType: "bubble" });
      // Choosing the family tile again keeps the current variant.
      state.dispatch.mockClear();
      await user.click(screen.getAllByRole("button", { name: "Scatter" })[0]);
      expect(state.dispatch).not.toHaveBeenCalled();
    });

    // Workstream Q: Demographic Projections holds one measure, so Scatter and
    // Bubble are hidden and the tile draws a dot plot. The control stays so the
    // reader can see what the Scatter tile is drawing.
    it("shows the Variant control even when Dot plot is the only variant", () => {
      state.schema = DEMOGRAPHIC_PROJECTIONS_SCHEMA;
      state.config = { chartType: "dotPlot" };
      render(<ChartTypeSection />);
      const variants = screen.getByRole("group", { name: "Variant" });
      expect(
        [...variants.querySelectorAll("button")].map((button) => button.textContent),
      ).toEqual(["Dot plot"]);
      expect(screen.getByRole("button", { name: "Dot plot", pressed: true })).toBeEnabled();
    });

    it("disables a variant this question cannot draw and says why", () => {
      state.config = { chartType: "dotPlot" };
      state.editorModel = { chartChoices: moduleChoices };
      render(<ChartTypeSection />);
      expect(screen.getByRole("button", { name: "Bubble" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Dot plot", pressed: true })).toBeEnabled();
      expect(screen.getByText("Scatter and bubble charts need two measures.")).toBeInTheDocument();
    });
  });
});
