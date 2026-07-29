/** Standalone/non-geographic category controls retained by the overhaul. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const categories = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
];

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
  schema: null,
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import CategoriesSection from "@/components/chart-builder/sections/CategoriesSection";

function baseConfig(overrides = {}) {
  return {
    chartType: "pie",
    filters: { topN: 6 },
    appearance: {
      sort: "value",
      categoryOrder: [],
      hiddenCategories: [],
    },
    categoryNames: categories,
    ...overrides,
  };
}

describe("CategoriesSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = baseConfig();
    state.schema = {
      id: "bring-your-own-data",
      apiPath: null,
      subsets: {},
      fields: {},
    };
  });

  it("is a collapsed disclosure for non-geographic categories", async () => {
    const user = userEvent.setup();
    render(<CategoriesSection />);

    const disclosure = screen.getByRole("button", { name: /categories/i });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("retains category visibility controls for standalone data", async () => {
    const user = userEvent.setup();
    render(<CategoriesSection />);
    await user.click(screen.getByRole("button", { name: /categories/i }));
    await user.click(screen.getByRole("switch", { name: "Show Bravo" }));

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "hiddenCategories",
      value: ["Bravo"],
    });
  });

  it("retains the five-row reveal behavior from the standalone comparison panel", async () => {
    const user = userEvent.setup();
    render(<CategoriesSection />);
    await user.click(screen.getByRole("button", { name: /categories/i }));

    expect(screen.getByText("Echo")).toBeInTheDocument();
    expect(screen.queryByText("Foxtrot")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more (3)" }));
    expect(screen.getByText("Hotel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("retains keyboard category reordering for standalone data", async () => {
    const user = userEvent.setup();
    render(<CategoriesSection />);
    await user.click(screen.getByRole("button", { name: /categories/i }));

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: /drag to reorder Bravo.*arrow keys/i,
      }),
      { key: "ArrowUp" },
    );

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "categoryOrder",
      value: ["Bravo", "Alpha", ...categories.slice(2)],
    });
  });

  it("retains pointer category reordering for standalone data", async () => {
    const user = userEvent.setup();
    render(<CategoriesSection />);
    await user.click(screen.getByRole("button", { name: /categories/i }));

    const bravoRow = screen.getByText("Bravo").closest('[draggable="true"]');
    const alphaRow = screen.getByText("Alpha").closest('[draggable="true"]');
    const dataTransfer = {
      effectAllowed: "none",
      setData: vi.fn(),
      getData: vi.fn(() => "Bravo"),
    };
    fireEvent.dragStart(bravoRow, { dataTransfer });
    fireEvent.dragOver(alphaRow, { dataTransfer });
    fireEvent.drop(alphaRow, { dataTransfer });

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "categoryOrder",
      value: ["Bravo", "Alpha", ...categories.slice(2)],
    });
  });

  it.each([
    "heatmap",
    "dumbbell",
    "dotPlot",
    "forest",
    "scatter",
    "bubble",
    "pie",
  ])("retains Top/Bottom N for standalone %s charts", async (chartType) => {
    const user = userEvent.setup();
    state.config = baseConfig({ chartType });
    render(<CategoriesSection />);
    await user.click(screen.getByRole("button", { name: /categories/i }));
    await user.click(screen.getByRole("radio", { name: /bottom/i }));

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_RANKING",
      topN: 6,
      sort: "ascending",
    });
  });
});
