/**
 * Manual encoding: a chart the reader has not finished setting up is
 * "unconfigured", not "invalid" — no request goes out and no error is raised.
 *
 * Runs against the real config store, because the whole point is that the
 * store's autoBind policy and the preview's status agree; a mocked store would
 * assert nothing about the behavior that regressed.
 */

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loadChartData: vi.fn() }));

vi.mock("@/components/chart-builder/chartData", async (importOriginal) => ({
  ...(await importOriginal()),
  loadChartData: state.loadChartData,
}));

import {
  ChartConfigProvider,
  useChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import {
  PreviewProvider,
  usePreview,
} from "@/components/chart-builder/wizard/PreviewContext";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

const schema = getModuleSchema("pophousing");

function Probe() {
  const { status } = usePreview();
  const { config, dispatch } = useChartConfig();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="bindings">{JSON.stringify(config.bindings)}</span>
      <button
        type="button"
        onClick={() => dispatch({ type: "SET_CHART_TYPE", chartType: "bar" })}
      >
        bar
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "SET_BINDING", role: "x", field: "Year" })}
      >
        set x
      </button>
      <button
        type="button"
        onClick={() =>
          dispatch({ type: "SET_BINDING", role: "y", field: "Total Population" })
        }
      >
        set y
      </button>
    </div>
  );
}

function mount({ autoBind = false, initialConfig = { module: schema.id } } = {}) {
  return render(
    <ChartConfigProvider
      schema={schema}
      initialConfig={initialConfig}
      autoBind={autoBind}
    >
      {/* Armed from the start, so the assertions below are about the encodings
          being unset and not about the deferred first render. */}
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    </ChartConfigProvider>,
  );
}

describe("unconfigured previews", () => {
  beforeEach(() => {
    state.loadChartData.mockReset();
    state.loadChartData.mockResolvedValue({
      series: [{ name: "California", x: [2020], y: [1] }],
      response: {},
      unmatched: [],
    });
  });

  it("reports unconfigured and fetches nothing while a required role is unset", async () => {
    mount();

    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    await Promise.resolve();
    expect(state.loadChartData).not.toHaveBeenCalled();
  });

  it("renders once every required role is set", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "set x" }));
    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    expect(state.loadChartData).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "set y" }));
    await waitFor(() => expect(state.loadChartData).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("ready"),
    );
  });

  it("returns to the skeleton when a chart-type switch leaves a role unset", async () => {
    const user = userEvent.setup();
    mount({
      initialConfig: {
        module: schema.id,
        chartType: "line",
        bindings: { x: "Year", y: "Total Population" },
      },
    });

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("ready"),
    );

    state.loadChartData.mockClear();
    await user.click(screen.getByRole("button", { name: "bar" }));

    // A bar keeps the measure the reader chose and asks for a category, which
    // the store must not fill in for them.
    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    expect(JSON.parse(screen.getByTestId("bindings").textContent)).toEqual({
      y: "Total Population",
    });
    await Promise.resolve();
    expect(state.loadChartData).not.toHaveBeenCalled();
  });

  it("keeps auto-binding surfaces rendering straight through a switch", async () => {
    const user = userEvent.setup();
    mount({ autoBind: true });

    await waitFor(() => expect(state.loadChartData).toHaveBeenCalled());
    state.loadChartData.mockClear();

    await user.click(screen.getByRole("button", { name: "bar" }));

    await waitFor(() => expect(state.loadChartData).toHaveBeenCalled());
    expect(screen.getByTestId("status")).not.toHaveTextContent("unconfigured");
  });
});
