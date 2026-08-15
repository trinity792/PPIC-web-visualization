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

  it("moves the per-series legend and color list to Advanced Mode", () => {
    state.config = { ...config(), seriesNames: ["California"] };
    const basic = renderBasic();

    expect(screen.getByLabelText(/color palette/i)).toBeInTheDocument();
    expect(screen.queryByText("Legend items")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Legend label for California"),
    ).not.toBeInTheDocument();
    basic.unmount();

    renderAdvanced();
    expect(screen.getByText("Legend items")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Legend label for California"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose a color for California" }),
    ).toBeInTheDocument();
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
    state.config = config("line", { markerMode: "auto" });
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
    state.config = config("line", { markerMode: "off" });
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

  it("no longer offers Orientation — it moved to OutcomeSection (Workstream A)", () => {
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
    state.config = config("bar");
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
    state.config = config("bar", { diverging: true });
    render(<AppearanceSection />);
    expect(screen.queryByLabelText(/orientation/i)).not.toBeInTheDocument();
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

  it("inverts Hide X-Axis into the existing showValueAxis setting", () => {
    state.config = config("dumbbell", { showValueAxis: true });
    renderAdvanced();
    const toggle = screen.getByLabelText("Hide X-Axis");

    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "showValueAxis",
      value: false,
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

  it("shows the value axis range beside the reference line", () => {
    state.config = config("bar", { diverging: true, trackRail: false });
    render(<AppearanceSection />);
    const labels = labelOrder();
    const reference = labels.indexOf("Reference line");
    const range = labels.indexOf("Value axis range (manual)");
    expect(reference).toBeGreaterThanOrEqual(0);
    expect(range).toBeGreaterThan(reference);
    expect(screen.getByLabelText("Range minimum")).toBeInTheDocument();
    expect(screen.getByLabelText("Range maximum")).toBeInTheDocument();
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

  it("edits group and variable alignment and indentation independently", async () => {
    const user = userEvent.setup();
    state.config = {
      ...config("forest"),
      bindings: { group: "Section" },
    };
    render(<AppearanceSection />);

    expect(screen.getByLabelText("Group alignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Variable alignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Group indentation (px)")).toHaveValue(0);
    expect(screen.getByLabelText("Variable indentation (px)")).toHaveValue(0);

    await user.click(screen.getByLabelText("Group alignment"));
    await user.click(screen.getByRole("option", { name: "Center" }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "groupLabelAlignment",
      value: "center",
    });

    fireEvent.change(screen.getByLabelText("Variable indentation (px)"), {
      target: { value: "24" },
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_APPEARANCE",
      key: "variableLabelIndent",
      value: 24,
    });
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
