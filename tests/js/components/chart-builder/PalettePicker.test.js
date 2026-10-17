import React from "react";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn(), config: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import PalettePicker from "@/components/chart-builder/PalettePicker";
import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";

const LEGEND_ITEMS = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
];

describe("PalettePicker legend items", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = { appearance: {} };
  });

  // Renderer plan C replaces the retired list/rename/search behavior.
  it.each([[], ["California"], LEGEND_ITEMS].map(names => [names]))("keeps palette selection without the per-series list: %j", names => {
    render(<PalettePicker seriesNames={names} />);
    expect(screen.getByLabelText(/color palette/i)).toBeInTheDocument();
    expect(screen.queryByText("Legend items")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search legend items")).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText(/Legend label for/)).toHaveLength(0);
  });

  it("names the automatic v3 palette from the rendered series count", () => {
    state.config = {
      version: 3,
      presentation: { appearance: {} },
      seriesCount: 3,
    };
    render(<PalettePicker seriesNames={["2020", "2025", "2030"]} />);

    expect(screen.getByRole("combobox", { name: /color palette/i })).toHaveTextContent(
      "Automatic PPIC categorical · 3 groups",
    );
  });
});

describe("official palette choices", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = { version: 3, presentation: { chartType: "line", appearance: {} } };
  });

  it.each([
    ["categorical", "PPIC official two-group", "Colorblind-safe"],
    ["sequential", "Green · sequential", "Sequential (blues)"],
    ["diverging", "PPIC official diverging (choropleth)", "Diverging (red-blue)"],
  ])("offers only official %s palettes in standard mode", async (kind, official, other) => {
    const user = userEvent.setup();
    render(<AdvancedModeProvider><PalettePicker kind={kind} /></AdvancedModeProvider>);
    await user.click(screen.getByRole("combobox", { name: /color palette/i }));
    expect(screen.getByRole("option", { name: official, exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: other, exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Other palettes" })).not.toBeInTheDocument();
    if (kind === "categorical") {
      expect(screen.queryByRole("option", { name: "Brand (categorical)" })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Orange · Brand" })).not.toBeInTheDocument();
    }
  });

  it.each(["categorical", "sequential", "diverging"])("places other %s palettes below official palettes in Advanced Mode", async (kind) => {
    const user = userEvent.setup();
    render(<AdvancedModeProvider defaultAdvanced><PalettePicker kind={kind} /></AdvancedModeProvider>);
    await user.click(screen.getByRole("combobox", { name: /color palette/i }));
    const official = screen.getByRole("group", { name: "Official PPIC palettes" });
    const other = screen.getByRole("group", { name: "Other palettes" });
    expect(official.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(official).getAllByRole("option").length).toBeGreaterThan(0);
    expect(within(other).getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("preserves a saved Advanced palette while standard mode offers official replacements", async () => {
    const user = userEvent.setup();
    state.config.presentation.appearance.palette = "colorblind-safe";
    render(<AdvancedModeProvider><PalettePicker /></AdvancedModeProvider>);
    expect(screen.getByRole("combobox", { name: /color palette/i })).toHaveTextContent("Colorblind-safe");
    await user.click(screen.getByRole("combobox", { name: /color palette/i }));
    expect(screen.queryByRole("option", { name: "Colorblind-safe" })).not.toBeInTheDocument();
    expect(state.dispatch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: "PPIC official two-group" }));
    expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_PALETTE", palette: "ppic-official-two-group" });
  });
});

it("does not show the per-series rename, hide, and color list in a version 3 view", () => {
  state.config = { version: 3, question: { comparisons: [] }, presentation: { chartType: "line", appearance: {} } };
  render(<PalettePicker seriesNames={["California"]} />);
  expect(screen.getByLabelText(/color palette/i)).toBeInTheDocument();
  expect(screen.queryByLabelText("Legend label for California")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choose a color for California" })).not.toBeInTheDocument();
  expect(screen.queryByText("Legend items")).not.toBeInTheDocument();
});
