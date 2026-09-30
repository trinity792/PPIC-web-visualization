import React from "react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn(), config: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import PalettePicker from "@/components/chart-builder/PalettePicker";

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

it("does not show the per-series rename, hide, and color list in a version 3 view", () => {
  state.config = { version: 3, question: { comparisons: [] }, presentation: { chartType: "line", appearance: {} } };
  render(<PalettePicker seriesNames={["California"]} />);
  expect(screen.getByLabelText(/color palette/i)).toBeInTheDocument();
  expect(screen.queryByLabelText("Legend label for California")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choose a color for California" })).not.toBeInTheDocument();
  expect(screen.queryByText("Legend items")).not.toBeInTheDocument();
});
