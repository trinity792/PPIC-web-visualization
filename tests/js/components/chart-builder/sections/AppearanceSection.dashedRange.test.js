import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

it.each(["line", "bar", "choroplethMap", "heatmap"])("shows the dashed range control only for line charts: %s", type => {
  show(type);
  const control = screen.queryByRole("switch", { name: "Dashed lines for a range of periods" });
  if(type === "line") { expect(control).toBeInTheDocument(); expect(control).not.toBeChecked(); }
  else expect(control).not.toBeInTheDocument();
});
it("offers only periods that are in the data", async () => {
  show("line", { dashedRange: { from: 2025, to: 2030, label: "Projected" } });
  const user = userEvent.setup();
  for(const name of ["Start period", "End period"]) {
    await user.click(screen.getByLabelText(name));
    expect(screen.getAllByRole("option").map(o => o.textContent)).toEqual(["2020", "2025", "2030"]);
    await user.keyboard("{Escape}");
  }
});
it("fills the range from projected periods", async () => {
  show("line", { dashedRange: { from: 2020, to: 2025, label: "Projected" } });
  await userEvent.setup().click(screen.getByRole("button", { name: "Use projected periods" }));
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "dashedRange", value: { from: 2030, to: 2030, label: "Projected" } });
});
it("shows Markers off when nothing is saved", () => { show(); expect(screen.getByRole("switch", { name: "Markers" })).not.toBeChecked(); });
it("keeps an explicitly saved Markers on", () => { show("line", { markerMode: "on" }); expect(screen.getByRole("switch", { name: "Markers" })).toBeChecked(); });
it("offers Automatic as the first legend position for line charts", async () => {
  show();
  await userEvent.setup().click(screen.getByLabelText("Legend Position"));
  expect(screen.getAllByRole("option")[0]).toHaveTextContent(/^Automatic$/);
});
it("saves the range label and clears the range when switched off", () => {
  show("line", { dashedRange: { from: 2025, to: 2030, label: "Projected" } });
  fireEvent.change(screen.getByLabelText("Range label"), { target: { value: "Forecast" } });
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "dashedRange", value: { from: 2025, to: 2030, label: "Forecast" } });
  fireEvent.click(screen.getByRole("switch", { name: "Dashed lines for a range of periods" }));
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "dashedRange", value: undefined });
});

import { getSetting } from "@/lib/visualization/settingsRegistry";
it("registers dashedRange as a line-only presentation setting", () => {
  expect(getSetting("dashedRange")).toMatchObject({ charts: ["line"], classification: "presentation", configPath: "presentation.appearance.dashedRange" });
});
