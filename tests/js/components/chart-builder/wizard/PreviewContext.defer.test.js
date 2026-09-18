/**
 * Deferred initial render: landing on a module page issues no request until
 * the reader changes a setting, and the loader's own feedback never counts as
 * a change.
 *
 * Runs against the real config store with a complete v3 question, so the
 * only thing standing between the preview and a request is the deferral.
 */

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loadObservations: vi.fn() }));

vi.mock("@/components/chart-builder/chartData", async (importOriginal) => ({
  ...(await importOriginal()),
  loadObservations: state.loadObservations,
}));

import {
  ChartConfigProvider,
  useChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import {
  PreviewProvider,
  usePreview,
} from "@/components/chart-builder/wizard/PreviewContext";
import { getDefaultQuestion } from "@/lib/visualization/defaultQuestions";
import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

const schema = getModuleSchema("pophousing");

/** The module's default question with the places filled in, so it can run. */
function answered() {
  const spec = getDefaultQuestion("pophousing");
  spec.question.geography = { subset: "Counties", locations: ["Alameda"] };
  return spec;
}

function Probe() {
  const { status } = usePreview();
  const { dispatch } = useChartConfig();
  return (
    <div>
      <span data-testid="status">{status}</span>
      {/* A cosmetic, presentation-only change: it does not alter the data
          request, so it proves arming keys off user intent and not off the
          request key. */}
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
      <button type="button" onClick={() => dispatch({ type: "ADD_CHART" })}>
        add second chart
      </button>
    </div>
  );
}

function mount(providerProps = {}) {
  return render(
    <ChartConfigProvider schema={schema} initialConfig={answered()} autoBind={false}>
      <PreviewProvider {...providerProps}>
        <Probe />
      </PreviewProvider>
    </ChartConfigProvider>,
  );
}

describe("deferred initial render", () => {
  beforeEach(() => {
    state.loadObservations.mockReset();
    state.loadObservations.mockResolvedValue({
      status: "ok",
      blocked: false,
      observations: [],
      comparisons: [],
      periods: [],
      issues: [],
    });
  });

  it("issues no request and reports idle when deferred", async () => {
    mount({ deferInitialRender: true });

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    // Give any effect a chance to fire before concluding nothing was fetched.
    await Promise.resolve();
    expect(state.loadObservations).not.toHaveBeenCalled();
  });

  it("arms on the first user setting change, even a cosmetic one", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });

    await user.click(screen.getByRole("button", { name: "rename" }));

    await waitFor(() => expect(state.loadObservations).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("status")).not.toHaveTextContent("idle"),
    );
  });

  it("is not armed by the loader's own SET_SERIES_COUNT feedback", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });

    await user.click(screen.getByRole("button", { name: "feed back" }));

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(state.loadObservations).not.toHaveBeenCalled();
  });

  it("stays armed once armed, so later changes render live", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });

    await user.click(screen.getByRole("button", { name: "rename" }));
    await waitFor(() => expect(state.loadObservations).toHaveBeenCalled());

    state.loadObservations.mockClear();
    await user.click(screen.getByRole("button", { name: "feed back" }));
    await waitFor(() =>
      expect(screen.getByTestId("status")).not.toHaveTextContent("idle"),
    );
  });

  it("loads immediately when not deferred, which is a deep link or an embed", async () => {
    mount();

    await waitFor(() => expect(state.loadObservations).toHaveBeenCalled());
  });

  it("arms the deferred preview when a second chart is added", async () => {
    const user = userEvent.setup();
    mount({ deferInitialRender: true });
    expect(state.loadObservations).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "add second chart" }));
    await waitFor(() => expect(state.loadObservations).toHaveBeenCalled());
  });
});
