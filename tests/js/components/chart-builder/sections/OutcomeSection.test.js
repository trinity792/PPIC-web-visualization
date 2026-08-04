/**
 * Phase 7 field-binding and tabbing contract, extended by Workstream A (the
 * Outcome reframe): an implied role renders as a hint sentence rather than a
 * dropdown, the measure role reads "Outcome" for chart types that imply
 * anything, and bar/diverging bar's orientation toggle lives here now. Also
 * covers Workstream B's Diverging bars switch, which lives beside it.
 */

import React from "react";

import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
  schema: null,
}));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import OutcomeSection from "@/components/chart-builder/sections/OutcomeSection";
import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import { BYOD_SCHEMA } from "@/lib/visualization/moduleRegistry";

function render(ui, options) {
  return rtlRender(
    <AdvancedModeProvider defaultAdvanced={false}>{ui}</AdvancedModeProvider>,
    options,
  );
}

const schema = {
  id: "widgets",
  inlineOnly: false,
  subsets: { Counties: ["County"] },
  filterDimensions: [],
  fields: {
    Year: { kind: "temporal", label: "Year" },
    Location: { kind: "dimension", label: "Location", cardinality: "high" },
    Region: {
      kind: "dimension",
      label: "Region",
      values: ["North", "South"],
      isGroup: true,
    },
    Source: { kind: "dimension", label: "Source", values: ["DoF", "Census"] },
    Value: {
      kind: "measure",
      label: "Value",
      chartRoles: ["yMeasure", "color", "size", "xMeasure"],
      transforms: ["actual"],
    },
    Restricted: {
      kind: "measure",
      label: "Restricted metric",
      chartRoles: ["color"],
      transforms: ["actual"],
    },
    Lower: { kind: "measure", label: "Lower", chartRoles: ["yMeasure"] },
    Upper: { kind: "measure", label: "Upper", chartRoles: ["yMeasure"] },
  },
};

function lineConfig(overrides = {}) {
  return {
    chartType: "line",
    preset: "trend-over-time",
    data: { source: "module" },
    bindings: { x: "Year", y: "Value", series: "Location" },
    filters: { tabColumn: null, tabValue: null, tabOrder: [] },
    tabOptions: [],
    appearance: {},
    // The store always seeds `layers`, and LayerEditor reads it unguarded.
    layers: [],
    ...overrides,
  };
}

function barConfig(overrides = {}) {
  return {
    chartType: "bar",
    preset: "compare-places",
    data: { source: "module" },
    bindings: { y: "Value" },
    filters: { tabColumn: null, tabValue: null, tabOrder: [], subset: "Counties" },
    tabOptions: [],
    appearance: {},
    layers: [],
    ...overrides,
  };
}

