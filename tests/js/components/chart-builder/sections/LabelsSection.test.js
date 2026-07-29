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
    for (const name of ["Title", "Subtitle", "X-Axis Label", "Y-Axis Label", "Legend Title"]) {
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

  it("renders one Legend Title and never a duplicate Title field", () => {
    render(<LabelsSection />);
    expect(screen.getAllByLabelText(/^Title$/i)).toHaveLength(1);
    expect(screen.getByLabelText(/^Legend Title$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/tooltip template/i)).not.toBeInTheDocument();

    const labels = screen.getAllByRole("textbox").map((input) =>
      document.querySelector(`label[for="${input.id}"]`)?.textContent,
    );
    expect(labels).toEqual([
      "Title",
      "Subtitle",
      "X-Axis Label",
      "Y-Axis Label",
      "Legend Title",
    ]);
  });
});
