/**
 * UI Kit chart specimens draw with the production renderers (renderer plan O):
 * every example goes through buildChartModel, ChartFrame, and ChartRenderer,
 * so the UI Kit shows what editor users get, never a hand-built Plotly figure.
 */

import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardsShowcase } from "@/components/ui-kit/CardsShowcase";
import { GraphsShowcase } from "@/components/ui-kit/GraphsShowcase";

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target) {
        this.callback([
          {
            target,
            contentRect: { width: 600, height: 320 },
            contentBoxSize: [{ inlineSize: 600, blockSize: 320 }],
          },
        ]);
      }
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(() => vi.unstubAllGlobals());

function drawnCharts(container) {
  return [...container.querySelectorAll("[data-renderer]")];
}

describe("UI Kit specimens", () => {
  it("draws every Example Graphs specimen with visx, without an error", () => {
    const { container } = render(<GraphsShowcase />);
    const charts = drawnCharts(container);
    expect(charts).toHaveLength(4);
    for (const chart of charts) expect(chart).toHaveAttribute("data-renderer", "visx");
    expect(container).not.toHaveTextContent("Visualization could not be loaded");
  });

  it("marks every Example Graphs specimen drawn", () => {
    const { container } = render(<GraphsShowcase />);
    for (const chart of drawnCharts(container)) {
      expect(chart).toHaveAttribute("data-chart-ready", "true");
    }
  });

  it("lists the drawn key's colors under the range and line specimens", () => {
    const { getAllByText } = render(<GraphsShowcase />);
    expect(getAllByText("Owners").length).toBeGreaterThan(0);
    expect(getAllByText("Renters").length).toBeGreaterThan(0);
    expect(getAllByText("2014").length).toBeGreaterThan(0);
    expect(getAllByText("2024").length).toBeGreaterThan(0);
  });

  it("draws the Cards & Charts trend with visx, without an error", () => {
    const { container } = render(<CardsShowcase />);
    const charts = drawnCharts(container);
    expect(charts).toHaveLength(1);
    expect(charts[0]).toHaveAttribute("data-renderer", "visx");
    expect(container).not.toHaveTextContent("Visualization could not be loaded");
  });

  it("cites the specimens as illustrative data", () => {
    const { container } = render(<CardsShowcase />);
    expect(container.querySelector('[data-frame-part="source"]')).toHaveTextContent(
      /Illustrative data/,
    );
  });
});
