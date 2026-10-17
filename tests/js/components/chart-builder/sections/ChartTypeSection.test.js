/** Phase 5 chart-type tile contract, with the 2026-10-12 icon tiles and Show more. */

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
// The real store passes through for the byod-shapes helpers (createChartConfig,
// reduceChartConfig); only the hook the component reads is replaced.
vi.mock("@/components/chart-builder/chartConfigStore", async (importOriginal) => ({
  ...(await importOriginal()),
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

// Owner, 2026-10-12: the first four tiles are Line, Bar, Range, Maps; the rest
// sit behind "Show more".
const visibleLabels = ["Line", "Bar", "Range", "Maps"];

const orderedLabels = [
  ...visibleLabels,
  // No Forest tile: a module question never returns interval bounds, so the
  // forest plot is offered only on pasted data (owner review, 2026-10-10).
  // One tile for the scatter, bubble, and dot plot charts (owner, 2026-10-05).
  "Scatter",
  "Pie / Donut",
  "Matrix Heatmap",
  "Data Table",
  "Experimental",
];

/** The chart-type tiles alone, without the Show more toggle or a Variant control. */
function tiles() {
  return [...screen.getByRole("group", { name: "Chart type" }).querySelectorAll(":scope > button")];
}

function tileLabels() {
  return tiles().map((button) => button.textContent.trim());
}

async function showMore(user) {
  await user.click(screen.getByRole("button", { name: /^Show more/ }));
}

describe("ChartTypeSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = { chartType: "line" };
    state.editorModel = null;
    state.schema = { id: "widgets", fields: { Y: { kind: "measure" }, X: { kind: "measure" }, Size: { kind: "measure" } }, subsets: { Counties: ["County"], Regions: ["Region"] } };
  });

  it("renders one flat grid, the only layout", async () => {
    const user = userEvent.setup();
    render(<ChartTypeSection />);
    await showMore(user);
    expect(tileLabels()).toEqual(orderedLabels);
    expect(screen.getByRole("group", { name: "Chart type" })).toHaveClass("grid-cols-2");
  });

  // Owner, 2026-10-12: icon tiles, four shown by default.
  describe("Show more", () => {
    it("shows Line, Bar, Range, and Maps by default", () => {
      render(<ChartTypeSection />);
      expect(tileLabels()).toEqual(visibleLabels);
    });

    it("counts the hidden tiles and toggles them", async () => {
      const user = userEvent.setup();
      render(<ChartTypeSection />);
      const toggle = screen.getByRole("button", { name: `Show more (${orderedLabels.length - 4})` });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await user.click(toggle);
      expect(tileLabels()).toEqual(orderedLabels);
      expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
      await user.click(screen.getByRole("button", { name: "Show less" }));
      expect(tileLabels()).toEqual(visibleLabels);
    });

    it("opens expanded when the selected chart is one of the hidden tiles", () => {
      state.config = { chartType: "pie" };
      render(<ChartTypeSection />);
      expect(tileLabels()).toEqual(orderedLabels);
      expect(screen.getByRole("button", { name: "Pie / Donut" })).toHaveAttribute("aria-pressed", "true");
    });

    it("expands when the selection moves to a hidden tile from elsewhere", () => {
      const { rerender } = render(<ChartTypeSection />);
      expect(tileLabels()).toEqual(visibleLabels);
      state.config = { chartType: "heatmap" };
      rerender(<ChartTypeSection />);
      expect(tileLabels()).toEqual(orderedLabels);
    });

    it("does not remember being expanded", async () => {
      const user = userEvent.setup();
      const { unmount } = render(<ChartTypeSection />);
      await showMore(user);
      unmount();
      render(<ChartTypeSection />);
      expect(tileLabels()).toEqual(visibleLabels);
    });

    it("moves the next available tile up when a top-four tile is unavailable", () => {
      state.schema = { id: "permits", subsets: { Metros: ["Metro"], States: ["State"] } };
      render(<ChartTypeSection />);
      expect(tileLabels()).toEqual(["Line", "Bar", "Range", "Scatter"]);
    });

    it("has no toggle when four or fewer tiles are available", () => {
      state.schema = { id: "widgets", supportedChartTypes: ["line", "pie", "dataTable"] };
      render(<ChartTypeSection />);
      expect(screen.queryByRole("button", { name: /^Show (more|less)/ })).not.toBeInTheDocument();
    });
  });

  describe("tile icons", () => {
    it("draws a decorative icon on every tile, outside the accessible name", async () => {
      const user = userEvent.setup();
      render(<ChartTypeSection />);
      await showMore(user);
      for (const tile of tiles()) {
        const icon = tile.querySelector("svg[data-chart-icon]");
        expect(icon).not.toBeNull();
        expect(icon).toHaveAttribute("aria-hidden", "true");
      }
      expect(screen.getByRole("button", { name: "Range" })).toBeInTheDocument();
    });

    it("gives a registered type with no drawing of its own the fallback icon", async () => {
      const user = userEvent.setup();
      render(<ChartTypeSection />);
      await showMore(user);
      const tile = screen.getByRole("button", { name: "Experimental" });
      expect(tile.querySelector("svg")).toHaveAttribute("data-chart-icon", "fallback");
    });

    // Owner, 2026-10-12: the Maps drawing follows the chosen variant.
    it("draws the Maps tile as the selected map variant", () => {
      const mapsIcon = () => screen.getByRole("button", { name: "Maps" }).querySelector("svg");
      const { unmount } = render(<ChartTypeSection />);
      expect(mapsIcon()).toHaveAttribute("data-chart-icon", "choroplethMap");
      unmount();
      state.config = { chartType: "symbolMap" };
      render(<ChartTypeSection />);
      expect(mapsIcon()).toHaveAttribute("data-chart-icon", "symbolMap");
    });
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

  it("appends a registered type missing from the design order", async () => {
    const user = userEvent.setup();
    render(<ChartTypeSection />);
    await showMore(user);
    expect(screen.getByRole("button", { name: "Experimental" })).toBeInTheDocument();
  });

  it("does not append the hidden, retired Diverging Bar as a stray tile (Workstream B)", async () => {
    const user = userEvent.setup();
    render(<ChartTypeSection />);
    await showMore(user);
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
    expect(tileLabels()).toEqual(["Line", "Pie / Donut", "Data Table"]);
  });

  // Workstream D: a map tile on a module with no county geometry could only
  // ever fail at the data layer — Building Permits offers Metros, Regions and
  // States, none of which we hold shapes or derived points for.
  it("drops the Maps tile on a module with no level we hold geometry for", async () => {
    const user = userEvent.setup();
    state.schema = { id: "permits", subsets: { Metros: ["Metro"], States: ["State"] } };
    render(<ChartTypeSection />);
    await showMore(user);
    expect(tileLabels()).not.toContain("Maps");
    expect(tileLabels()).toContain("Line");
  });

  it("keeps the Maps tile on a module that has a Counties level", () => {
    render(<ChartTypeSection />);
    expect(tileLabels()).toContain("Maps");
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
        // The tile is in the grid (opened, since Scatter sits past the first
        // four); the Variant control also has a Scatter button.
        const tile = [...container.querySelectorAll(".grid-cols-2 > button")].find((button) => button.textContent === "Scatter");
        expect(tile).toHaveAttribute("aria-pressed", "true");
        unmount();
      }
    });

    it("opens on the first variant the surface can draw", async () => {
      const user = userEvent.setup();
      const { unmount } = render(<ChartTypeSection />);
      await showMore(user);
      await user.click(screen.getByRole("button", { name: "Scatter" }));
      expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_CHART_TYPE", chartType: "scatter" });
      unmount();

      state.dispatch.mockClear();
      state.editorModel = { chartChoices: moduleChoices };
      render(<ChartTypeSection />);
      await showMore(user);
      await user.click(screen.getByRole("button", { name: "Scatter" }));
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

import { fixtureTable as datasetFixture, importInline as datasetImport } from "@/tests/fixtures/byod-shapes/helpers";
it("orders the extra tiles by the ranking for pasted data", async () => {
  const user = userEvent.setup();
  state.schema = { id: "byod", inlineOnly: true, fields: {}, subsets: {} };
  state.editorModel = null;
  state.config = datasetImport(await datasetFixture("two-labels-grid"));
  render(<ChartTypeSection />);
  // The import opens on Heatmap, a hidden tile, so the grid is already open
  // (the selected tile is never hidden); expand only if it is not.
  if (screen.queryByRole("button", { name: /^Show more/ })) await showMore(user);
  const labels = tileLabels();
  // A complete grid makes Heatmap the best extra chart, ahead of Scatter's
  // sparse-grid alternative and Pie. The first four curated tiles stay put.
  expect(labels.indexOf("Matrix Heatmap")).toBeGreaterThanOrEqual(0);
  expect(labels.indexOf("Matrix Heatmap")).toBeLessThan(labels.indexOf("Scatter"));
  expect(labels.indexOf("Matrix Heatmap")).toBeLessThan(labels.indexOf("Pie / Donut"));
});
