import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renames an item without changing its original lookup key", () => {
    render(<PalettePicker seriesNames={["California"]} />);

    fireEvent.change(screen.getByLabelText("Legend label for California"), {
      target: { value: "Golden State" },
    });

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_LEGEND_LABEL",
      seriesName: "California",
      label: "Golden State",
    });
  });

  it("shows five items initially and expands the rest", () => {
    render(<PalettePicker seriesNames={LEGEND_ITEMS} />);

    expect(screen.getByLabelText("Legend label for Echo")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Legend label for Foxtrot"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search legend items")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show more (2)" }));

    expect(screen.getByLabelText("Legend label for Foxtrot")).toBeInTheDocument();
    expect(screen.getByLabelText("Legend label for Golf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("searches all items even while the list is collapsed", () => {
    render(<PalettePicker seriesNames={LEGEND_ITEMS} />);

    fireEvent.change(screen.getByLabelText("Search legend items"), {
      target: { value: "golf" },
    });

    expect(screen.getByLabelText("Legend label for Golf")).toBeInTheDocument();
    expect(screen.queryByLabelText("Legend label for Alpha")).not.toBeInTheDocument();
  });

  it("keeps short lists fully visible without overflow controls", () => {
    render(<PalettePicker seriesNames={LEGEND_ITEMS.slice(0, 5)} />);

    expect(screen.getAllByLabelText(/Legend label for/)).toHaveLength(5);
    expect(screen.queryByLabelText("Search legend items")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument();
  });
});
