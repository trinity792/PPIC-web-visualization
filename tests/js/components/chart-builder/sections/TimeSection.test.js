/**
 * Workstream D - the Time section.
 *
 * `DateRangeSection.js` decides what time means by checking the chart id
 * against a hard-coded list:
 *
 *     const RANGE_CHART_TYPES = ["line", "heatmap", "dotPlot", "dumbbell"];
 *
 * Everything else got a snapshot. That is why the current suite can pin the
 * slider but cannot describe searchable years, a selected set of snapshots, an
 * average, a source's own reporting year, or a forest plot whose endpoints are
 * measures rather than periods. The replacement reads the resolved capability,
 * so this file asserts that the component never asks what chart it is on.
 */

import React from "react";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
  schema: null,
  editorModel: null,
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import TimeSection from "@/components/chart-builder/sections/TimeSection";

const AVAILABLE = [2020, 2021, 2022, 2023, 2024, 2025, 2030];

const schema = {
  id: "projections",
  fields: { Year: { kind: "temporal", label: "Year" } },
  time: {
    availablePeriods: AVAILABLE,
    reportingPeriods: [2020, 2025],
    defaultReportingPeriod: 2025,
  },
};

function model(timeCapability, overrides = {}) {
  return {
    chartType: "line",
    time: timeCapability,
    ...overrides,
  };
}

function config(time, overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      outcome: { measureId: "Population" },
      calculation: { id: "actual", params: {} },
      time,
      comparisons: [],
      ...overrides,
    },
    presentation: { chartType: "line" },
  };
}

beforeEach(() => {
  state.dispatch.mockClear();
  state.schema = schema;
  state.config = config({ contract: "range", startYear: 2020, endYear: 2030 });
  state.editorModel = model({ contract: "range", availablePeriods: AVAILABLE });
});

