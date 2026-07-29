/** The idle placeholder shown before a deferred workbench chart is armed. */

/* eslint-disable react/prop-types */

import React from "react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

    expect(
      screen.getByText("Set X-Axis and Y-Axis to build this chart."),
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
