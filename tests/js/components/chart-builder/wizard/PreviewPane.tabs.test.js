import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ previews: [] }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({ dispatch: vi.fn(), schema: {}, workspace: { layout: "1x1" } }),
}));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  usePreview: () => ({ previews: state.previews, setGraphDiv: vi.fn() }),
}));

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";

function preview(comparisons) {
  return {
    id: "chart_1",
    name: "Chart 1",
    status: "loading",
    config: {
      version: 3,
      question: { comparisons: comparisons.map((id) => ({ id, customLabel: id })) },
      presentation: { chartType: "choroplethMap", comparisonPresentation: "tabs", activeTab: comparisons[0] },
    },
  };
}

// Owner, 2026-10-12: a lone "Selected locations" tab above a map had nothing to
// switch to, so the comparison tabs show only for two or more comparisons.
it("shows no comparison tab for a single comparison", () => {
  state.previews = [preview(["Selected locations"])];
  render(<PreviewPane />);
  expect(screen.queryByRole("button", { name: "Selected locations" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Comparison" })).not.toBeInTheDocument();
});

it("shows the comparison tabs for several comparisons", () => {
  state.previews = [preview(["Women", "Men"])];
  render(<PreviewPane />);
  expect(screen.getByRole("button", { name: "Women" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Men" })).toBeInTheDocument();
});