describe("the control follows the capability, not the chart id", () => {
  it("renders a range control from a range capability", () => {
    render(<TimeSection />);
    expect(screen.getByRole("group", { name: /time/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /start year/i })).toHaveValue(2020);
    expect(screen.getByRole("slider", { name: /end year/i })).toHaveValue(2030);
    expect(screen.getByText("2020–2030")).toBeInTheDocument();
  });

  it("renders the same range control for a chart id the old list did not contain", () => {
    // Under RANGE_CHART_TYPES, "scatter" was never a range. The component must
    // not know or care: the resolved capability is the only input.
    state.editorModel = model(
      { contract: "range", availablePeriods: AVAILABLE },
      { chartType: "scatter" },
    );
    render(<TimeSection />);
    expect(screen.getByRole("slider", { name: /start year/i })).toBeInTheDocument();
  });

  it("renders a searchable single select for a snapshot capability", async () => {
    const user = userEvent.setup();
    state.editorModel = model(
      { contract: "snapshot", availablePeriods: AVAILABLE, defaultPeriod: 2025 },
      { chartType: "bar" },
    );
    state.config = config({ contract: "snapshot", year: 2025 });
    render(<TimeSection />);

    await user.click(screen.getByRole("combobox", { name: /^year$/i }));
    await user.type(screen.getByRole("searchbox", { name: /find a year/i }), "2022");
    await user.click(screen.getByRole("checkbox", { name: "Select 2022" }));

    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_TIME",
      time: { contract: "snapshot", year: 2022 },
    });
  });

  it("renders no Time section when the capability declares none", () => {
    state.editorModel = model({ contract: "none" }, { chartType: "forest" });
    state.config = config({ contract: "none" });
    const { container } = render(<TimeSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders two labelled endpoints for a two-period capability", () => {
    state.editorModel = model(
      { contract: "twoPeriods", availablePeriods: AVAILABLE },
      { chartType: "dumbbell" },
    );
    state.config = config({ contract: "twoPeriods", startYear: 2020, endYear: 2025 });
    render(<TimeSection />);

    expect(screen.getByLabelText(/first year/i)).toHaveValue("2020");
    expect(screen.getByLabelText(/second year/i)).toHaveValue("2025");
  });

  it("does not let a two-period control pick the same year twice", async () => {
    const user = userEvent.setup();
    state.editorModel = model(
      { contract: "twoPeriods", availablePeriods: AVAILABLE, distinctRequired: true },
      { chartType: "dumbbell" },
    );
    state.config = config({ contract: "twoPeriods", startYear: 2020, endYear: 2025 });
    render(<TimeSection />);

    await user.click(screen.getByLabelText(/second year/i));
    // A change from 2020 to 2020 is not a change, and the calculation that
    // needs two periods has nothing to subtract.
    expect(screen.getByRole("option", { name: "2020" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("selected snapshots and the Donut average", () => {
  beforeEach(() => {
    state.editorModel = model(
      {
        contract: "selectedSnapshots",
        availablePeriods: AVAILABLE,
        displayModes: ["tabs", "average"],
      },
      { chartType: "pie" },
    );
    state.config = config({ contract: "selectedSnapshots", years: [] });
  });

  it("renders a searchable snapshot checklist for Donut", async () => {
    const user = userEvent.setup();
    render(<TimeSection />);

    await user.click(screen.getByRole("combobox", { name: /^years$/i }));
    const list = screen.getByRole("group", { name: /^years$/i });
    // Every available year stays selectable - not a slider's endpoints, and not
    // a truncated recent-years list.
    for (const year of AVAILABLE) {
      expect(within(list).getByRole("checkbox", { name: `Select ${year}` })).toBeInTheDocument();
    }

    await user.type(screen.getByRole("searchbox", { name: /find a year/i }), "2030");
    expect(within(list).getByRole("checkbox", { name: "Select 2030" })).toBeInTheDocument();
    expect(within(list).queryByRole("checkbox", { name: "Select 2021" })).not.toBeInTheDocument();
  });

  it("shows the selected count and a clear action", async () => {
    const user = userEvent.setup();
    state.config = config({ contract: "selectedSnapshots", years: [2020, 2025] });
    render(<TimeSection />);

    await user.click(screen.getByRole("combobox", { name: /^years$/i }));
    expect(screen.getByRole("combobox", { name: /^years$/i })).toHaveTextContent(
      "2 years selected",
    );
    await user.click(screen.getByRole("button", { name: /clear years/i }));
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_TIME",
      time: { contract: "selectedSnapshots", years: [] },
    });
  });

  it("offers tabs and average after several Donut years are selected", () => {
    state.config = config({ contract: "selectedSnapshots", years: [2020, 2025, 2030] });
    render(<TimeSection />);

    expect(screen.getByRole("radio", { name: /show each year in tabs/i })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /show the average of selected years/i }),
    ).toBeInTheDocument();
  });

  it("uses the same multi-year picker for grouped Bars without offering tabs", () => {
    state.editorModel = model(
      {
        contract: "selectedSnapshots",
        availablePeriods: AVAILABLE,
        displayModes: ["grouped"],
      },
      { chartType: "bar" },
    );
    state.config = config({ contract: "selectedSnapshots", years: [2020, 2025, 2030] });
    render(<TimeSection />);

    expect(screen.getByRole("combobox", { name: /^years$/i })).toHaveTextContent(
      "3 years selected",
    );
    expect(screen.queryByRole("radiogroup", { name: /year display/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/show each year in tabs/i)).not.toBeInTheDocument();
  });

  it("does not offer an average of one year", () => {
    state.config = config({ contract: "selectedSnapshots", years: [2025] });
    render(<TimeSection />);
    expect(
      screen.queryByRole("radio", { name: /show the average of selected years/i }),
    ).not.toBeInTheDocument();
  });

  it("sends the average to the backend as a calculation", async () => {
    const user = userEvent.setup();
    state.config = config({ contract: "selectedSnapshots", years: [2020, 2025, 2030] });
    render(<TimeSection />);

    await user.click(screen.getByRole("radio", { name: /show the average of selected years/i }));

    // The mean is a calculation, not a display trick, so it goes where every
    // other calculation goes and comes back labelled as derived.
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_CALCULATION",
      calculation: { id: "averageSelectedYears", params: { years: [2020, 2025, 2030] } },
    });
  });

  it("labels an average and lists all included years", () => {
    state.config = config(
      { contract: "selectedSnapshots", years: [2020, 2025, 2030], displayMode: "average" },
      { calculation: { id: "averageSelectedYears", params: { years: [2020, 2025, 2030] } } },
    );
    render(<TimeSection />);

    // Plain language, and every year named: a reader must never mistake a
    // three-year mean for a single year's value.
    expect(screen.getByText("Average of 2020, 2025, and 2030.")).toBeInTheDocument();
  });
});

describe("reporting years", () => {
  it("defaults Projections to reporting year 2025", () => {
    state.editorModel = model(
      { contract: "snapshot", availablePeriods: AVAILABLE, defaultPeriod: 2025 },
      { chartType: "bar" },
    );
    state.config = config({ contract: "snapshot", year: null });
    render(<TimeSection />);

    // Declared metadata, not `Math.max(availablePeriods)`. The dataset's far
    // end is a projection horizon and is nobody's starting point.
    expect(screen.getByRole("combobox", { name: /^year$/i })).toHaveTextContent("2025");
    expect(screen.getByRole("combobox", { name: /^year$/i })).not.toHaveTextContent("2030");
  });

  it("marks which years are reporting years", () => {
    state.editorModel = model(
      {
        contract: "snapshot",
        availablePeriods: AVAILABLE,
        reportingPeriods: [2020, 2025],
        defaultPeriod: 2025,
      },
      { chartType: "bar" },
    );
    render(<TimeSection />);
    expect(screen.getByText(/reporting year/i)).toBeInTheDocument();
  });
});

describe("an incompatible chart switch", () => {
  it("clears incompatible time on a chart switch", () => {
    // Line held a 2020-2030 range; Donut can only show snapshots. Converting
    // silently - picking an endpoint, or the midpoint, or the latest year - is
    // a decision made on the reader's behalf about what their chart means.
    state.editorModel = model(
      { contract: "selectedSnapshots", availablePeriods: AVAILABLE, displayModes: ["tabs"] },
      { chartType: "pie" },
    );
    state.config = config({ contract: "selectedSnapshots", years: [] });
    render(<TimeSection />);

    expect(screen.getByText("Select time to show this chart.")).toBeInTheDocument();
    expect(state.dispatch).not.toHaveBeenCalled();
  });

  it("does not silently choose endpoints or a snapshot", () => {
    state.editorModel = model(
      { contract: "twoPeriods", availablePeriods: AVAILABLE },
      { chartType: "dumbbell" },
    );
    state.config = config({ contract: "twoPeriods", startYear: null, endYear: null });
    render(<TimeSection />);

    expect(screen.getByText("Select time to show this chart.")).toBeInTheDocument();
    expect(screen.getByLabelText(/first year/i)).toHaveValue("");
    expect(screen.getByLabelText(/second year/i)).toHaveValue("");
  });
});
