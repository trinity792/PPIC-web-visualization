/** Advanced Mode: what the switch hides, and on which surfaces it appears. */

/* eslint-disable react/prop-types */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const locations = Array.from({ length: 4 }, (_, index) => `Place ${index + 1}`);

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
  schema: null,
  options: null,
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));
vi.mock("@/components/chart-builder/useLocationOptions", () => ({
  default: () => state.options,
  useLocationOptions: () => state.options,
}));
vi.mock("@/lib/visualization/sidebarSections", () => ({
  visibleSectionsFor: () => [],
}));
vi.mock("@/components/chart-builder/ValidationNotice", () => ({
  default: () => null,
}));

import {
  AdvancedModeProvider,
  AdvancedModeToggle,
} from "@/components/chart-builder/advancedMode";
import CategoriesSection from "@/components/chart-builder/sections/CategoriesSection";
import GeographySection from "@/components/chart-builder/sections/GeographySection";
import ModuleSidebar from "@/components/chart-builder/workbench/ModuleSidebar";

const baseSchema = {
  id: "widgets",
  apiPath: "/api/widgets",
  sources: ["DoF"],
  subsets: { Counties: ["County"] },
  fields: { Location: { kind: "dimension", cardinality: "high" } },
};

function baseConfig(overrides = {}) {
  return {
    chartType: "line",
    filters: { subset: "Counties", locations: [], topN: 6 },
    appearance: { sort: "value", categoryOrder: [], hiddenCategories: [] },
    categoryNames: locations,
    ...overrides,
  };
}

/** The section plus the switch that governs it, as both editors mount them. */
function Surface({ children }) {
  return (
    <AdvancedModeProvider>
      <AdvancedModeToggle id="test-advanced-mode" />
      {children}
    </AdvancedModeProvider>
  );
}

const rankedValues = () => screen.queryByText(/ranked values/i);

describe("Advanced Mode", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = baseConfig();
    state.schema = baseSchema;
    state.options = { status: "ready", locations, error: null };
  });

  it("starts off, so Ranked values is hidden until the reader asks", async () => {
    const user = userEvent.setup();
    render(<Surface><GeographySection /></Surface>);

    const toggle = screen.getByRole("switch", { name: /advanced mode/i });
    expect(toggle).not.toBeChecked();
    expect(rankedValues()).not.toBeInTheDocument();
    // The place list is not advanced: ordering and selection stay reachable.
    expect(screen.getByRole("switch", { name: "Show Place 1" })).toBeInTheDocument();

    await user.click(toggle);
    expect(rankedValues()).toBeInTheDocument();
  });

  it("still dispatches SET_RANKING once revealed", async () => {
    const user = userEvent.setup();
    render(<Surface><GeographySection /></Surface>);

    await user.click(screen.getByRole("switch", { name: /advanced mode/i }));
    await user.click(screen.getByRole("radio", { name: /bottom/i }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_RANKING",
      topN: 6,
      sort: "ascending",
    });
  });

  it("gates the Categories copy of Ranked values too", async () => {
    const user = userEvent.setup();
    state.config = baseConfig({ chartType: "pie" });
    render(<Surface><CategoriesSection /></Surface>);

    await user.click(screen.getByRole("button", { name: /categories/i }));
    expect(rankedValues()).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: /advanced mode/i }));
    expect(rankedValues()).toBeInTheDocument();
  });

  it("shows everything when no switch is on screen to reveal it", () => {
    // A surface without the provider has no way to opt in, so nothing hides.
    render(<GeographySection />);
    expect(rankedValues()).toBeInTheDocument();
  });

  it("puts the switch on the module workbench sidebar", () => {
    render(<ModuleSidebar />);
    expect(screen.getByRole("switch", { name: /advanced mode/i })).not.toBeChecked();
  });
});
