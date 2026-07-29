/** Phase 8 mockup order and chart-conditional appearance controls. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn(), config: null, schema: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";

function config(chartType = "line", appearance = {}) {
  return {
    chartType,
    bindings: {},
    labels: {},
    appearance,
    seriesNames: [],
  };
}

function labelOrder() {
  return [...document.querySelectorAll("label")].map((label) => label.textContent.trim());
}

describe("AppearanceSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = config();
    state.schema = { fields: {} };
  });

  it("starts with palette, legend, both spacing inputs, and footnote in mockup order", () => {
    render(<AppearanceSection />);
    const labels = labelOrder();
    const required = [
      "Color Palette",
      "Legend Position",
      "Horizontal Line Spacing (px)",
      "Vertical Line Spacing (px)",
      "Footnote",
    ];
    const positions = required.map((label) =>
      labels.findIndex((candidate) => candidate.toLowerCase() === label.toLowerCase()),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each([
    ["divergingBar", "Center reference"],
    ["forest", "Interval ends"],
    ["choroplethMap", "Color scale"],
    ["dotPlot", "Show point values"],
  ])("shows %s extras only for that chart and below Footnote", (chartType, extra) => {
    const { unmount } = render(<AppearanceSection />);
    expect(screen.queryByLabelText(new RegExp(extra, "i"))).not.toBeInTheDocument();
    unmount();
    state.config = config(chartType);
    render(<AppearanceSection />);
    const labels = labelOrder();
    expect(screen.getByLabelText(new RegExp(extra, "i"))).toBeInTheDocument();
    expect(labels.indexOf(extra)).toBeGreaterThan(labels.indexOf("Footnote"));
  });

  it("clamps spacing to 0-100 and Auto clears the appearance value", () => {
    state.config = config("line", { horizontalLinePadding: 20 });
    render(<AppearanceSection />);
    fireEvent.change(screen.getByLabelText(/horizontal line spacing/i), {
      target: { value: "150" },
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "horizontalLinePadding",
      value: 100,
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Auto" })[0]);
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "horizontalLinePadding",
      value: undefined,
    });
  });
});
