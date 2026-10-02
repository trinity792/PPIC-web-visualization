import React from "react";
import { render, screen } from "@testing-library/react";
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

import LabelsSection from "@/components/chart-builder/sections/LabelsSection";
import { visibleSectionsFor } from "@/lib/visualization/sidebarSections";
// Explicit inventory of the rendering controls in the plan's settings tables.
// Query/transform controls have separate existing section suites. Gated
// rendering controls are exercised below with their parent switches enabled.
const shared = ["Title", "Show title", "Subtitle", "Show subtitle", "X-Axis Label", "Show X-axis label", "Y-Axis Label", "Show Y-axis label", "Color Palette", "Legend Position", "Footnote", "Show source and notes"];
// Owner decision 2026-09-29: Typography, line spacing, Markers, and the dashed
// range move to Advanced Mode (with both tick increments, enumerated
// separately below). ADVANCED_ONLY lists what standard mode must not show.
const typography = ["Title Size", "Subtitle Size", "Axis Label Size", "Legend Text Size", "Data Label Size", "Decimal Places"];
const spacing = ["Horizontal Line Spacing (px)", "Vertical Line Spacing (px)"];
// A line's horizontal axis is its implied temporal field, so its tick
// increment shows even with no bindings (Build, Workstream C).
const lineYearTick = "Horizontal tick increment (Year)";
// Owner decision 2026-09-30 (bar references): Show values, Sort, and Stack
// totals are standard; the other new bar controls are Advanced Mode only.
// Track rail joined them after the owner's review the same day.
const barAdvanced = ["Track rail", "Label which series", "Label position", "Bars along", "Color bars by"];
// Owner decision 2026-10-01 (PPIC range references): Range style is standard;
// Value axis position and Label which end are Advanced Mode only.
const rangeAdvanced = ["Value axis position", "Label which end"];
const ADVANCED_ONLY = new Set([...typography, ...spacing, lineYearTick, "Markers", "Dashed lines for a range of periods", "Start period", "End period", "Range label", ...barAdvanced, ...rangeAdvanced]);
const row = ["Group alignment", "Variable alignment", "Show point values"];
const expected = {
  line: [...shared, ...typography, ...spacing, lineYearTick, "Markers", "Dashed lines for a range of periods", "Start period", "End period", "Range label"],
  bar: [...shared, ...typography, ...spacing, "Orientation", "Diverging bars", "Stacking", "Space between groups", "Center reference", "Reference line", "Reference line label", "Range minimum", "Range maximum", "Minimal axis", "Threshold colors", "Show values", "Stack totals", "Sort", ...barAdvanced],
  dumbbell: [...shared, ...typography, ...spacing, ...row, "First Line Only", "Range style", ...rangeAdvanced],
  dotPlot: [...shared, ...typography, ...spacing, ...row, "Latina Women", "White Women", "Marker size"],
  forest: [...shared, ...typography, ...spacing, ...row, "Interval ends", "Estimate marker", "Line of no effect", "Value axis center"],
  heatmap: [...shared, ...typography, ...spacing, "Color scale", "Invert color scale", "Show cell values"],
  scatter: [...shared, ...typography, ...spacing], bubble: [...shared, ...typography, ...spacing],
  pie: [...shared, ...typography, "Donut hole"],
  choroplethMap: [...shared, ...typography, "Color scale", "Invert color scale"],
  symbolMap: [...shared, ...typography, "Color gradient", "Invert color scale"],
};
function controls(container) {
  return [...container.querySelectorAll('input:not([type="hidden"]), textarea, [role="switch"], [role="combobox"], [role="slider"]')]
    // Radix puts a hidden native input beside switches; it is not a second control.
    .filter(el => !(el.tagName === "INPUT" && el.getAttribute("aria-hidden") === "true"))
    .map(el => el.getAttribute("aria-label") || [...container.querySelectorAll("label")].find(l => l.htmlFor === el.id)?.textContent.trim() || "UNLABELLED CONTROL").sort();
}
for(const type of Object.keys(expected)) for(const advanced of [false,true]) {
  it(`${type} shows exactly the controls in its settings table (${advanced ? "advanced" : "standard"})`, () => {
    // Bar: Show values reveals the two label controls and stacking reveals
    // Stack totals. Color bars by needs several comparisons and several
    // periods, which the mocked preview's lineRows already have.
    const barGates = type === "bar" ? { showValueLabels: true, stackMode: "stacked" } : {};
    state.config = config(type, { diverging: type === "bar", showPointLabels: true, symbolGradient: true, colorScale: "diverging", dashedRange: { from: 2025, to: 2030, label: "Projected" }, ...barGates });
    // No axis bindings: the axis-dependent controls are enumerated separately
    // below with a meaningful numeric binding and range.
    state.config.presentation.bindings = ["dumbbell", "dotPlot", "forest"].includes(type) ? { group: "Location" } : {};
    // Render the sections the sidebar registry shows in this mode, as the
    // editor does, so section-level Advanced gating (Typography) is covered.
    const sections = visibleSectionsFor(state.config, state.schema, { only: ["labels", "appearance", "typography"], advanced });
    const { container } = render(<AdvancedModeProvider defaultAdvanced={advanced}>{sections.map(({ value, Component }) => <Component key={value} />)}</AdvancedModeProvider>);
    const extra = advanced && ["dumbbell","dotPlot","forest"].includes(type) ? ["Hide X-Axis"] : [];
    if(advanced && ["heatmap","choroplethMap","symbolMap"].includes(type)) extra.push("Custom diverging colors");
    const shown = expected[type].filter(name => advanced || !ADVANCED_ONLY.has(name));
    expect(controls(container)).toEqual([...shown, ...extra].sort());
  });
  it(`${type} shows no removed or hidden control (${advanced ? "advanced" : "standard"})`, () => {
    show(type, {}, advanced);
    for(const name of [/tooltip template/i, /indentation/i, /legend label for/i, /choose a color for Latina Women/i]) expect(screen.queryByLabelText(name)).not.toBeInTheDocument();
    expect(screen.queryByText("Legend items")).not.toBeInTheDocument();
  });
}
it("shows Legend Position in the Appearance section only", () => {
  const labels = render(<LabelsSection />);
  expect(screen.queryByLabelText("Legend Position")).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: /^(Show legend|Legend)$/i })).not.toBeInTheDocument();
  labels.unmount(); show();
  expect(screen.getAllByLabelText("Legend Position")).toHaveLength(1);
});
it("enumerates both numeric axis controls when their bindings are present", () => {
  state.config = config("scatter");
  state.config.presentation.bindings = { x: "Population", y: "Population" };
  state.config.axisRanges = { horizontal: { min: 0, max: 50 }, vertical: { min: 0, max: 50 } };
  const { container } = render(<AdvancedModeProvider defaultAdvanced><AppearanceSection /></AdvancedModeProvider>);
  expect(controls(container).filter(name => /number type|tick increment/i.test(name))).toEqual([
    "Horizontal number type (Population)", "Horizontal tick increment (Population)",
    "Vertical number type (Population)", "Vertical tick increment (Population)",
  ]);
});

it("keeps both tick increments in Advanced Mode only", () => {
  state.config = config("scatter");
  state.config.presentation.bindings = { x: "Population", y: "Population" };
  state.config.axisRanges = { horizontal: { min: 0, max: 50 }, vertical: { min: 0, max: 50 } };
  const { container } = render(<AdvancedModeProvider defaultAdvanced={false}><AppearanceSection /></AdvancedModeProvider>);
  expect(controls(container).filter(name => /tick increment/i.test(name))).toEqual([]);
  // The number types stay in standard mode.
  expect(controls(container).filter(name => /number type/i.test(name))).toEqual([
    "Horizontal number type (Population)", "Vertical number type (Population)",
  ]);
});
