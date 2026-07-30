/** Phase 6 geographic level, locations, ordering, and ranking contract. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const locations = Array.from({ length: 10 }, (_, index) => `Place ${index + 1}`);
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

import CategoriesSection from "@/components/chart-builder/sections/CategoriesSection";
import GeographySection from "@/components/chart-builder/sections/GeographySection";

function baseConfig(overrides = {}) {
  return {
    chartType: "line",
    filters: { subset: "Counties", locations: [], topN: 6 },
    appearance: {
      sort: "value",
      categoryOrder: [],
      hiddenCategories: [],
    },
    categoryNames: locations,
    ...overrides,
  };
}

const baseSchema = {
  id: "widgets",
  apiPath: "/api/widgets",
  sources: ["DoF", "Census"],
  subsets: { Regions: ["Region"], Counties: ["County"], States: ["State"] },
  subsetSource: { Regions: "DoF" },
  fields: { Location: { kind: "dimension", cardinality: "high" } },
};

describe("GeographySection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = baseConfig();
    state.schema = baseSchema;
    state.options = { status: "ready", locations, error: null };
  });

  it("lists schema subsets and restricts a choropleth to Counties", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<GeographySection />);
    await user.click(screen.getByRole("combobox", { name: /geographic level/i }));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Regions",
      "Counties",
      "States",
    ]);
    unmount();

    state.config = baseConfig({ chartType: "choroplethMap" });
    render(<GeographySection />);
    await user.click(screen.getByRole("combobox", { name: /geographic level/i }));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Counties",
    ]);
  });

  it("keeps subset source side effects and the States/Census rule", async () => {
    const user = userEvent.setup();
    render(<GeographySection />);
    const level = screen.getByRole("combobox", { name: /geographic level/i });
    await user.click(level);
    await user.click(screen.getByRole("option", { name: "Regions" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      key: "source",
      value: "DoF",
    });

    state.dispatch.mockClear();
    await user.click(level);
    await user.click(screen.getByRole("option", { name: "States" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      key: "source",
      value: "Census",
    });
  });

  it("shows exactly seven locations before Show more", () => {
    render(<GeographySection />);
    for (const name of locations.slice(0, 7)) expect(screen.getByText(name)).toBeInTheDocument();
    for (const name of locations.slice(7)) expect(screen.queryByText(name)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show more (3)" })).toBeInTheDocument();
  });

  it("reveals every remaining location and reports the remaining count", async () => {
    const user = userEvent.setup();
    render(<GeographySection />);
    await user.click(screen.getByRole("button", { name: "Show more (3)" }));
    for (const name of locations) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("accumulates explicit location selection in filters.locations", async () => {
    const user = userEvent.setup();
    state.config = baseConfig({
      filters: { subset: "Counties", locations: ["Place 1"], topN: 6 },
    });
    render(<GeographySection />);
    await user.click(screen.getByRole("checkbox", { name: /select Place 2/i }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      key: "locations",
      value: ["Place 1", "Place 2"],
    });
  });

  it("clears explicit locations when geographic level changes", async () => {
    const user = userEvent.setup();
    state.config = baseConfig({
      filters: { subset: "Counties", locations: ["Place 1"], topN: 6 },
    });
    render(<GeographySection />);
    await user.click(screen.getByRole("combobox", { name: /geographic level/i }));
    await user.click(screen.getByRole("option", { name: "Regions" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_FILTER",
      key: "locations",
      value: [],
    });
  });

  it.each([
    ["loading", /loading locations/i],
    ["error", /could not load locations/i],
    ["ready", /no locations available/i],
  ])("renders the %s async state explicitly", (status, message) => {
    state.options = {
      status,
      locations: [],
      error: status === "error" ? new Error("boom") : null,
    };
    render(<GeographySection />);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("supports keyboard and pointer category reordering for place charts", () => {
    render(<GeographySection />);
    const handle = screen.getByRole("button", {
      name: /drag to reorder Place 2.*arrow keys/i,
    });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "categoryOrder",
      value: ["Place 2", "Place 1", ...locations.slice(2)],
    });

    state.dispatch.mockClear();
    const source = handle.closest('[draggable="true"]');
    const target = screen
      .getByRole("button", { name: /drag to reorder Place 1.*arrow keys/i })
      .closest('[draggable="true"]');
    const dataTransfer = {
      effectAllowed: "none",
      setData: vi.fn(),
      getData: vi.fn(() => "Place 2"),
    };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "categoryOrder",
      value: ["Place 2", "Place 1", ...locations.slice(2)],
    });
  });

  it("stores per-place visibility in appearance.hiddenCategories", async () => {
    const user = userEvent.setup();
    render(<GeographySection />);
    await user.click(screen.getByRole("switch", { name: "Show Place 2" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "hiddenCategories",
      value: ["Place 2"],
    });
  });

  it.each(["line", "bar"])(
    "dispatches Top/Bottom N through SET_RANKING for %s place charts",
    async (chartType) => {
    const user = userEvent.setup();
    state.config = baseConfig({ chartType });
    render(<GeographySection />);
    await user.click(screen.getByRole("radio", { name: /bottom/i }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_RANKING",
      topN: 6,
      sort: "ascending",
    });
    fireEvent.change(screen.getByLabelText(/number of values/i), {
      target: { value: "3" },
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_RANKING",
      topN: 3,
      sort: "value",
    });
    },
  );

  it("leaves ordering to Categories for a non-place chart type", () => {
    state.config = baseConfig({ chartType: "pie" });
    const { unmount } = render(<GeographySection />);
    expect(screen.queryByRole("button", { name: /drag to reorder/i })).not.toBeInTheDocument();
    unmount();

    render(<CategoriesSection />);
    expect(screen.getByRole("button", { name: /categories/i })).toBeInTheDocument();
  });

  it("hides entirely for bring-your-own-data with no geographic subsets", () => {
    state.schema = { id: "byod", apiPath: null, subsets: {}, fields: {} };
    const { container } = render(<GeographySection />);
    expect(container).toBeEmptyDOMElement();
  });
});
