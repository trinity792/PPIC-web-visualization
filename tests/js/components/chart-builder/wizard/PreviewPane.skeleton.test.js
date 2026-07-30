/** The idle placeholder shown before a deferred workbench chart is armed. */

/* eslint-disable react/prop-types */

import React from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHART_TYPE_IDS } from "@/lib/visualization/chartRegistry";

const state = vi.hoisted(() => ({ previews: [] }));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({ workspace: { layout: "1x1" }, dispatch: vi.fn() }),
}));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  usePreview: () => ({ previews: state.previews, setGraphDiv: vi.fn() }),
}));
vi.mock("@/components/charts/PlotlyChart", () => ({
  default: () => <div data-testid="plotly" />,
}));

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";

function preview(overrides) {
  return {
    id: "chart-1",
    name: "Chart 1",
    active: true,
    config: { chartType: "line", filters: {}, bindings: {}, appearance: {}, data: {} },
    status: "idle",
    result: null,
    error: null,
    notice: null,
    plotly: null,
    renderError: null,
    ...overrides,
  };
}

describe("PreviewPane idle skeleton", () => {
  beforeEach(() => {
    state.previews = [preview()];
  });

  it("shows a chart-shaped placeholder with a prompt instead of a spinner", () => {
    render(<PreviewPane />);

    expect(
      screen.getByRole("status", {
        name: /adjust a setting to build this chart/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/choose your settings to build this chart/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading visualization/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("plotly")).not.toBeInTheDocument();
  });

  it("gives way to the loading state once a request is in flight", () => {
    state.previews = [preview({ status: "loading" })];
    render(<PreviewPane />);

    expect(screen.getByText(/loading visualization/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/choose your settings to build this chart/i),
    ).not.toBeInTheDocument();
  });

  it("gives way to the chart once data is ready", () => {
    state.previews = [preview({ status: "ready", plotly: { data: [], layout: {} } })];
    render(<PreviewPane />);

    expect(screen.getByTestId("plotly")).toBeInTheDocument();
    expect(
      screen.queryByText(/choose your settings to build this chart/i),
    ).not.toBeInTheDocument();
  });

  it("names the unset encodings when the chart is unconfigured", () => {
    state.previews = [
      preview({
        status: "unconfigured",
        config: {
          chartType: "line",
          filters: {},
          bindings: {},
          appearance: {},
          data: {},
          validation: [
            { level: "error", code: "MISSING_REQUIRED_ROLE", role: "x", message: "x" },
            { level: "error", code: "MISSING_REQUIRED_ROLE", role: "y", message: "y" },
          ],
        },
      }),
    ];
    render(<PreviewPane />);

    // "y" reads as "Outcome" for line (Workstream A): the chart type folds its
    // axis choice into a single "what is plotted" question, so the skeleton's
    // caption follows `roleLabel` for free.
    expect(
      screen.getByText("Set X-Axis and Outcome to build this chart."),
    ).toBeInTheDocument();
    // The skeleton, not an error card: an unset encoding is work in progress.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plotly")).not.toBeInTheDocument();
  });

  it("falls back to the generic prompt when no role is named", () => {
    state.previews = [
      preview({
        status: "unconfigured",
        config: {
          chartType: "line",
          filters: {},
          bindings: {},
          appearance: {},
          data: {},
          validation: [],
        },
      }),
    ];
    render(<PreviewPane />);

    expect(
      screen.getByText(/choose your settings to build this chart/i),
    ).toBeInTheDocument();
  });
});

/**
 * Workstream C: the skeleton draws a shape per chart type instead of always
 * drawing bars. Expectations are hand-written here, independent of
 * chartRegistry.js's own `skeletonShape` values, so the test exercises the
 * registry rather than restating it (the mistake the 2026-07-30 audit flagged
 * for a different assertion — see chartRegistry.catalog.test.js).
 */
describe("PreviewPane skeleton shapes", () => {
  const EXPECTED_SHAPE = {
    line: "line",
    bar: "bars",
    divergingBar: "bars",
    choroplethMap: "map",
    heatmap: "grid",
    dumbbell: "gantt",
    dotPlot: "scatter",
    forest: "ganttNoAxes",
    scatter: "scatter",
    bubble: "scatter",
    pie: "pie",
    symbolMap: "map",
    dataTable: "table",
  };

  function renderIdle(chartType, appearance = {}) {
    state.previews = [
      preview({
        status: "idle",
        config: { chartType, filters: {}, bindings: {}, appearance, data: {} },
      }),
    ];
    return render(<PreviewPane />);
  }

  it("covers every registered chart type", () => {
    expect(Object.keys(EXPECTED_SHAPE).sort()).toEqual([...CHART_TYPE_IDS].sort());
  });

  it.each(Object.entries(EXPECTED_SHAPE))(
    "draws the %s shape for %s, announced the same way as always",
    (chartType, shape) => {
      renderIdle(chartType);
      expect(
        document.querySelector(`[data-skeleton-shape="${shape}"]`),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("status", { name: /adjust a setting to build this chart/i }),
      ).toBeInTheDocument();
    },
  );

  it("flips a horizontal bar to barsHorizontal", () => {
    renderIdle("bar", { orientation: "horizontal" });
    expect(
      document.querySelector('[data-skeleton-shape="barsHorizontal"]'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-skeleton-shape="bars"]')).not.toBeInTheDocument();
  });

  it("leaves a vertical (or unset-orientation) bar drawing bars", () => {
    renderIdle("bar");
    expect(document.querySelector('[data-skeleton-shape="bars"]')).toBeInTheDocument();
  });

  it("falls back to bars for an unknown chart type instead of throwing", () => {
    expect(() => renderIdle("notAChart")).not.toThrow();
    expect(document.querySelector('[data-skeleton-shape="bars"]')).toBeInTheDocument();
    // The fallback must draw, not just carry the attribute — a shape with no
    // icon behind it would render an empty box.
    expect(document.querySelector('[data-skeleton-shape="bars"] svg')).toBeInTheDocument();
  });

  it("draws every non-map shape as a single scaled-up icon", () => {
    for (const [chartType, shape] of Object.entries(EXPECTED_SHAPE)) {
      if (shape === "map") continue;
      cleanup();
      renderIdle(chartType);
      const svgs = document.querySelectorAll(`[data-skeleton-shape="${shape}"] svg`);
      expect(svgs, `chart type: ${chartType}`).toHaveLength(1);
      // Lucide renders stroke art on a 24-unit canvas; the California map does
      // not, which is what the next test pins down.
      expect(svgs[0].getAttribute("viewBox"), `chart type: ${chartType}`).toBe(
        "0 0 24 24",
      );
    }
  });

  it("draws the map shape as the California county outline, not an icon", () => {
    renderIdle("choroplethMap");
    const svg = document.querySelector('[data-skeleton-shape="map"] svg');
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute("viewBox")).toBe("0 0 810 810");
    // All 58 counties, so the silhouette reads as California rather than a blob.
    expect(svg.querySelectorAll("path")).toHaveLength(58);
  });
});