describe("OutcomeSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.schema = schema;
    state.config = lineConfig();
  });

  it("hides the implied X-Axis for a line and labels the measure Outcome", () => {
    render(<OutcomeSection />);
    expect(screen.queryByLabelText("X-Axis")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Outcome/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Series/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Color/i)).not.toBeInTheDocument();
  });

  it.each(["line", "bar", "scatter", "bubble"])(
    "moves the %s Color binding out of Outcome",
    (chartType) => {
      state.config =
        chartType === "bar" ? barConfig() : lineConfig({ chartType, preset: null });
      render(<OutcomeSection />);
      expect(screen.queryByLabelText(/^Color/i)).not.toBeInTheDocument();
    },
  );

  /**
   * "Color" named two unrelated questions. Where a chart type constrains the
   * role to a measure, the colour *is* the plotted value and the dropdown now
   * reads Outcome; where it constrains it to a dimension, the four chart types
   * that offer it render it in Appearance. Nothing is left saying "Color" here.
   */
  describe("the color role", () => {
    it("reads Outcome where the chart type colours by a measure", () => {
      state.config = lineConfig({
        chartType: "choroplethMap",
        preset: null,
        bindings: { geography: "Location", color: "Value" },
      });
      render(<OutcomeSection />);
      expect(screen.getByLabelText(/^Outcome/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Color/i)).not.toBeInTheDocument();
    });

    it("reads Outcome on a heatmap too, alongside its two real axes", () => {
      state.config = lineConfig({
        chartType: "heatmap",
        preset: null,
        bindings: { x: "Year", y: "Location", color: "Value" },
      });
      render(<OutcomeSection />);
      expect(screen.getByLabelText(/^Outcome/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^X-Axis/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Y-Axis/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Color/i)).not.toBeInTheDocument();
    });

    it("offers no color dropdown on a pie, whose slices colour themselves", () => {
      state.config = lineConfig({
        chartType: "pie",
        preset: null,
        bindings: { category: "Region", y: "Value" },
      });
      render(<OutcomeSection />);
      expect(screen.queryByLabelText(/^Color/i)).not.toBeInTheDocument();
    });

    it("offers no color dropdown on a symbol map, whose markers share one colour", () => {
      state.config = lineConfig({
        chartType: "symbolMap",
        preset: null,
        bindings: { geography: "Location", size: "Value" },
      });
      render(<OutcomeSection />);
      expect(screen.queryByLabelText(/^Color/i)).not.toBeInTheDocument();
    });
  });

  it("asks a symbol map for a Bubble value, not a Bubble size", () => {
    state.config = lineConfig({
      chartType: "symbolMap",
      preset: null,
      bindings: { geography: "Location", size: "Value" },
    });
    render(<OutcomeSection />);
    expect(screen.getByLabelText(/^Bubble value/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Bubble size/i)).not.toBeInTheDocument();
  });

  it("leaves a bubble chart asking for Bubble size, where size is a real choice", () => {
    state.config = lineConfig({
      chartType: "bubble",
      preset: null,
      bindings: { x: "Value", y: "Value", size: "Value", unit: "Location" },
    });
    render(<OutcomeSection />);
    expect(screen.getByLabelText(/^Bubble size/i)).toBeInTheDocument();
  });

  it("renders the implied X-Axis hint naming Date Range, not a dropdown", () => {
    render(<OutcomeSection />);
    expect(screen.getByText(/Plotted against Year, set in Date Range/i)).toBeInTheDocument();
  });

  it("hides the implied Category for a bar and renders its Geographic Level hint", () => {
    state.config = barConfig();
    render(<OutcomeSection />);
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(
      screen.getByText(/One bar per location in Counties, set in Geographic Level/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Outcome/)).toBeInTheDocument();
  });

  it("renders forest-specific role labels (no implied roles on forest)", () => {
    state.config = lineConfig({
      chartType: "forest",
      preset: null,
      bindings: { category: "Location", start: "Lower", end: "Upper" },
    });
    render(<OutcomeSection />);
    // Exact labels, asterisks included: "Study" alone also matches the optional
    // "Study weight", and the trailing * is how a required role is marked.
    for (const label of [
      "Study*",
      "CI lower bound*",
      "CI upper bound*",
      "Estimate",
      "Study weight",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("offers only fields whose kind satisfies a role's constraints", async () => {
    const user = userEvent.setup();
    render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/Outcome/i));
    expect(screen.getByRole("option", { name: "Value" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Year" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Region" })).not.toBeInTheDocument();
  });

  it("excludes measures that do not support the role's catalog role", async () => {
    const user = userEvent.setup();
    render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/Outcome/i));
    expect(screen.getByRole("option", { name: "Value" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Restricted metric" })).not.toBeInTheDocument();
  });

  it("keeps high-cardinality fields and Source out of Group", async () => {
    const user = userEvent.setup();
    render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/^Group/i));
    expect(screen.getByRole("option", { name: "Region" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Source" })).not.toBeInTheDocument();
  });

  it("marks required roles and omits Not set only for them", async () => {
    const user = userEvent.setup();
    render(<OutcomeSection />);
    expect(screen.getAllByText("*", { selector: "span" }).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText(/Outcome/i));
    expect(screen.queryByRole("option", { name: "Not set" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByLabelText(/^Group/i));
    expect(screen.getByRole("option", { name: "Not set" })).toBeInTheDocument();
  });

  it("contains neither geography nor the module Add line layer action", () => {
    render(<OutcomeSection />);
    expect(screen.queryByLabelText(/geographic level/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add line/i })).not.toBeInTheDocument();
  });

  it("keeps Add line available when the standalone Edit step opts into layers", () => {
    render(<OutcomeSection allowLayers />);
    expect(screen.getByRole("button", { name: /add line/i })).toBeInTheDocument();
  });

  it("binds standalone dropdowns to inlineFields instead of the module catalog", async () => {
    const user = userEvent.setup();
    state.schema = { id: "byod", inlineOnly: true, fields: {}, subsets: {} };
    state.config = lineConfig({
      data: {
        source: "inline",
        inline: {
          columns: [
            { name: "Period", type: "date" },
            { name: "Amount", type: "number" },
            { name: "Place", type: "text" },
          ],
          rows: [["2025", "10", "Alameda"]],
          issues: [],
        },
      },
      bindings: { x: "Period", y: "Amount", series: "Place" },
    });
    render(<OutcomeSection allowLayers />);
    await user.click(screen.getByLabelText(/Outcome/i));
    expect(screen.getByRole("option", { name: "Amount" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Value" })).not.toBeInTheDocument();
  });

  it("keeps a real X-Axis dropdown for bring-your-own-data, which has no temporal field to imply", () => {
    state.schema = BYOD_SCHEMA;
    state.config = lineConfig({
      data: {
        source: "inline",
        inline: {
          columns: [
            { name: "Period", type: "date" },
            { name: "Amount", type: "number" },
          ],
          rows: [["2025", "10"]],
          issues: [],
        },
      },
      bindings: { x: "Period", y: "Amount" },
    });
    render(<OutcomeSection allowLayers />);
    expect(screen.getByLabelText(/^X-Axis/)).toBeInTheDocument();
  });

  it("hides catalog-disallowed measures out of advanced mode", async () => {
    const user = userEvent.setup();
    render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/Outcome/i));
    expect(
      screen.queryByRole("option", { name: "Restricted metric" }),
    ).not.toBeInTheDocument();
  });

  it("offers every measure of the accepted kind in advanced mode", async () => {
    const user = userEvent.setup();
    rtlRender(
      <AdvancedModeProvider defaultAdvanced>
        <OutcomeSection />
      </AdvancedModeProvider>,
    );
    await user.click(screen.getByLabelText(/Outcome/i));
    expect(screen.getByRole("option", { name: "Restricted metric" })).toBeInTheDocument();
  });

  it("never offers a dimension for the Outcome role, in either mode", async () => {
    const user = userEvent.setup();
    for (const advanced of [false, true]) {
      const view = rtlRender(
        <AdvancedModeProvider defaultAdvanced={advanced}>
          <OutcomeSection />
        </AdvancedModeProvider>,
      );
      await user.click(screen.getByLabelText(/Outcome/i));
      expect(screen.queryByRole("option", { name: "Region" })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("keeps a pasted line's X-Axis temporal-only, offering no dimension", async () => {
    // The standalone tool stays temporal-only: `buildLineShape` coerces the x
    // column to a number, so a categorical x draws an empty chart, and offering
    // one suppresses inlineMapping's "retype it as Date" hint. Workstream D
    // widened this and it was reverted — see chartRegistry.js's line descriptor.
    const user = userEvent.setup();
    state.schema = BYOD_SCHEMA;
    const inlineLine = (columns) =>
      lineConfig({
        data: {
          source: "inline",
          inline: { columns, rows: [["18–24", "10"]] },
        },
        bindings: { y: "Amount" },
      });

    state.config = inlineLine([
      { name: "Age group", type: "group" },
      { name: "Amount", type: "number" },
    ]);
    const view = render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/^X-Axis/i));
    expect(screen.queryByRole("option", { name: "Age group" })).not.toBeInTheDocument();
    view.unmount();

    // A date-typed column is what it does offer — the fix the hint points at.
    state.config = inlineLine([
      { name: "Wave", type: "date" },
      { name: "Amount", type: "number" },
    ]);
    render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/^X-Axis/i));
    expect(screen.getByRole("option", { name: "Wave" })).toBeInTheDocument();
  });

  it("offers no Benchmark dropdown on a line, a range, or a forest plot", () => {
    for (const chartType of ["line", "dumbbell", "forest"]) {
      state.config = lineConfig({ chartType, preset: null, bindings: {} });
      const view = render(<OutcomeSection />);
      expect(screen.queryByLabelText(/^Benchmark/i)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("hides the Series dropdown out of advanced mode and shows it in", () => {
    const basic = render(<OutcomeSection />);
    expect(screen.queryByLabelText(/^Series/i)).not.toBeInTheDocument();
    basic.unmount();

    rtlRender(
      <AdvancedModeProvider defaultAdvanced>
        <OutcomeSection />
      </AdvancedModeProvider>,
    );
    expect(screen.getByLabelText(/^Series/i)).toBeInTheDocument();
  });

  it("writes bar orientation to appearance", async () => {
    const user = userEvent.setup();
    state.config = barConfig();
    render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/orientation/i));
    await user.click(screen.getByRole("option", { name: "Horizontal" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "orientation",
      value: "horizontal",
    });
  });

  it("shows no orientation control for a line", () => {
    render(<OutcomeSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
  });

  it("shows the Diverging bars switch for a bar and not for a line (Workstream B)", () => {
    state.config = barConfig();
    render(<OutcomeSection />);
    expect(screen.getByLabelText(/diverging bars/i)).toBeInTheDocument();
    cleanup();
    state.config = lineConfig();
    render(<OutcomeSection />);
    expect(screen.queryByLabelText(/diverging bars/i)).not.toBeInTheDocument();
  });

  it("turning Diverging on dispatches only the diverging key, leaving orientation untouched", async () => {
    const user = userEvent.setup();
    state.config = barConfig();
    render(<OutcomeSection />);
    await user.click(screen.getByLabelText(/diverging bars/i));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "diverging",
      value: true,
    });
    expect(state.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "orientation" }),
    );
  });

  it("dispatches tab-column selection and keyboard tab-order changes", async () => {
    const user = userEvent.setup();
    state.config = lineConfig({
      filters: {
        tabColumn: "Region",
        tabValue: "North",
        tabOrder: ["North", "South"],
      },
      tabOptions: ["North", "South"],
    });
    render(<OutcomeSection />);

    const handle = screen.getByRole("button", {
      name: /drag to reorder South.*arrow keys/i,
    });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      key: "tabOrder",
      value: ["South", "North"],
    });

    state.dispatch.mockClear();
    await user.click(screen.getByLabelText(/tab[- ]by[- ]column/i));
    await user.click(screen.getByRole("option", { name: "Source" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      key: "tabColumn",
      value: "Source",
    });
  });
});
