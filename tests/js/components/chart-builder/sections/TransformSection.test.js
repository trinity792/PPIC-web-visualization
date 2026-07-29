/** Phase 8 transform radio and base-year guardrail contract. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn(), config: null, schema: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import TransformSection, {
  hasTransformControls,
} from "@/components/chart-builder/sections/TransformSection";

const schema = {
  id: "widgets",
  yearRange: [2020, 2025],
  fields: {
    Stock: {
      kind: "measure",
      label: "Stock",
      unit: "count",
      transforms: ["actual", "indexed", "numericChange", "percentChange"],
    },
    Rate: {
      kind: "measure",
      label: "Rate",
      unit: "percent",
      transforms: ["actual", "percentagePointChange"],
    },
  },
};

function config(overrides = {}) {
  return {
    chartType: "line",
    bindings: { y: "Stock" },
    period: { baseYear: 2020 },
    transform: "actual",
    filters: {},
    ...overrides,
  };
}

describe("TransformSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.schema = schema;
    state.config = config();
  });

  it("renders four allowed stock transforms and only two rate transforms", () => {
    const { unmount } = render(<TransformSection />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    unmount();
    state.config = config({ bindings: { y: "Rate" } });
    render(<TransformSection />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /actual value/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /percentage[- ]point change/i })).toBeInTheDocument();
  });

  it("reveals and dispatches base year only for indexed values", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TransformSection />);
    // Exact label: /base year/i would also match the "Index to Base Year" radio.
    expect(screen.queryByLabelText("Base year")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /index to base year/i }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_TRANSFORM",
      transform: "indexed",
    });

    state.config = config({ transform: "indexed" });
    rerender(<TransformSection />);
    await user.click(screen.getByLabelText("Base year"));
    await user.click(screen.getByRole("option", { name: "2024" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_PERIOD",
      key: "baseYear",
      value: 2024,
    });
  });

  it("bounds base-year choices to schema.yearRange", async () => {
    const user = userEvent.setup();
    state.config = config({ transform: "indexed" });
    render(<TransformSection />);
    await user.click(screen.getByLabelText("Base year"));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "2020",
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
    ]);
  });

  it("does not render for a chart descriptor that is not transform-capable", () => {
    state.config = config({ chartType: "scatter" });
    const { container } = render(<TransformSection />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("stratification pins", () => {
    const stratified = {
      ...schema,
      filterDimensions: [
        {
          column: "Sex",
          label: "Sex",
          values: ["Male", "Female", "Both Sexes"],
          default: "Both Sexes",
        },
      ],
    };

    it("uses schema defaults and dispatches the canonical column", async () => {
      const user = userEvent.setup();
      state.schema = stratified;
      state.config = config({ filters: { Sex: "Both Sexes" } });
      render(<TransformSection />);

      const sex = screen.getByRole("combobox", { name: "Sex" });
      expect(sex).toHaveTextContent("Both Sexes");
      await user.click(sex);
      await user.click(screen.getByRole("option", { name: "Female" }));
      expect(state.dispatch).toHaveBeenCalledWith({
        type: "SET_FILTER",
        key: "Sex",
        value: "Female",
      });
    });

    it("survives a chart type that can express no transform", () => {
      // Pinning renters or a single sex is a statement about rows, not about the
      // chart, so a scatter keeps the pins and loses only the radios.
      state.schema = stratified;
      state.config = config({ chartType: "scatter" });
      render(<TransformSection />);

      expect(screen.getByRole("combobox", { name: "Sex" })).toBeInTheDocument();
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
    });
  });

  describe("hasTransformControls", () => {
    it("reports nothing to render for chart types that cannot transform", () => {
      expect(hasTransformControls(config({ chartType: "scatter" }), schema)).toBe(false);
      expect(hasTransformControls(config({ chartType: "pie" }), schema)).toBe(false);
      expect(hasTransformControls(config({ chartType: "dumbbell" }), schema)).toBe(false);
    });

    it("reports nothing to render when a single transform is allowed and no benchmark", () => {
      const single = { ...schema, fields: { Stock: { kind: "measure", transforms: ["actual"] } } };
      expect(hasTransformControls(config({ chartType: "choroplethMap" }), single)).toBe(
        false,
      );
      // A line chart takes a benchmark label, so it keeps the section even
      // with one transform.
      expect(hasTransformControls(config(), single)).toBe(true);
    });

    it("reports controls whenever the measure offers a real choice", () => {
      expect(hasTransformControls(config({ chartType: "choroplethMap" }), schema)).toBe(
        true,
      );
      expect(hasTransformControls(config(), schema)).toBe(true);
    });
  });
});
