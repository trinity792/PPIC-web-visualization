import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { config, schema, lineRows } from "@/tests/fixtures/visualization-v3/renderer";
const state = vi.hoisted(() => ({ config: null, schema: null, dispatch: vi.fn() }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({ useChartConfig: () => state }));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({ usePreview: () => ({ result: { observations: lineRows, periods: [2020,2025,2030] } }) }));
vi.mock("@/lib/visualization/adapters", async original => ({ ...(await original()), adaptObservations: () => ({ key: { breaks: [10, 20, 30, 40] } }) }));
import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";
beforeEach(() => { state.schema = schema; state.dispatch.mockClear(); });
function show(type, appearance = {}, advanced = false) {
  state.config = config(type, appearance);
  return render(<AdvancedModeProvider defaultAdvanced={advanced}><AppearanceSection /></AdvancedModeProvider>);
}

// Owner decisions 2026-10-12 (renderer plan L): maps color by class, five
// quantiles unless chosen otherwise, with Continuous as a choice.
it("shows five quantile classes for a choropleth when nothing is saved", () => {
  show("choroplethMap");
  expect(screen.getByRole("combobox", { name: "Class breaks" })).toHaveTextContent("Quantile");
  expect(screen.getByRole("combobox", { name: "Number of classes" })).toHaveTextContent("5");
});

it("hides Number of classes when Class breaks is Continuous", () => {
  show("choroplethMap", { classification: "continuous" });
  expect(screen.getByRole("combobox", { name: "Class breaks" })).toHaveTextContent("Continuous");
  expect(screen.queryByRole("combobox", { name: "Number of classes" })).not.toBeInTheDocument();
});

it("shows the class controls on a symbol map only with Color gradient on", () => {
  const { unmount } = show("symbolMap");
  expect(screen.queryByRole("combobox", { name: "Class breaks" })).not.toBeInTheDocument();
  unmount();
  show("symbolMap", { symbolGradient: true });
  expect(screen.getByRole("combobox", { name: "Class breaks" })).toBeInTheDocument();
});

it.each(["line", "bar", "heatmap", "pie"])("shows no class controls on a %s chart", type => {
  show(type);
  expect(screen.queryByRole("combobox", { name: "Class breaks" })).not.toBeInTheDocument();
});

// Advanced Mode custom breaks (owner, 2026-10-12).
it("offers Custom breaks in Advanced Mode only", () => {
  const { unmount } = show("choroplethMap");
  fireEvent.click(screen.getByRole("combobox", { name: "Class breaks" }));
  expect(screen.queryByRole("option", { name: "Custom" })).not.toBeInTheDocument();
  unmount();
  show("choroplethMap", {}, true);
  fireEvent.click(screen.getByRole("combobox", { name: "Class breaks" }));
  fireEvent.click(screen.getByRole("option", { name: "Custom" }));
  // Custom starts from the breaks the map draws now.
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "classBreaks", value: [10, 20, 30, 40] });
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "classification", value: "custom" });
});

it("shows one break per class after the first and saves an edit", () => {
  show("choroplethMap", { classification: "custom", bins: 3, classBreaks: [10, 20] }, true);
  expect(screen.getByLabelText("Class 2 starts at")).toHaveValue(10);
  expect(screen.getByLabelText("Class 3 starts at")).toHaveValue(20);
  expect(screen.queryByLabelText("Class 4 starts at")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Class 3 starts at"), { target: { value: "25.5" } });
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "classBreaks", value: [10, "25.5"] });
});

it("says when the breaks do not rise", () => {
  show("choroplethMap", { classification: "custom", bins: 3, classBreaks: [20, 10] }, true);
  expect(screen.getByRole("status")).toHaveTextContent("Each class must start above the one before it");
});

it("names a saved Custom view in standard mode without showing the inputs", () => {
  show("choroplethMap", { classification: "custom", bins: 3, classBreaks: [10, 20] });
  expect(screen.getByRole("combobox", { name: "Class breaks" })).toHaveTextContent("Custom");
  expect(screen.queryByLabelText("Class 2 starts at")).not.toBeInTheDocument();
});
