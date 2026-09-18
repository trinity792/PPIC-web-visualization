/**
 * An unanswered question is "unconfigured", not "invalid": no request goes
 * out and no error is raised until the reader has said what to plot.
 *
 * Runs against the real config store, because the whole point is that the
 * store's question and the preview's status agree; a mocked store would
 * assert nothing about the behavior that regressed.
 */

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loadObservations: vi.fn() }));

vi.mock("@/components/chart-builder/chartData", async (importOriginal) => ({
  ...(await importOriginal()),
  loadObservations: state.loadObservations,
  // Map geometry is a separate fetch; this suite is about the question.
  loadObservationGeometry: vi.fn().mockResolvedValue(null),
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

function Probe() {
  const { status } = usePreview();
  const { config, dispatch } = useChartConfig();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="geography">{JSON.stringify(config.question.geography)}</span>
      <button
        type="button"
        onClick={() => dispatch({ type: "SET_CHART_TYPE", chartType: "choroplethMap" })}
      >
        map
      </button>
      <button
        type="button"
        onClick={() =>
          dispatch({ type: "SET_GEOGRAPHY", geography: { subset: "Counties", locations: [] } })
        }
      >
        set level
      </button>
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: "SET_GEOGRAPHY",
            geography: { subset: "Counties", locations: ["Alameda"] },
          })
        }
      >
        set place
      </button>
    </div>
  );
}

function mount({ initialConfig = getDefaultQuestion("pophousing") } = {}) {
  return render(
    <ChartConfigProvider schema={schema} initialConfig={initialConfig} autoBind={false}>
      {/* Armed from the start, so the assertions below are about the question
          being unanswered and not about the deferred first render. */}
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    </ChartConfigProvider>,
  );
}

const answer = {
  status: "ok",
  blocked: false,
  observations: [
    {
      comparisonId: "cmp_locations",
      comparisonLabel: "Alameda",
      measureId: "Total Population",
      measureLabel: "Total population",
      unit: "people",
      period: 2020,
      geographyId: "06001",
      geographyLabel: "Alameda",
      categoryId: null,
      categoryLabel: null,
      value: 1,
      status: "available",
      valueKind: "observed",
      calculation: { id: "actual", params: {} },
      includedPeriods: null,
      source: "E-5",
    },
  ],
  comparisons: [{ id: "cmp_locations", label: "Alameda", status: "ok" }],
  periods: [2020],
  issues: [],
};

describe("unconfigured previews", () => {
  beforeEach(() => {
    state.loadObservations.mockReset();
    state.loadObservations.mockResolvedValue(answer);
  });

  it("reports unconfigured and fetches nothing while the question is unanswered", async () => {
    // The module default names no geographic level and no place.
    mount();

    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    await Promise.resolve();
    expect(state.loadObservations).not.toHaveBeenCalled();
  });

  it("renders once every selection is made", async () => {
    const user = userEvent.setup();
    mount();

    // A level alone is not enough for a line: it still needs a place.
    await user.click(screen.getByRole("button", { name: "set level" }));
    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    expect(state.loadObservations).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "set place" }));
    await waitFor(() => expect(state.loadObservations).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("ready"),
    );
  });

  it("a map with only its level set fetches: every feature at that level is the selection", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "map" }));
    // Entering a map settles the level itself (the one level with geometry)
    // and clears any single place: an unfiltered map shows every county.
    expect(JSON.parse(screen.getByTestId("geography").textContent)).toEqual({
      subset: "Counties",
      locations: [],
    });
    await waitFor(() => expect(state.loadObservations).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("ready"),
    );
  });
});
