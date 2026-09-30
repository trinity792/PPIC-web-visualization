import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

it.each(["bar", "line", "dumbbell", "pie"])("shows Orientation, Diverging bars, and Stacking only for bar charts: %s", type => {
  show(type);
  for(const name of ["Orientation", "Diverging bars", "Stacking"]) {
    if(type === "bar") expect(screen.getByLabelText(name)).toBeInTheDocument();
    else expect(screen.queryByLabelText(name)).not.toBeInTheDocument();
  }
});
it.each([false,true])("shows the seven diverging controls only when Diverging bars is on: %s", diverging => {
  show("bar", { diverging });
  for(const name of ["Center reference", "Reference line", "Reference line label", "Range minimum", "Range maximum", "Track rail", "Minimal axis", "Threshold colors"]) {
    if(diverging) expect(screen.getByLabelText(name)).toBeInTheDocument();
    else expect(screen.queryByLabelText(name)).not.toBeInTheDocument();
  }
});
it("keeps diverging on for a view that already set it", () => { show("bar", { diverging: true }); expect(screen.getByLabelText("Diverging bars")).toBeChecked(); });
it("saves orientation and stacking in appearance", async () => {
  show("bar");
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Orientation"));
  await user.click(screen.getByRole("option", { name: "Horizontal" }));
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "orientation", value: "horizontal" });
  await user.click(screen.getByLabelText("Stacking"));
  await user.click(screen.getByRole("option", { name: "Stacked" }));
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "stackMode", value: "stacked" });
});
