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

it.each(["line", "bar", "dumbbell", "dotPlot", "forest", "heatmap", "scatter", "bubble", "pie", "choroplethMap", "symbolMap"])("shows Show cell values only for heatmap: %s", type => {
  show(type);
  if(type === "heatmap") expect(screen.getByRole("switch", { name: "Show cell values" })).toBeInTheDocument();
  else expect(screen.queryByRole("switch", { name: "Show cell values" })).not.toBeInTheDocument();
});

it("starts with cell values off and saves the switch", () => {
  show("heatmap");
  const toggle = screen.getByRole("switch", { name: "Show cell values" });
  expect(toggle).not.toBeChecked(); fireEvent.click(toggle);
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "showCellValues", value: true });
});
