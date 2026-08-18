/** Date-range sliders expose and commit each temporal endpoint independently. */

import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  config: null,
  schema: null,
}));

vi.mock("@/components/chart-builder/chartConfigStore", () => ({
  useChartConfig: () => state,
}));

import DateRangeSection from "@/components/chart-builder/sections/DateRangeSection";

function config(chartType, period = {}) {
  return { chartType, period, transform: "actual", data: {} };
}

describe("DateRangeSection", () => {
  beforeEach(() => {
    state.dispatch.mockClear();
    state.schema = {
      yearRange: [2010, 2020],
      fields: { Year: { kind: "temporal" } },
    };
  });

  it.each(["line", "heatmap", "dotPlot", "dumbbell"])(
    "offers independently adjustable start and end years for %s charts",
    (chartType) => {
      state.config = config(chartType, { startYear: 2012, endYear: 2018 });
      render(<DateRangeSection />);

      expect(screen.getByRole("slider", { name: "Start year" })).toHaveValue(2012);
      expect(screen.getByRole("slider", { name: "End year" })).toHaveValue(2018);
    },
  );

  it("commits changes made from either end of the range", async () => {
    const user = userEvent.setup();
    state.config = config("line", { startYear: 2012, endYear: 2018 });
    render(<DateRangeSection />);

    await user.click(screen.getByRole("slider", { name: "Start year" }));
    await user.keyboard("{ArrowRight}");
    expect(state.dispatch).toHaveBeenLastCalledWith({
      type: "SET_PERIOD",
      key: "endYear",
      value: 2018,
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_PERIOD",
      key: "startYear",
      value: 2013,
    });

    state.dispatch.mockClear();
    await user.click(screen.getByRole("slider", { name: "End year" }));
    await user.keyboard("{ArrowLeft}");
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_PERIOD",
      key: "startYear",
      value: 2013,
    });
    expect(state.dispatch).toHaveBeenCalledWith({
      type: "SET_PERIOD",
      key: "endYear",
      value: 2017,
    });
  });

  it("keeps snapshot charts on a single-year slider", () => {
    state.config = config("bar", { year: 2016 });
    render(<DateRangeSection />);

    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(screen.getByRole("slider", { name: "Year" })).toHaveValue(2016);
  });
});
