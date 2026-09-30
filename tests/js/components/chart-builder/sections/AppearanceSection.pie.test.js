import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { config, schema, lineRows } from "@/tests/fixtures/visualization-v3/renderer";
const state = vi.hoisted(() => ({ config: null, schema: null, dispatch: vi.fn() }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({ useChartConfig: () => state }));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({ usePreview: () => ({ result: { observations: lineRows, periods: [2020,2025,2030] } }) }));
import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";
beforeEach(() => { state.config = config(); state.schema = schema; state.dispatch.mockClear(); });
function show(type = "line", appearance = {}, advanced = true) {
  state.config = config(type, appearance);
  return render(<AdvancedModeProvider defaultAdvanced={advanced}><AppearanceSection /></AdvancedModeProvider>);
}

it.each(["line", "bar", "dumbbell", "dotPlot", "forest", "heatmap", "scatter", "bubble", "pie", "choroplethMap", "symbolMap"])("shows Donut hole only for pie: %s", type => {
  show(type);
  if(type === "pie") expect(screen.getByRole("slider", { name: "Donut hole" })).toBeInTheDocument();
  else expect(screen.queryByRole("slider", { name: "Donut hole" })).not.toBeInTheDocument();
});

it("saves Donut hole from the slider", () => {
  show("pie");
  const slider = screen.getByRole("slider", { name: "Donut hole" });
  expect(slider).toHaveAttribute("aria-valuenow", "0");
  expect(slider).toHaveAttribute("aria-valuemin", "0"); expect(slider).toHaveAttribute("aria-valuemax", "0.6");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "hole", value: expect.any(Number) });
  expect(state.dispatch.mock.calls.at(-1)[0].value).toBeGreaterThan(0);
});
