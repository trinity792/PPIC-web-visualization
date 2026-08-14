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
    expect(screen.getByText("Transform", { selector: "span" })).toBeInTheDocument();
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

  describe("imported data (bring-your-own-data)", () => {
    const byodSchema = { id: "byod", inlineOnly: true, fields: {}, yearRange: [1990, 2026] };
    const table = {
      columns: [
        { name: "County", type: "text" },
        // Date-typed, as a line chart's temporal x role requires.
        { name: "Year", type: "date" },
        { name: "Population", type: "number" },
      ],
      rows: [
        ["Fresno", "2020", "100"],
        ["Fresno", "2021", "110"],
        ["Kern", "2020", "90"],
        ["Kern", "2021", "95"],
      ],
    };
    const inlineConfig = (overrides = {}) =>
      config({
        bindings: { x: "Year", y: "Population", series: "County" },
        data: { source: "inline", inline: table },
        period: {},
        ...overrides,
      });

    beforeEach(() => {
      state.schema = byodSchema;
      state.config = inlineConfig();
    });

    it("offers absolute values or index-to-100, and no module-only transforms", () => {
      render(<TransformSection />);
      expect(screen.getAllByRole("radio")).toHaveLength(2);
      expect(screen.getByRole("radio", { name: /absolute values/i })).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /index to 100 at base period/i }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: /change/i })).not.toBeInTheDocument();
    });

    it("draws base periods from the imported column, not the schema year range", async () => {
      const user = userEvent.setup();
      state.config = inlineConfig({ transform: "indexed" });
      render(<TransformSection />);

      await user.click(screen.getByLabelText("Base period"));
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
        "2020",
        "2021",
      ]);
      await user.click(screen.getByRole("option", { name: "2021" }));
      expect(state.dispatch).toHaveBeenCalledWith({
        type: "SET_PERIOD",
        key: "baseYear",
        value: 2021,
      });
    });

    it("offers no benchmark label, which only a module series can supply", () => {
      render(<TransformSection />);
      expect(screen.queryByLabelText(/benchmark/i)).not.toBeInTheDocument();
    });

    it("renders nothing on a chart with no time axis to index against", () => {
      state.config = inlineConfig({
        chartType: "bar",
        bindings: { category: "County", y: "Population" },
      });
      const { container } = render(<TransformSection />);
      expect(container).toBeEmptyDOMElement();
    });

    it("reports controls only when the table holds more than one period", () => {
      expect(hasTransformControls(inlineConfig(), byodSchema)).toBe(true);
      const single = { ...table, rows: [["Fresno", "2020", "100"]] };
      expect(
        hasTransformControls(
          inlineConfig({ data: { source: "inline", inline: single } }),
          byodSchema,
        ),
      ).toBe(false);
    });
  });

  describe("hasTransformControls", () => {
    it("reports nothing to render for chart types that cannot transform", () => {
      expect(hasTransformControls(config({ chartType: "scatter" }), schema)).toBe(false);
      expect(hasTransformControls(config({ chartType: "pie" }), schema)).toBe(false);
      expect(hasTransformControls(config({ chartType: "dumbbell" }), schema)).toBe(false);
    });

    it("hides the Transform setting for a single-transform measure with no stratification", () => {
      const single = { ...schema, fields: { Stock: { kind: "measure", transforms: ["actual"] } } };
      expect(hasTransformControls(config({ chartType: "choroplethMap" }), single)).toBe(
        false,
      );
      expect(hasTransformControls(config(), single)).toBe(false);
    });

    it("keeps the inherited controls when filterDimensions exist", () => {
      const stratified = {
        ...schema,
        fields: { Stock: { kind: "measure", transforms: ["actual"] } },
        filterDimensions: [
          { column: "Sex", label: "Sex", values: ["All"], default: "All" },
        ],
      };
      expect(hasTransformControls(config(), stratified)).toBe(true);
      expect(hasTransformControls(config({ chartType: "scatter" }), stratified)).toBe(true);
    });

    it("reports controls whenever the measure offers a real choice", () => {
      expect(hasTransformControls(config({ chartType: "choroplethMap" }), schema)).toBe(
        true,
      );
      expect(hasTransformControls(config(), schema)).toBe(true);
    });
  });

  it("offers no benchmark label input", () => {
    for (const chartType of ["line", "dumbbell", "forest"]) {
      state.config = config({ chartType });
      const view = render(<TransformSection />);
      expect(screen.queryByLabelText(/benchmark label/i)).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
