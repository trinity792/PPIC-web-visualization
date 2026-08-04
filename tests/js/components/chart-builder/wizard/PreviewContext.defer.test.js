/**
 * Deferred first render: landing on a module workbench must cost no request.
 *
 * Runs against the real config store rather than a mocked one, because the whole
 * mechanism hangs on the store's own undo history telling user intent apart from
 * the loader's SET_SERIES_COUNT feedback. A mocked store would assert nothing.
 */

/* eslint-disable react/prop-types */

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
  const { dispatch } = useChartConfig();
  return (
    <div>
      <span data-testid="status">{status}</span>
      {/* A cosmetic, appearance-only change: it does not alter the data request,
          so it proves arming keys off user intent and not off the request key. */}
      <button
        type="button"
        onClick={() => dispatch({ type: "SET_LABEL", key: "title", value: "Mine" })}
      >
        rename
      </button>
      {/* The loader's own feedback action, which must never arm the chart. */}
      <button
        type="button"
        onClick={() =>
          dispatch({ type: "SET_SERIES_COUNT", count: 3, seriesNames: ["a"] })
        }
      >
        feed back
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "ADD_CHART" })}
      >
        add second chart
      </button>
    </div>
  );
}

function mount(providerProps = {}) {
  return render(
    <ChartConfigProvider schema={schema} initialConfig={{ module: schema.id }}>
      <PreviewProvider {...providerProps}>
        <Probe />
      </PreviewProvider>
    </ChartConfigProvider>,
  );
}

describe("deferred initial render", () => {
  beforeEach(() => {
    state.loadChartData.mockReset();
    state.loadChartData.mockResolvedValue({
      series: [],
      response: {},
      unmatched: [],
    });
  });

  it("issues no request and reports idle when deferred", async () => {
    mount({ deferInitialRender: true });

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    // Give any effect a chance to fire before concluding nothing was fetched.
    await Promise.resolve();
    expect(state.loadChartData).not.toHaveBeenCalled();
  });

  it("arms on the first user setting change, even a cosmetic one", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });

    await user.click(screen.getByRole("button", { name: "rename" }));

    await waitFor(() => expect(state.loadChartData).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("status")).not.toHaveTextContent("idle"),
    );
  });

  it("is not armed by the loader's own SET_SERIES_COUNT feedback", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });

    await user.click(screen.getByRole("button", { name: "feed back" }));

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(state.loadChartData).not.toHaveBeenCalled();
  });

  it("stays armed once armed, so later changes render live", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });

    await user.click(screen.getByRole("button", { name: "rename" }));
    await waitFor(() => expect(state.loadChartData).toHaveBeenCalled());

    state.loadChartData.mockClear();
    await user.click(screen.getByRole("button", { name: "feed back" }));
    await waitFor(() =>
      expect(screen.getByTestId("status")).not.toHaveTextContent("idle"),
    );
  });

  it("loads immediately when not deferred, which is the standalone wizard", async () => {
    mount();

    await waitFor(() => expect(state.loadChartData).toHaveBeenCalled());
  });

  it("arms the deferred preview when a second chart is added", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });
    expect(state.loadChartData).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "add second chart" }));
    await waitFor(() => expect(state.loadChartData).toHaveBeenCalled());
  });
});
