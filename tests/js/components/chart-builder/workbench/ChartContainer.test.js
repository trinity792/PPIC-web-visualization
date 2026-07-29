/** Phases 2-3 chart card, view toggle, and preview-state passthrough. */

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  preview: { status: "ready", result: { records: [{ Location: "Alameda" }] } },
  loadFullTable: vi.fn(),
  originalTable: vi.fn(),
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => ({
    config: { chartType: "bar", filters: {}, bindings: {}, appearance: {}, data: {} },
    schema: { id: "widgets", label: "Widgets", apiPath: "/api/widgets", fields: {} },
  }),
}));
vi.mock("@/components/chart-builder/wizard/PreviewContext", () => ({
  usePreview: () => ({
    activePreview: state.preview,
    preview: state.preview,
    status: state.preview.status,
    result: state.preview.result,
  }),
}));
vi.mock("@/components/chart-builder/wizard/PreviewPane", () => ({
  default: () => <div data-testid="chart-pane">Chart {state.preview.status}</div>,
}));
vi.mock("@/components/charts/DataTableView", () => ({
  default: ({ table, rows }) => (
    <div data-testid="data-table">Table {(table?.rows || rows || []).length}</div>
  ),
}));
vi.mock("@/components/chart-builder/chartData", () => ({
  loadFullTable: state.loadFullTable,
}));
vi.mock("@/lib/export/exportTable", () => ({ originalTable: state.originalTable }));
vi.mock("@/components/chart-builder/workbench/ChartContainerFooter", () => ({
  default: ({ viewMode, onViewModeChange }) => (
    <footer>
      <button
        type="button"
        aria-pressed={viewMode === "chart"}
        onClick={() => onViewModeChange("chart")}
      >
        View Chart
      </button>
      <button
        type="button"
        aria-pressed={viewMode === "data"}
        onClick={() => onViewModeChange("data")}
      >
        View Data
      </button>
    </footer>
  ),
}));

import ChartContainer from "@/components/chart-builder/workbench/ChartContainer";

const FULL_RECORDS = [
  { Location: "Alameda", Year: 2025, Value: 1 },
  { Location: "Butte", Year: 2025, Value: 2 },
];

describe("ChartContainer", () => {
  beforeEach(() => {
    state.preview = {
      status: "ready",
      result: { records: [{ Location: "Alameda" }] },
    };
    state.loadFullTable.mockReset();
    state.loadFullTable.mockResolvedValue({ records: FULL_RECORDS });
    state.originalTable.mockReset();
    state.originalTable.mockReturnValue({
      filename: "original-data.csv",
      columns: [{ name: "Location" }, { name: "Year" }, { name: "Value" }],
      rows: FULL_RECORDS.map((row) => Object.values(row)),
    });
  });

  it("renders schema.label as the centered brand-underlined title", () => {
    render(<ChartContainer />);
    const title = screen.getByRole("heading", { name: "Widgets" });
    expect(title).toHaveClass("text-center");
    expect((title.querySelector("span") || title).className).toMatch(/border|underline/);
  });

  it("switches between the chart and the dataset with pressed state", async () => {
    const user = userEvent.setup();
    render(<ChartContainer />);

    expect(screen.getByTestId("chart-pane")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Chart" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "View Data" }));
    expect(screen.queryByTestId("chart-pane")).not.toBeInTheDocument();
    expect(await screen.findByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Data" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "View Chart" }));
    expect(screen.getByTestId("chart-pane")).toBeInTheDocument();
  });

  it("shows the entire cleaned dataset, not the chart's narrowed table", async () => {
    const user = userEvent.setup();
    render(<ChartContainer />);
    await user.click(screen.getByRole("button", { name: "View Data" }));

    await waitFor(() => expect(state.loadFullTable).toHaveBeenCalled());
    expect(state.originalTable).toHaveBeenCalledWith(
      expect.objectContaining({ chartType: "bar" }),
      { response: { records: FULL_RECORDS } },
    );
    expect(await screen.findByTestId("data-table")).toHaveTextContent("Table 2");
  });

  it("does not fetch the dataset until the data view is opened, then caches it", async () => {
    const user = userEvent.setup();
    render(<ChartContainer />);
    expect(state.loadFullTable).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "View Data" }));
    await waitFor(() => expect(state.loadFullTable).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "View Chart" }));
    await user.click(screen.getByRole("button", { name: "View Data" }));

    expect(state.loadFullTable).toHaveBeenCalledTimes(1);
  });

  it("surfaces a dataset load failure instead of an empty table", async () => {
    const user = userEvent.setup();
    state.loadFullTable.mockRejectedValue(
      Object.assign(new Error("boom"), { source: "widgets API: table query" }),
    );
    render(<ChartContainer />);
    await user.click(screen.getByRole("button", { name: "View Data" }));

    expect(await screen.findByText(/dataset could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/widgets API: table query/)).toBeInTheDocument();
  });

  it.each(["loading", "invalid", "empty", "error"])(
    "leaves the %s preview state in chart mode",
    (status) => {
      state.preview = { status, result: null };
      render(<ChartContainer />);
      expect(screen.getByTestId("chart-pane")).toHaveTextContent(`Chart ${status}`);
    },
  );

  // jsdom performs no layout, so offsetHeight is stubbed to stand in for what a
  // browser would measure off the rendered chart.
  describe("body height across the view toggle", () => {
    function stubOffsetHeight(value) {
      const descriptor = Object.getOwnPropertyDescriptor(
        window.HTMLElement.prototype,
        "offsetHeight",
      );
      Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          return value;
        },
      });
      return () => {
        if (descriptor) {
          Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", descriptor);
        } else {
          delete window.HTMLElement.prototype.offsetHeight;
        }
      };
    }

    function body(container) {
      return container.querySelector(".rounded-lg.border");
    }

    it("pins the data view to the height the chart view measured", async () => {
      const restore = stubOffsetHeight(544);
      try {
        const user = userEvent.setup();
        const { container } = render(<ChartContainer />);

        // Chart mode is free-height: the CSS floor governs, nothing inline.
        expect(body(container).style.height).toBe("");

        await user.click(screen.getByRole("button", { name: "View Data" }));
        await screen.findByTestId("data-table");
        expect(body(container).style.height).toBe("544px");

        // ...and releasing it on the way back keeps the chart unconstrained.
        await user.click(screen.getByRole("button", { name: "View Chart" }));
        expect(body(container).style.height).toBe("");
      } finally {
        restore();
      }
    });

    it("falls back to the CSS floor when nothing could be measured", async () => {
      const user = userEvent.setup();
      const { container } = render(<ChartContainer />);

      await user.click(screen.getByRole("button", { name: "View Data" }));
      await screen.findByTestId("data-table");

      expect(body(container).style.height).toBe("");
      expect(body(container).className).toContain("min-h-130");
    });
  });
});
