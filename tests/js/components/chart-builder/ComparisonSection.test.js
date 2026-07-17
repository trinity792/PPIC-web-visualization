/**
 * Tests for ComparisonSection.js — ranked Top/Bottom N controls and the
 * Advanced per-category visibility/order manager.
 */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ComparisonSection from "@/components/chart-builder/ComparisonSection";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: state.config,
    dispatch: state.dispatch,
    schema: {
      fields: {
        Value: { kind: "measure", transforms: ["actual"] },
      },
    },
  }),
}));

function rankedConfig(overrides = {}) {
  return {
    chartType: "bar",
    bindings: { category: "Category", y: "Value" },
    filters: { topN: 6, benchmark: "" },
    period: {},
    transform: "actual",
    tier: "advanced",
    categoryNames: ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"],
    appearance: {
      sort: "value",
      categoryOrder: [],
      hiddenCategories: [],
    },
    ...overrides,
  };
}

describe("ComparisonSection ranked values", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = rankedConfig();
  });

  it("offers Top/Bottom N controls for ranked charts", () => {
    render(<ComparisonSection />);

    expect(screen.getByText("Top values")).toBeInTheDocument();
    expect(screen.getByLabelText("Number of values")).toHaveValue(6);
  });

  it("offers ranked values for line charts", () => {
    state.config = rankedConfig({ chartType: "line" });
    render(<ComparisonSection />);

    expect(screen.getByText("Ranked values")).toBeInTheDocument();
    expect(screen.getByText("Choose and order values")).toBeInTheDocument();
  });

  it.each([
    "heatmap",
    "dumbbell",
    "dotPlot",
    "forest",
    "scatter",
    "bubble",
    "slope",
    "pie",
  ])("offers Top/Bottom N for applicable %s charts", (chartType) => {
    state.config = rankedConfig({ chartType });
    render(<ComparisonSection />);

    expect(screen.getByText("Ranked values")).toBeInTheDocument();
    expect(screen.getByLabelText("Number of values")).toBeInTheDocument();
  });

  it("updates the requested N while preserving the ranking direction", () => {
    render(<ComparisonSection />);

    fireEvent.change(screen.getByLabelText("Number of values"), {
      target: { value: "3" },
    });

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_RANKING",
      topN: 3,
      sort: "value",
    });
  });

  it("collapses category choices to five and reveals the remainder", async () => {
    const user = userEvent.setup();
    render(<ComparisonSection />);

    expect(screen.getByText("Echo")).toBeInTheDocument();
    expect(screen.queryByText("Foxtrot")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more (1)" }));

    expect(screen.getByText("Foxtrot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("toggles an individual value", async () => {
    const user = userEvent.setup();
    render(<ComparisonSection />);

    await user.click(screen.getByRole("switch", { name: "Show Bravo" }));

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "hiddenCategories",
      value: ["Bravo"],
    });
  });

  it("supports keyboard reordering on the drag handle", () => {
    render(<ComparisonSection />);

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Drag to reorder Bravo. Use arrow keys to move it.",
      }),
      { key: "ArrowUp" },
    );

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "categoryOrder",
      value: ["Bravo", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"],
    });
  });

  it("reorders values through drag and drop", () => {
    render(<ComparisonSection />);
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
      value: ["Bravo", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"],
    });
  });

  it("hides individual controls below the Advanced tier", () => {
    state.config = rankedConfig({ tier: "moderate" });
    render(<ComparisonSection />);

    expect(screen.queryByText("Choose and order values")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Number of values")).toBeInTheDocument();
  });
});
