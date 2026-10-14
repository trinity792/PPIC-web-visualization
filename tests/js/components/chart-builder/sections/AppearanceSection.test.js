/** Phase 8 mockup order and chart-conditional appearance controls. */

import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dispatch: vi.fn(), config: null, schema: null }));
vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import AppearanceSection from "@/components/chart-builder/sections/AppearanceSection";

function config(chartType = "line", appearance = {}) {
  return {
    chartType,
    data: { source: "module" },
    bindings: {},
    labels: {},
    appearance,
    seriesNames: [],
  };
}

// `useAdvancedMode()` reports *advanced* outside a provider - "no switch on
// screen means nothing is hidden" - so both sides of a gated control need an
// explicit provider. A bare render() is the no-provider case, which shows
// everything.
function renderWithAdvanced(advanced) {
  return render(
    <AdvancedModeProvider defaultAdvanced={advanced}>
      <AppearanceSection />
    </AdvancedModeProvider>,
  );
}
const renderAdvanced = () => renderWithAdvanced(true);
const renderBasic = () => renderWithAdvanced(false);

function labelOrder() {
  return [...document.querySelectorAll("label")].map((label) => label.textContent.trim());
}

describe("AppearanceSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.config = config();
    state.schema = {
      inlineOnly: false,
      fields: {
        Region: { kind: "dimension", label: "Region" },
        Value: {
          kind: "measure",
          label: "Value",
          chartRoles: ["color"],
        },
      },
    };
  });

  it("starts with Color, palette, legend, both spacing inputs, and footnote in order", () => {
    render(<AppearanceSection />);
    const labels = labelOrder();
    const required = [
      "Color",
      "Color Palette",
      "Legend Position",
      "Horizontal Line Spacing (px)",
      "Vertical Line Spacing (px)",
      "Footnote",
    ];
    const positions = required.map((label) =>
      labels.findIndex((candidate) => candidate.toLowerCase() === label.toLowerCase()),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("removes the per-series list in both standard and advanced mode", () => {
    state.config = { ...config(), seriesNames: ["California"] };
    const basic = renderBasic();
    expect(screen.getByLabelText(/color palette/i)).toBeInTheDocument();
    expect(screen.queryByText("Legend items")).not.toBeInTheDocument();
    basic.unmount();
    renderAdvanced();
    expect(screen.queryByText("Legend items")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Legend label for California")).not.toBeInTheDocument();
  });

  // Owner decision 2026-09-29: the whole Comparison appearance block (labels,
  // colors, visibility) is Advanced Mode only.
  it("shows Comparison appearance only in Advanced Mode", async () => {
    const user = userEvent.setup();
    const comparison = {
      id: "cmp_latina",
      dimensions: {
        "Race/Ethnicity": "Hispanic",
        Sex: "Female",
        "Age Group": "All Ages",
      },
      customLabel: null,
      color: null,
    };
    state.config = {
      version: 3,
      question: {
        source: "DoF P-3",
        outcome: { measureId: "Population" },
        geography: { subset: "Counties", locations: ["San Francisco"] },
        comparisons: [comparison],
      },
      presentation: {
        chartType: "line",
        appearance: { comparisonColors: { cmp_latina: "#CA4F1A" } },
        labels: {},
        bindings: {},
        comparisonVisibility: {},
      },
    };
    state.schema = {
      comparisonDimensions: [
        { id: "Race/Ethnicity" },
        { id: "Sex" },
        { id: "Age Group" },
      ],
      fields: {
        Population: { kind: "measure", label: "Population", chartRoles: ["yMeasure"] },
      },
    };

    const basic = renderBasic();
    expect(screen.queryByText("Comparison appearance")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Custom label")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/comparison color/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/show this comparison/i)).not.toBeInTheDocument();

    basic.unmount();
    state.dispatch.mockClear();
    renderAdvanced();
    expect(screen.getByText("Comparison appearance")).toBeInTheDocument();
    const customLabel = screen.getByLabelText("Custom label");
    expect(customLabel).toHaveAttribute("placeholder", "Latina Women");
    fireEvent.change(customLabel, { target: { value: "SF Latinas" } });
    expect(state.dispatch).toHaveBeenLastCalledWith({
      type: "SET_COMPARISONS",
      comparisons: [{ ...comparison, customLabel: "SF Latinas" }],
    });
    state.dispatch.mockClear();
    await user.click(screen.getByLabelText(/comparison color/i));
    await user.click(screen.getByRole("option", { name: "Violet" }));
    expect(state.dispatch).toHaveBeenLastCalledWith({
      type: "SET_COMPARISONS",
      comparisons: [{ ...comparison, color: "Violet" }],
    });

    await user.click(screen.getByRole("switch", { name: /show this comparison/i }));
    expect(state.dispatch).toHaveBeenLastCalledWith({
      type: "SET_COMPARISON_VISIBILITY",
      comparisonId: "cmp_latina",
      visible: false,
    });
  });

  it("does not expose an internal comparison for a location-series module", () => {
    state.config = {
      version: 3,
      question: {
        source: "DoF",
        outcome: { measureId: "Births" },
        geography: { subset: "Regions", locations: ["Bay Area", "Central Coast"] },
        comparisons: [{ id: "cmp_locations", dimensions: {} }],
      },
      presentation: {
        chartType: "line",
        appearance: {},
        labels: {},
        bindings: {},
      },
      seriesNames: ["Bay Area", "Central Coast"],
    };
    state.schema = {
      comparisonDimensions: [],
      fields: {
        Births: { kind: "measure", label: "Births", chartRoles: ["yMeasure"] },
      },
    };

    render(<AppearanceSection />);

    expect(screen.queryByText("Comparison appearance")).not.toBeInTheDocument();
    expect(screen.queryByText("cmp_locations")).not.toBeInTheDocument();
    expect(screen.getByText("Automatic PPIC categorical · 2 groups")).toBeInTheDocument();
  });

  it("does not show the legacy Color binding or watermark toggle in v3", () => {
    state.config = {
      version: 3,
      question: {
        source: "DoF P-3",
        outcome: { measureId: "Population" },
        comparisons: [],
      },
      presentation: {
        chartType: "line",
        appearance: {},
        labels: {},
        bindings: {},
      },
    };
    render(<AppearanceSection />);

    expect(screen.queryByLabelText(/^Color$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/PPIC watermark/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Color palette/i)).toBeInTheDocument();
  });

  it.each(["line", "bar", "scatter", "bubble"])(
    "shows the %s Color binding in Appearance",
    (chartType) => {
      state.config = config(chartType);
      render(<AppearanceSection />);
      expect(screen.getByLabelText(/^Color$/i)).toBeInTheDocument();
    },
  );

  it("uses an on/off switch for line markers", () => {
    // Renderer plan D: markers are off unless saved "on" (the style guide
    // avoids markers on lines), so the old seeded default "auto" reads as off.
    state.config = config("line", { markerMode: "on" });
    const first = render(<AppearanceSection />);
    const markers = screen.getByRole("switch", { name: "Markers" });

    expect(markers).toBeChecked();
    fireEvent.click(markers);
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "markerMode",
      value: "off",
    });

    first.unmount();
    state.dispatch.mockClear();
    state.config = config("line", { markerMode: "auto" });
    render(<AppearanceSection />);
    fireEvent.click(screen.getByRole("switch", { name: "Markers" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "markerMode",
      value: "on",
    });
  });

  it("does not move other chart types' Color bindings into Appearance", () => {
    state.config = config("pie");
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/^Color$/i)).not.toBeInTheDocument();
  });

  it("keeps Color's field filtering and binding dispatch behavior", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    await user.click(screen.getByLabelText(/^Color$/i));
    expect(screen.getByRole("option", { name: "Region" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Value" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Region" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_BINDING",
      role: "color",
      field: "Region",
    });
  });

  it("offers Orientation only for bar charts (renderer plan E)", () => {
    const line = render(<AppearanceSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
    line.unmount();
    // A version 3 bar: the version 3 Outcome section dropped Orientation, so it
    // came back here. The older editor still asks for it in OutcomeSection, and
    // showing it in both would draw two Orientation controls there.
    state.config = { version: 3, question: { comparisons: [] }, presentation: { chartType: "bar", labels: {}, appearance: {}, bindings: {} } };
    render(<AppearanceSection />);
    expect(screen.getByLabelText(/orientation/i)).toBeInTheDocument();
  });

  it.each([
    ["forest", "Interval ends"],
    ["choroplethMap", "Color scale"],
    ["dotPlot", "Show point values"],
  ])("shows %s extras only for that chart and below Footnote", (chartType, extra) => {
    // Anchored: "Color scale" is a prefix of the Invert color scale switch that
    // Workstream C added beside it, and an unanchored regex matches both.
    const exact = new RegExp(`^${extra}$`, "i");
    const { unmount } = render(<AppearanceSection />);
    expect(screen.queryByLabelText(exact)).not.toBeInTheDocument();
    unmount();
    state.config = config(chartType);
    render(<AppearanceSection />);
    const labels = labelOrder();
    expect(screen.getByLabelText(exact)).toBeInTheDocument();
    expect(labels.indexOf(extra)).toBeGreaterThan(labels.indexOf("Footnote"));
  });

  it.each(["line", "bar", "dumbbell", "dotPlot", "forest", "scatter", "bubble"])(
    "offers Hide grid lines below Footnote on %s and saves it",
    async (chartType) => {
      const user = userEvent.setup();
      state.config = config(chartType);
      render(<AppearanceSection />);
      const labels = labelOrder();
      expect(labels.indexOf("Hide grid lines")).toBeGreaterThan(labels.indexOf("Footnote"));
      const toggle = screen.getByLabelText("Hide grid lines");
      expect(toggle).not.toBeChecked();
      await user.click(toggle);
      expect(state.dispatch).toHaveBeenCalledWith({
        type: "SET_APPEARANCE",
        key: "hideGridLines",
        value: true,
      });
    },
  );

  it.each(["heatmap", "pie", "choroplethMap", "symbolMap"])(
    "offers no Hide grid lines on %s, which draws no grid",
    (chartType) => {
      state.config = config(chartType);
      render(<AppearanceSection />);
      expect(screen.queryByLabelText("Hide grid lines")).not.toBeInTheDocument();
    },
  );

  it("indents First Line Only beneath the active Range point-value toggle", () => {
    state.config = config("dumbbell", { showPointLabels: true });
    render(<AppearanceSection />);
    const labels = labelOrder();
    const firstLineToggle = screen.getByLabelText("First Line Only");

    expect(labels.indexOf("First Line Only")).toBe(
      labels.indexOf("Show point values") + 1,
    );
    expect(firstLineToggle.closest("div")).toHaveClass("pl-4");
    fireEvent.click(firstLineToggle);
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "pointLabelsFirstLineOnly",
      value: true,
    });
  });

  it("hides First Line Only until Range point values are enabled", () => {
    state.config = config("dumbbell", { showPointLabels: false });
    render(<AppearanceSection />);

    expect(screen.queryByLabelText("First Line Only")).not.toBeInTheDocument();
  });

  it("moves Hide X-Axis to Advanced Mode and keeps point values in basic mode", () => {
    state.config = config("dumbbell");
    const basic = renderBasic();

    expect(screen.queryByLabelText("Hide X-Axis")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Show point values")).toBeInTheDocument();
    basic.unmount();

    renderAdvanced();
    expect(screen.getByLabelText("Hide X-Axis")).toBeInTheDocument();
  });

  it("writes Hide X-Axis to the canonical hideXAxis setting", () => {
    state.config = config("dumbbell", { showValueAxis: true });
    renderAdvanced();
    const toggle = screen.getByLabelText("Hide X-Axis");

    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "hideXAxis",
      value: true,
    });
  });

  it("shows Center reference for a bar with appearance.diverging on, below Footnote (Workstream B)", () => {
    const { unmount } = render(<AppearanceSection />);
    expect(screen.queryByLabelText(/Center reference/i)).not.toBeInTheDocument();
    unmount();
    state.config = config("bar", { diverging: true });
    render(<AppearanceSection />);
    const labels = labelOrder();
    expect(screen.getByLabelText(/Center reference/i)).toBeInTheDocument();
    expect(labels.indexOf("Center reference")).toBeGreaterThan(labels.indexOf("Footnote"));
  });

  it("hides Center reference for a plain bar (diverging off)", () => {
    state.config = config("bar", { diverging: false });
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/Center reference/i)).not.toBeInTheDocument();
  });

  it("shows the reference line inputs only for a diverging bar", () => {
    for (const chartType of ["bar", "line"]) {
      state.config = config(chartType);
      const { unmount } = render(<AppearanceSection />);
      expect(screen.queryByLabelText(/^Reference line$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Reference line label/i)).not.toBeInTheDocument();
      unmount();
    }

    state.config = config("bar", { diverging: true });
    render(<AppearanceSection />);
    expect(screen.getByLabelText(/^Reference line$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reference line label/i)).toBeInTheDocument();
  });

  it("writes null when the reference line input is cleared", () => {
    state.config = config("bar", { diverging: true, center: 1, referenceValue: 2 });
    render(<AppearanceSection />);
    fireEvent.change(screen.getByLabelText(/^Reference line$/i), {
      target: { value: "" },
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "referenceValue",
      value: null,
    });
  });

  // Axis range (Advanced mode, 2026-10-12) replaced the diverging bar's own
  // "Value axis range (manual)", which the ranged-axis control now shows.
  it("shows a diverging bar's saved value range in the horizontal axis range", () => {
    state.config = config("bar", { diverging: true, valueRange: [0, 2] });
    renderAdvanced();
    expect(screen.queryByText("Value axis range (manual)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Horizontal axis minimum")).toHaveValue(0);
    expect(screen.getByLabelText("Horizontal axis maximum")).toHaveValue(2);
  });

  it("moves a diverging bar's saved value range onto the axis range when edited", () => {
    state.config = config("bar", { diverging: true, valueRange: [0, 2] });
    renderAdvanced();
    fireEvent.change(screen.getByLabelText("Horizontal axis maximum"), { target: { value: "3" } });
    expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "horizontalAxisRange", value: [0, 3] });
    expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "valueRange", value: undefined });
  });

  it("offers ramp palettes on a choropleth and categorical palettes on a line", async () => {
    const user = userEvent.setup();
    state.config = config("choroplethMap");
    const { unmount } = render(<AppearanceSection />);
    await user.click(screen.getByLabelText(/color palette/i));
    // The official shade families (guide p.13), not the categorical cycles.
    expect(screen.getByRole("option", { name: "Green · sequential" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Colorblind-safe" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Teal · Data" })).not.toBeInTheDocument();
    unmount();

    state.config = config("line");
    render(<AppearanceSection />);
    await user.click(screen.getByLabelText(/color palette/i));
    expect(screen.getByRole("option", { name: "Colorblind-safe" })).toBeInTheDocument();
  });

  it("hides the custom diverging picker out of advanced mode", () => {
    state.config = config("choroplethMap", { colorScale: "diverging" });
    renderBasic();
    expect(
      screen.queryByLabelText(/custom diverging colors/i),
    ).not.toBeInTheDocument();
  });

  it("shows the custom diverging picker on a diverging scale in advanced mode", () => {
    state.config = config("choroplethMap", { colorScale: "diverging" });
    renderAdvanced();
    expect(screen.getByLabelText(/custom diverging colors/i)).toBeInTheDocument();
  });

  it("offers no custom diverging picker on a sequential scale", () => {
    // The key composes a diverging ramp; there is nothing for it to do here.
    state.config = config("choroplethMap", { colorScale: "sequential" });
    renderAdvanced();
    expect(
      screen.queryByLabelText(/custom diverging colors/i),
    ).not.toBeInTheDocument();
  });

  it("seeds three published shades when the custom picker is switched on", () => {
    state.config = config("choroplethMap", { colorScale: "diverging" });
    renderAdvanced();
    fireEvent.click(screen.getByLabelText(/custom diverging colors/i));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "divergingStops",
      value: ["#8F3811", "#ECE8E7", "#0F4880"],
    });
  });

  it("names each stop by its position, not its index", () => {
    state.config = config("choroplethMap", {
      colorScale: "diverging",
      divergingStops: ["#8F3811", "#ECE8E7", "#0F4880"],
    });
    renderAdvanced();
    for (const position of ["bottom", "middle", "upper"]) {
      expect(
        screen.getByLabelText(new RegExp(`choose the ${position} color`, "i")),
      ).toBeInTheDocument();
    }
  });

  it("shows the gradient toggle only on a symbol map", () => {
    for (const chartType of ["line", "choroplethMap", "heatmap"]) {
      state.config = config(chartType);
      const { unmount } = render(<AppearanceSection />);
      expect(screen.queryByLabelText(/color gradient/i)).not.toBeInTheDocument();
      unmount();
    }
    state.config = config("symbolMap");
    render(<AppearanceSection />);
    expect(screen.getByLabelText(/color gradient/i)).toBeInTheDocument();
  });

  it("shows the invert toggle only when a ramp is in play", () => {
    for (const chartType of ["heatmap", "choroplethMap"]) {
      state.config = config(chartType);
      const { unmount } = render(<AppearanceSection />);
      expect(screen.getByLabelText(/invert color scale/i)).toBeInTheDocument();
      unmount();
    }

    state.config = config("line");
    const line = render(<AppearanceSection />);
    expect(screen.queryByLabelText(/invert color scale/i)).not.toBeInTheDocument();
    line.unmount();

    state.config = config("symbolMap", { symbolGradient: false });
    const flat = render(<AppearanceSection />);
    expect(screen.queryByLabelText(/invert color scale/i)).not.toBeInTheDocument();
    flat.unmount();

    state.config = config("symbolMap", { symbolGradient: true });
    render(<AppearanceSection />);
    expect(screen.getByLabelText(/invert color scale/i)).toBeInTheDocument();
  });

  it("clamps spacing to 0-100 and Auto clears the appearance value", () => {
    state.config = config("line", { horizontalLinePadding: 20 });
    render(<AppearanceSection />);
    fireEvent.change(screen.getByLabelText(/horizontal line spacing/i), {
      target: { value: "150" },
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "horizontalLinePadding",
      value: 100,
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Auto" })[0]);
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "horizontalLinePadding",
      value: undefined,
    });
  });

  it("offers data-unit tick increments for temporal and measure axes", async () => {
    const user = userEvent.setup();
    state.schema = {
      ...state.schema,
      fields: {
        ...state.schema.fields,
        Year: { kind: "temporal", label: "Year" },
        Population: { kind: "measure", label: "Total population" },
      },
    };
    state.config = {
      ...config("line"),
      bindings: { x: "Year", y: "Population" },
      axisRanges: {
        horizontal: { min: 2020, max: 2025 },
        vertical: { min: 10, max: 70 },
      },
    };
    render(<AppearanceSection />);

    const horizontal = screen.getByLabelText(
      "Horizontal tick increment (Year)",
    );
    const vertical = screen.getByLabelText(
      "Vertical tick increment (Total population)",
    );
    await user.click(horizontal);
    await user.click(screen.getByRole("option", { name: "2" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "horizontalTickIncrement",
      value: 2,
    });
    await user.click(vertical);
    await user.click(screen.getByRole("option", { name: "10" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "verticalTickIncrement",
      value: 10,
    });
  });

  it("greys out tick increments when the plotted range exceeds 75 units", () => {
    state.schema = {
      ...state.schema,
      fields: {
        ...state.schema.fields,
        Year: { kind: "temporal", label: "Year" },
        Population: { kind: "measure", label: "Total population" },
      },
    };
    state.config = {
      ...config("line"),
      bindings: { x: "Year", y: "Population" },
      axisRanges: {
        horizontal: { min: 2020, max: 2025 },
        vertical: { min: 0, max: 1_000_000 },
      },
    };
    render(<AppearanceSection />);

    expect(
      screen.getByLabelText("Horizontal tick increment (Year)"),
    ).toBeEnabled();
    expect(
      screen.getByLabelText("Vertical tick increment (Total population)"),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Vertical tick increment unavailable when the plotted range exceeds 75 units.",
      ),
    ).toBeInTheDocument();
  });

  describe("axis range", () => {
    it.each([
      ["line", {}, ["Vertical"]],
      ["bar", {}, ["Vertical"]],
      ["bar", { orientation: "horizontal" }, ["Horizontal"]],
      ["dumbbell", {}, ["Horizontal"]],
      ["dotPlot", {}, ["Horizontal"]],
      ["forest", {}, ["Horizontal"]],
      ["scatter", {}, ["Horizontal", "Vertical"]],
      ["bubble", {}, ["Horizontal", "Vertical"]],
      ["pie", {}, []],
      ["heatmap", {}, []],
    ])("offers a range for each numeric axis a %s draws (%j)", (type, appearance, axes) => {
      state.config = config(type, appearance);
      renderAdvanced();
      for (const axis of ["Horizontal", "Vertical"]) {
        const offered = axes.includes(axis);
        for (const end of ["minimum", "maximum"]) {
          if (offered) expect(screen.getByLabelText(`${axis} axis ${end}`)).toBeInTheDocument();
          else expect(screen.queryByLabelText(`${axis} axis ${end}`)).not.toBeInTheDocument();
        }
      }
    });

    it("is Advanced Mode only", () => {
      state.config = config("scatter");
      renderBasic();
      expect(screen.queryByLabelText(/axis (minimum|maximum)$/)).not.toBeInTheDocument();
    });

    it("saves each end, and clears the setting once both are blank", () => {
      state.config = config("line", { verticalAxisRange: [null, 100] });
      renderAdvanced();
      expect(screen.getByLabelText("Vertical axis minimum")).toHaveValue(null);
      expect(screen.getByLabelText("Vertical axis maximum")).toHaveValue(100);
      fireEvent.change(screen.getByLabelText("Vertical axis minimum"), { target: { value: "-5" } });
      expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "verticalAxisRange", value: [-5, 100] });
      fireEvent.change(screen.getByLabelText("Vertical axis maximum"), { target: { value: "" } });
      expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "verticalAxisRange", value: undefined });
    });

    it("explains a minimum at or above the maximum", () => {
      state.config = config("line", { verticalAxisRange: [50, 10] });
      renderAdvanced();
      expect(screen.getByText(/minimum below the maximum/i)).toBeInTheDocument();
    });

    it("warns that bars cut short of zero exaggerate differences", () => {
      state.config = config("bar", { verticalAxisRange: [10, 100] });
      const { unmount } = renderAdvanced();
      expect(screen.getByText(/bars normally start at zero/i)).toBeInTheDocument();
      unmount();
      state.config = config("line", { verticalAxisRange: [10, 100] });
      renderAdvanced();
      expect(screen.queryByText(/bars normally start at zero/i)).not.toBeInTheDocument();
    });

    it("sizes the tick increment check by the axis range", () => {
      state.schema = {
        ...state.schema,
        fields: { ...state.schema.fields, Population: { kind: "measure", label: "Total population" } },
      };
      state.config = {
        ...config("line", { verticalAxisRange: [0, 50] }),
        bindings: { y: "Population" },
        axisRanges: { vertical: { min: 0, max: 1_000_000 } },
      };
      renderAdvanced();
      expect(screen.getByLabelText("Vertical tick increment (Total population)")).toBeEnabled();
    });
  });

  it("includes a bar's zero baseline when checking the plotted range", () => {
    state.config = {
      ...config("bar", { orientation: "vertical" }),
      bindings: { category: "Region", y: "Value" },
      axisRanges: { vertical: { min: 1_000_000, max: 1_000_010 } },
    };
    render(<AppearanceSection />);

    expect(
      screen.getByLabelText("Vertical tick increment (Value)"),
    ).toBeDisabled();
  });

  it("sets a number type independently for each measure axis", async () => {
    const user = userEvent.setup();
    state.schema = {
      ...state.schema,
      fields: {
        ...state.schema.fields,
        Income: { kind: "measure", label: "Median income" },
        Rate: { kind: "measure", label: "Employment rate" },
      },
    };
    state.config = {
      ...config("scatter"),
      bindings: { x: "Income", y: "Rate" },
      axisRanges: {
        horizontal: { min: 10, max: 70 },
        vertical: { min: 0, max: 50 },
      },
    };
    render(<AppearanceSection />);

    const horizontal = screen.getByLabelText(
      "Horizontal number type (Median income)",
    );
    const vertical = screen.getByLabelText(
      "Vertical number type (Employment rate)",
    );
    await user.click(horizontal);
    await user.click(screen.getByRole("option", { name: "USD ($)" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "horizontalNumberType",
      value: "usd",
    });
    await user.click(vertical);
    await user.click(
      screen.getByRole("option", { name: "Percentage / rate (%)" }),
    );
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "verticalNumberType",
      value: "percent",
    });
    expect(
      screen.getByText(
        "Number types also apply when Show point values is enabled.",
      ),
    ).toBeInTheDocument();
  });

  it("does not offer number types for temporal or text axes", () => {
    state.schema = {
      ...state.schema,
      fields: {
        ...state.schema.fields,
        Year: { kind: "temporal", label: "Year" },
        Population: { kind: "measure", label: "Total population" },
      },
    };
    state.config = {
      ...config("line"),
      bindings: { x: "Year", y: "Population" },
      axisRanges: {
        horizontal: { min: 2020, max: 2025 },
        vertical: { min: 0, max: 50 },
      },
    };
    render(<AppearanceSection />);

    expect(
      screen.queryByLabelText(/Horizontal number type/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Vertical number type (Total population)"),
    ).toBeInTheDocument();
  });

  it("hides tick increments for text axes and follows bar orientation", () => {
    state.config = {
      ...config("heatmap"),
      bindings: { x: "Region", y: "Region", color: "Value" },
    };
    const textAxes = render(<AppearanceSection />);
    expect(screen.queryByLabelText(/tick increment/i)).not.toBeInTheDocument();
    textAxes.unmount();

    state.config = {
      ...config("bar", { orientation: "vertical" }),
      bindings: { category: "Region", y: "Value" },
      axisRanges: { vertical: { min: 0, max: 50 } },
    };
    const verticalBar = render(<AppearanceSection />);
    expect(
      screen.getByLabelText("Vertical tick increment (Value)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Horizontal tick increment/i),
    ).not.toBeInTheDocument();
    verticalBar.unmount();

    state.config = {
      ...state.config,
      appearance: { orientation: "horizontal" },
      axisRanges: { horizontal: { min: 0, max: 50 } },
    };
    render(<AppearanceSection />);
    expect(
      screen.getByLabelText("Horizontal tick increment (Value)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Vertical tick increment/i),
    ).not.toBeInTheDocument();
  });

  it("edits group and variable alignment while hiding indentation", async () => {
    const user = userEvent.setup();
    state.config = {
      ...config("forest"),
      bindings: { group: "Section" },
    };
    render(<AppearanceSection />);

    expect(screen.getByLabelText("Group alignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Variable alignment")).toBeInTheDocument();
    expect(screen.queryByLabelText("Group indentation (px)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Variable indentation (px)")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Group alignment"));
    await user.click(screen.getByRole("option", { name: "Center" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "groupLabelAlignment",
      value: "center",
    });

    // Left is the default now (owner, 2026-09-30), so choose Right.
    await user.click(screen.getByLabelText("Variable alignment"));
    await user.click(screen.getByRole("option", { name: "Right" }));
    expect(state.dispatch).toHaveBeenCalledWith({ type: "SET_APPEARANCE", key: "variableLabelAlignment", value: "right" });
  });

  it("shows grouped row label controls only where row grouping applies", () => {
    state.config = {
      ...config("bar", { orientation: "vertical" }),
      bindings: { group: "Section" },
    };
    const vertical = render(<AppearanceSection />);
    expect(screen.queryByLabelText("Group alignment")).not.toBeInTheDocument();
    vertical.unmount();

    state.config = {
      ...config("bar", { orientation: "horizontal" }),
      bindings: { group: "Section" },
    };
    render(<AppearanceSection />);
    expect(screen.getByLabelText("Group alignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Variable alignment")).toBeInTheDocument();
  });

  it("sets and clears a forest plot's value-axis center", () => {
    state.config = config("forest");
    const first = render(<AppearanceSection />);
    const center = screen.getByLabelText("Value axis center");

    expect(center).toHaveValue(null);
    fireEvent.change(center, { target: { value: "1" } });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "center",
      value: 1,
    });

    first.unmount();
    state.config = config("forest", { center: 1 });
    render(<AppearanceSection />);
    fireEvent.change(screen.getByLabelText("Value axis center"), {
      target: { value: "" },
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "center",
      value: null,
    });
  });
});

describe("renderer plan removed and hidden controls", () => {
  it.each(["Tooltip template", "Group indentation (px)", "Variable indentation (px)"])("does not show %s", label => {
    state.config = { version: 3, question: { comparisons: [] }, presentation: { chartType: "dumbbell", labels: {}, appearance: {}, bindings: { group: "Location" } } };
    state.schema = { fields: {} };
    renderAdvanced();
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  });
  it("writes Hide X-Axis to hideXAxis in a version 3 view", () => {
    state.config = { version: 3, question: { comparisons: [] }, presentation: { chartType: "dumbbell", labels: {}, appearance: {}, bindings: { group: "Location" } } };
    state.schema = { fields: {} };
    state.dispatch.mockClear();
    renderAdvanced();
    fireEvent.click(screen.getByLabelText("Hide X-Axis"));
    expect(state.dispatch).toHaveBeenLastCalledWith({ type: "SET_APPEARANCE", key: "hideXAxis", value: true });
  });
});
