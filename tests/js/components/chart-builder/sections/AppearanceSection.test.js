/** Phase 8 mockup order and chart-conditional appearance controls. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn(), config: null, schema: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";

function config(chartType = "line", appearance = {}) {
  return {
    chartType,
    data: { source: "module" },
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
    state.schema = {
      inlineOnly: false,
      fields: {
        Region: { kind: "dimension", label: "Region" },
        Value: {
          kind: "measure",
          label: "Value",
          chartRoles: ["color"],
        },
      },
    };
  });

  it("starts with Color, palette, legend, both spacing inputs, and footnote in order", () => {
    render(<AppearanceSection />);
    const labels = labelOrder();
    const required = [
      "Color",
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

  it.each(["line", "bar", "scatter", "bubble"])(
    "shows the %s Color binding in Appearance",
    (chartType) => {
      state.config = config(chartType);
      render(<AppearanceSection />);
      expect(screen.getByLabelText(/^Color$/i)).toBeInTheDocument();
    },
  );

  it("does not move other chart types' Color bindings into Appearance", () => {
    state.config = config("pie");
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/^Color$/i)).not.toBeInTheDocument();
  });

  it("keeps Color's field filtering and binding dispatch behavior", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    await user.click(screen.getByLabelText(/^Color$/i));
    expect(screen.getByRole("option", { name: "Region" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Value" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Region" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_BINDING",
      role: "color",
      field: "Region",
    });
  });

  it("no longer offers Orientation — it moved to OutcomeSection (Workstream A)", () => {
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
    state.config = config("bar");
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
    state.config = config("divergingBar");
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
  });

  it.each([
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

  it("shows Center reference for a bar with appearance.diverging on, below Footnote (Workstream B)", () => {
    const { unmount } = render(<AppearanceSection />);
    expect(screen.queryByLabelText(/Center reference/i)).not.toBeInTheDocument();
    unmount();
    state.config = config("bar", { diverging: true });
    render(<AppearanceSection />);
    const labels = labelOrder();
    expect(screen.getByLabelText(/Center reference/i)).toBeInTheDocument();
    expect(labels.indexOf("Center reference")).toBeGreaterThan(labels.indexOf("Footnote"));
  });

  it("hides Center reference for a plain bar (diverging off)", () => {
    state.config = config("bar", { diverging: false });
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/Center reference/i)).not.toBeInTheDocument();
  });

  it("still shows Center reference for the legacy divergingBar id, ahead of normalizeSpec's migration", () => {
    state.config = config("divergingBar");
    render(<AppearanceSection />);
    expect(screen.getByLabelText(/Center reference/i)).toBeInTheDocument();
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
