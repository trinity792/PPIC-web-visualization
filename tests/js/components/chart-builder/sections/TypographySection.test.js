/** Phase 8 typography split and numeric bounds. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: { appearance: {} },
  schema: { fields: {} },
}));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import TypographySection from "@/components/chart-builder/sections/TypographySection";

const fields = [
  ["Title Size", "titleFontSize"],
  ["Subtitle Size", "subtitleFontSize"],
  ["Axis Label Size", "axisFontSize"],
  ["Legend Text Size", "legendFontSize"],
  ["Data Label Size", "dataLabelFontSize"],
  ["Decimal Places", "decimalPlaces"],
];

describe("TypographySection", () => {
  beforeEach(() => state.dispatch.mockClear());

  it("renders every typography field and dispatches SET_APPEARANCE", () => {
    render(<TypographySection />);
    for (const [label, key] of fields) {
      const input = screen.getByLabelText(new RegExp(`^${label}$`, "i"));
      expect(input).toHaveAttribute("type", "number");
      fireEvent.change(input, { target: { value: "16" } });
      expect(state.dispatch).toHaveBeenCalledWith({
        type: "SET_APPEARANCE",
        key,
        value: key === "decimalPlaces" ? 6 : 16,
      });
    }
  });

  it("clamps Decimal Places to the inclusive 0-6 range", () => {
    render(<TypographySection />);
    const decimals = screen.getByLabelText(/decimal places/i);
    expect(decimals).toHaveAttribute("min", "0");
    expect(decimals).toHaveAttribute("max", "6");
    fireEvent.change(decimals, { target: { value: "-2" } });
    expect(state.dispatch).toHaveBeenLastCalledWith({
      type: "SET_APPEARANCE",
      key: "decimalPlaces",
      value: 0,
    });
    fireEvent.change(decimals, { target: { value: "9" } });
    expect(state.dispatch).toHaveBeenLastCalledWith({
      type: "SET_APPEARANCE",
      key: "decimalPlaces",
      value: 6,
    });
  });
});
