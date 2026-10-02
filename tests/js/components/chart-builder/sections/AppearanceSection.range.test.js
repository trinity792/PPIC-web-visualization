// Renderer plan F (range chart): row label alignment shows for every version 3
// range chart, Group alignment only when the chart draws groups, and Hide
// X-Axis reads an old view's showValueAxis: false as on.
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { config, schema, observations, comparisons } from "@/tests/fixtures/visualization-v3/renderer";
const state = vi.hoisted(() => ({ config: null, schema: null, dispatch: vi.fn() }));
const preview = vi.hoisted(() => ({ result: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({ useChartConfig: () => state }));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({ usePreview: () => preview }));
import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";
const sfLatina = observations.filter(r => r.comparisonId === "latina");
beforeEach(() => {
  state.schema = schema; state.dispatch.mockClear();
  preview.result = { observations: sfLatina, periods: [2020, 2030] };
});
function show(appearance = {}, { twoComparisons = false } = {}) {
  state.config = config("dumbbell", appearance);
  state.config.presentation.bindings = {};
  if (twoComparisons) {
    state.config.question.comparisons = [
      ...state.config.question.comparisons,
      { id: "white", dimensions: {}, customLabel: "White Women", color: "Navy" },
    ];
  }
  return render(<AdvancedModeProvider defaultAdvanced><AppearanceSection /></AdvancedModeProvider>);
}

it("shows Variable alignment for a version 3 range chart with no group binding", () => {
  show();
  expect(screen.getByLabelText("Variable alignment")).toBeInTheDocument();
  expect(screen.queryByLabelText("Group alignment")).not.toBeInTheDocument();
  expect(screen.getByText("Row labels")).toBeInTheDocument();
});
it("shows Group alignment once the range chart draws groups", () => {
  preview.result = { observations: observations.filter(r => r.comparisonId !== "black"), periods: [2020, 2030], comparisons: comparisons.slice(0, 2) };
  show({}, { twoComparisons: true });
  expect(screen.getByLabelText("Group alignment")).toBeInTheDocument();
  expect(screen.getByLabelText("Variable alignment")).toBeInTheDocument();
});
it("defaults both alignments to left", () => {
  preview.result = { observations: observations.filter(r => r.comparisonId !== "black"), periods: [2020, 2030] };
  show({}, { twoComparisons: true });
  expect(screen.getByLabelText("Group alignment")).toHaveTextContent("Left");
  expect(screen.getByLabelText("Variable alignment")).toHaveTextContent("Left");
});
it.each([
  [{ showValueAxis: false }, true],
  [{ showValueAxis: false, hideXAxis: false }, false],
  [{ hideXAxis: true }, true],
  [{}, false],
])("reads Hide X-Axis from %j", (appearance, checked) => {
  show(appearance);
  expect(screen.getByLabelText("Hide X-Axis")).toHaveAttribute("aria-checked", String(checked));
});
// Owner, 2026-10-01: no Automatic legend position for range charts; Top by default.
it("offers no Automatic legend position and shows Top by default", async () => {
  const user = userEvent.setup();
  show();
  const legend = screen.getByLabelText("Legend Position");
  expect(legend).toHaveTextContent("Top");
  await user.click(legend);
  expect(screen.queryByRole("option", { name: /automatic/i })).not.toBeInTheDocument();
});
