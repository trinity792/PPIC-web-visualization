import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ChartRenderer from "@/components/charts/ChartRenderer";
const mocks = vi.hoisted(() => ({ plotly: vi.fn(), line: vi.fn(), fail: false }));
vi.mock("@/components/charts/PlotlyChart", () => ({ default: props => { mocks.plotly(props); return <div data-testid="plotly" />; } }));
vi.mock("@/components/charts/visx/LineChart", () => ({ default: props => { if(mocks.fail) throw new Error("Bad model"); mocks.line(props); return <svg data-testid="visx" />; } }));
beforeEach(() => { mocks.plotly.mockClear(); mocks.line.mockClear(); mocks.fail = false; });
it("draws PlotlyChart for a plotly result", () => {
  const result = { renderer: "plotly", chartType: "line", data: [{x:[2020],y:[1]}], layout: {} };
  render(<ChartRenderer result={result} width={650} height={400} />);
  expect(screen.getByTestId("plotly")).toBeInTheDocument();
  expect(mocks.plotly.mock.calls[0][0]).toMatchObject({ data: result.data, layout: {} });
  expect(mocks.line).not.toHaveBeenCalled();
});
it("draws the visx component for a visx result", () => {
  const model = { chartType: "line", series: [], periods: [] };
  render(<ChartRenderer result={{ renderer: "visx", chartType: "line", model }} width={650} height={400} />);
  expect(screen.getByTestId("visx")).toBeInTheDocument();
  expect(mocks.line.mock.calls[0][0]).toMatchObject({ model, width: 650, height: 400 });
  expect(mocks.plotly).not.toHaveBeenCalled();
});
it.each(["plotly", "visx"])("marks itself ready after drawing, for either library: %s", renderer => {
  const result = { renderer, chartType: "line", data: [], layout: {}, model: { chartType: "line", series: [] } };
  const { container } = render(<ChartRenderer result={result} width={650} height={400} />);
  if(renderer === "plotly") {
    expect(container.querySelector('[data-chart-ready="true"]')).toBeNull();
    act(() => mocks.plotly.mock.calls.at(-1)[0].onGraphDiv(document.createElement("div")));
  }
  expect(container.querySelector('[data-chart-ready="true"]')).toBeInTheDocument();
});
it("shows the rendering error state when a model cannot be drawn", () => {
  mocks.fail = true;
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { container } = render(<ChartRenderer result={{ renderer: "visx", chartType: "line", model: {} }} width={650} height={400} />);
    expect(screen.getByText(/Visualization could not be loaded/i)).toBeInTheDocument();
    expect(container.querySelector('[data-chart-ready="true"]')).toBeNull();
  } finally { spy.mockRestore(); }
});
