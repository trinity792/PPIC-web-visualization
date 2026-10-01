import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { config, schema, lineRows } from "@/tests/fixtures/visualization-v3/renderer";
const state = vi.hoisted(() => ({ config: null, schema: null, dispatch: vi.fn() }));
const preview = vi.hoisted(() => ({ result: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({ useChartConfig: () => state }));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({ usePreview: () => preview }));
import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";
beforeEach(() => {
  state.config = config(); state.schema = schema; state.dispatch.mockClear();
  preview.result = { observations: lineRows, periods: [2020,2025,2030] };
});
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
// Owner decision 2026-09-30: Track rail and Minimal axis left the diverging
// group, so five diverging settings (six controls) stay gated.
it.each([false,true])("shows the diverging controls only when Diverging bars is on: %s", diverging => {
  show("bar", { diverging });
  for(const name of ["Center reference", "Reference line", "Reference line label", "Range minimum", "Range maximum", "Threshold colors"]) {
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

// ── Added 2026-09-30 (owner decisions from the PPIC bar references) ──
it("offers Top as a legend position and defaults bar charts to it", async () => {
  show("bar");
  expect(screen.getByLabelText("Legend Position")).toHaveTextContent("Top");
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Legend Position"));
  expect(screen.getByRole("option", { name: "Automatic" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Top" })).toBeInTheDocument();
});
it("shows Stack totals only for stacked bars", () => {
  const sideBySide = show("bar");
  expect(screen.queryByLabelText("Stack totals")).not.toBeInTheDocument();
  sideBySide.unmount();
  show("bar", { stackMode: "stacked" });
  expect(screen.getByLabelText("Stack totals")).toBeInTheDocument();
});
it("shows Color bars by only when bars show several comparisons and several periods", () => {
  const several = show("bar");
  expect(screen.getByLabelText("Color bars by")).toBeInTheDocument();
  several.unmount();
  preview.result = { observations: lineRows.filter(r => r.period === 2025), periods: [2025] };
  show("bar");
  expect(screen.queryByLabelText("Color bars by")).not.toBeInTheDocument();
});
it("shows Track rail and Minimal axis without Diverging bars", () => {
  show("bar");
  expect(screen.getByLabelText("Track rail")).toBeInTheDocument();
  expect(screen.getByLabelText("Minimal axis")).toBeInTheDocument();
});
// Owner, 2026-09-30: Track rail is fine-tuning.
it("keeps Track rail in Advanced Mode", () => {
  show("bar", {}, false);
  expect(screen.queryByLabelText("Track rail")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Minimal axis")).toBeInTheDocument();
});
it("offers only the style guide's official colors for thresholds", async () => {
  show("bar", { diverging: true, colorBuckets: [{ at: null, color: "Orange" }] });
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Choose a color for threshold 1"));
  const names = ["Orange", "Red", "Green", "Seafoam", "Navy", "Violet", "Blue", "Lime", "Gray", "Dark Gray"];
  for (const name of names) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Navy" }));
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "colorBuckets", value: [{ at: null, color: "Navy" }] });
});
it("keeps the label controls in Advanced Mode behind Show values", () => {
  const valuesOff = show("bar", {}, true);
  expect(screen.queryByLabelText("Label position")).not.toBeInTheDocument();
  valuesOff.unmount();
  const standard = show("bar", { showValueLabels: true }, false);
  expect(screen.getByLabelText("Show values")).toBeChecked();
  expect(screen.queryByLabelText("Label position")).not.toBeInTheDocument();
  standard.unmount();
  show("bar", { showValueLabels: true }, true);
  expect(screen.getByLabelText("Label position")).toBeInTheDocument();
  expect(screen.getByLabelText("Label which series")).toBeInTheDocument();
});
it("saves the new bar settings in appearance", async () => {
  show("bar");
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Show values"));
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "showValueLabels", value: true });
  await user.click(screen.getByLabelText("Sort"));
  await user.click(screen.getByRole("option", { name: "Largest first" }));
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "sort", value: "descending" });
  await user.click(screen.getByLabelText("Stacking"));
  await user.click(screen.getByRole("option", { name: "Stacked to 100%" }));
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "stackMode", value: "percent" });
});
// Owner, 2026-09-30: the reader chooses the order of the bars within each
// group (such as which year comes first).
it("reorders the bars within each group by dragging or the arrow keys", async () => {
  show("bar", {}, false);
  const list = screen.getByRole("group", { name: "Bar order within groups" });
  const handles = [...list.querySelectorAll("button")];
  expect(handles.length).toBeGreaterThan(1);
  const names = handles.map(button => button.getAttribute("aria-label").replace(/^Drag to reorder (.*)\. Use arrow keys to move it\.$/, "$1"));
  const user = userEvent.setup();
  handles[0].focus();
  await user.keyboard("{ArrowDown}");
  expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "seriesOrder", value: [names[1], names[0], ...names.slice(2)] });
});
it("offers no bar order for a single series", () => {
  preview.result = { observations: lineRows.filter(row => row.comparisonId === lineRows[0].comparisonId && row.period === lineRows[0].period), periods: [lineRows[0].period] };
  show("bar", {}, false);
  expect(screen.queryByRole("group", { name: "Bar order within groups" })).not.toBeInTheDocument();
});
