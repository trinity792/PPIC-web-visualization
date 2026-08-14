/** Phase 8 labels retain derived placeholders without the tooltip power field. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn(), config: null, schema: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import LabelsSection from "@/components/chart-builder/sections/LabelsSection";

describe("LabelsSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = {
      chartType: "line",
      bindings: { x: "Year", y: "Value", series: "Location" },
      period: { startYear: 2020, endYear: 2025 },
      filters: { subset: "Counties" },
      transform: "actual",
      labels: {},
    };
    state.schema = {
      label: "Widgets",
      fields: {
        Year: { kind: "temporal", label: "Year" },
        Location: { kind: "dimension", label: "Location" },
        Value: { kind: "measure", label: "Widget value" },
      },
    };
  });

  it("uses derived labels as placeholders and dispatches typed overrides", () => {
    render(<LabelsSection />);
    for (const name of ["Title", "Subtitle", "X-Axis Label", "Y-Axis Label"]) {
      const input = screen.getByLabelText(new RegExp(`^${name}$`, "i"));
      expect(input).toHaveAttribute("placeholder");
      expect(input.getAttribute("placeholder")).not.toBe("");
    }
    const title = screen.getByLabelText(/^Title$/i);
    fireEvent.change(title, { target: { value: "Custom title" } });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_LABEL",
      key: "title",
      value: "Custom title",
    });
  });

  it("renders Legend as a toggle with no legend-title text field", () => {
    render(<LabelsSection />);
    expect(screen.getAllByLabelText(/^Title$/i)).toHaveLength(1);
    expect(screen.getByRole("switch", { name: "Legend" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Legend Title$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tooltip template/i)).not.toBeInTheDocument();

    const labels = screen.getAllByRole("textbox").map((input) =>
      document.querySelector(`label[for="${input.id}"]`)?.textContent,
    );
    expect(labels).toEqual([
      "Title",
      "Subtitle",
      "X-Axis Label",
      "Y-Axis Label",
    ]);
  });

  it("toggles every label class independently", () => {
    state.config.appearance = {};
    render(<LabelsSection />);

    for (const name of [
      "Show title",
      "Show subtitle",
      "Show X-axis label",
      "Show Y-axis label",
      "Legend",
    ]) {
      expect(screen.getByLabelText(name)).toBeChecked();
    }

    fireEvent.click(screen.getByLabelText("Show X-axis label"));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "showXAxisLabel",
      value: false,
    });
    expect(state.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "showYAxisLabel" }),
    );
  });

  it("disables only the hidden label input", () => {
    state.config.appearance = { showTitle: false };
    render(<LabelsSection />);

    expect(screen.getByLabelText(/^Title$/i)).toBeDisabled();
    expect(screen.getByLabelText(/^Subtitle$/i)).toBeEnabled();
    expect(screen.getByLabelText(/^X-Axis Label$/i)).toBeEnabled();
  });

  it("restores a legacy hidden legend to the right when shown", () => {
    state.config.appearance = { legendPosition: "hidden" };
    render(<LabelsSection />);

    fireEvent.click(screen.getByLabelText("Legend"));
    expect(state.dispatch).toHaveBeenNthCalledWith(1, {
      type: "SET_APPEARANCE",
      key: "legendPosition",
      value: "right",
    });
    expect(state.dispatch).toHaveBeenNthCalledWith(2, {
      type: "SET_APPEARANCE",
      key: "showLegend",
      value: true,
    });
  });
});
