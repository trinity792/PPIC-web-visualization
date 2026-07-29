/** Phase 7 field-binding and tabbing contract. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
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

import AxisSection from "@/components/chart-builder/sections/AxisSection";

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
    // The store always seeds `layers`, and LayerEditor reads it unguarded.
    layers: [],
    ...overrides,
  };
}

describe("AxisSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.schema = schema;
    state.config = lineConfig();
  });

  it("renders line roles and forest-specific role labels", () => {
    const { unmount } = render(<AxisSection />);
    for (const label of ["X-Axis", "Y-Axis", "Series", "Color"]) {
      expect(screen.getByLabelText(new RegExp(label, "i"))).toBeInTheDocument();
    }
    unmount();

    state.config = lineConfig({
      chartType: "forest",
      preset: null,
      bindings: { category: "Location", start: "Lower", end: "Upper" },
    });
    render(<AxisSection />);
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
    render(<AxisSection />);
    await user.click(screen.getByLabelText(/Y-Axis/i));
    expect(screen.getByRole("option", { name: "Value" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Year" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Region" })).not.toBeInTheDocument();
  });

  it("excludes measures that do not support the role's catalog role", async () => {
    const user = userEvent.setup();
    render(<AxisSection />);
    await user.click(screen.getByLabelText(/Y-Axis/i));
    expect(screen.getByRole("option", { name: "Value" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Restricted metric" })).not.toBeInTheDocument();
  });

  it("keeps high-cardinality fields and Source out of Group", async () => {
    const user = userEvent.setup();
    render(<AxisSection />);
    await user.click(screen.getByLabelText(/^Group/i));
    expect(screen.getByRole("option", { name: "Region" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Source" })).not.toBeInTheDocument();
  });

  it("marks required roles and omits Not set only for them", async () => {
    const user = userEvent.setup();
    render(<AxisSection />);
    expect(screen.getAllByText("*", { selector: "span" }).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText(/Y-Axis/i));
    expect(screen.queryByRole("option", { name: "Not set" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByLabelText(/^Color/i));
    expect(screen.getByRole("option", { name: "Not set" })).toBeInTheDocument();
  });

  it("contains neither geography nor the module Add line layer action", () => {
    render(<AxisSection />);
    expect(screen.queryByLabelText(/geographic level/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add line/i })).not.toBeInTheDocument();
  });

  it("keeps Add line available when the standalone Edit step opts into layers", () => {
    render(<AxisSection allowLayers />);
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
    render(<AxisSection allowLayers />);
    await user.click(screen.getByLabelText(/Y-Axis/i));
    expect(screen.getByRole("option", { name: "Amount" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Value" })).not.toBeInTheDocument();
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
    render(<AxisSection />);

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
