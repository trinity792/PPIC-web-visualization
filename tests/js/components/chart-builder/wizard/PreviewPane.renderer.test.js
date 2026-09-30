import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { config, schema, input, VISX_TYPES, MAP_TYPES } from "@/tests/fixtures/visualization-v3/renderer";
const state = vi.hoisted(() => ({ load: vi.fn(), requested: [], defaultRenderer: "plotly" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => window.location.pathname, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/chart-builder/chartData", async original => ({ ...(await original()), loadObservations: state.load }));
// Stage B's Plotly default is injected, so this regression test remains valid
// after Stage M switches production defaults to visx.
vi.mock("@/lib/visualization/chartRegistry", async original => {
  const actual = await original();
  return { ...actual, rendererFor: (type, preview) => { state.requested.push(preview); return preview === "visx" && type === "line" ? "visx" : state.defaultRenderer; } };
});
import { ChartConfigProvider } from "@/components/chart-builder/chartConfigStore";
import { PreviewProvider, usePreview } from "@/components/chart-builder/wizard/PreviewContext";
function Probe() {
  const { previews } = usePreview();
  return <pre data-testid="preview">{JSON.stringify(previews.map(p => ({ status: p.status, renderer: (p.plotly || p.chart)?.renderer })))}</pre>;
}
function mount(type) {
  render(<ChartConfigProvider schema={schema} initialConfig={config(type)} autoBind={false}><PreviewProvider><Probe /></PreviewProvider></ChartConfigProvider>);
}
beforeEach(() => {
  state.requested = []; state.defaultRenderer = "plotly";
  state.load.mockReset().mockResolvedValue({ status: "ok", blocked: false, observations: input().observations, comparisons: input().comparisons, periods: [2020,2025,2030], issues: [] });
});
afterEach(() => window.history.replaceState({}, "", "/"));
it.each([...VISX_TYPES,...MAP_TYPES])("draws every chart type with Plotly when nothing is switched: %s", type => {
  mount(type);
  return waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent('"renderer":"plotly"'));
});
it("ignores the renderer switch in embed mode", async () => {
  window.history.replaceState({}, "", "/?embed=1&renderer=visx");
  mount("line");
  await waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent('"renderer":"plotly"'));
  expect(state.requested).not.toContain("visx");
});

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
vi.mock("@/components/charts/ChartRenderer", () => ({ default: ({ result }) => <div data-testid="renderer-boundary">{result.renderer}</div> }));
vi.mock("@/components/charts/PlotlyChart", () => ({ default: () => <div data-testid="legacy-plotly" /> }));
it("draws the tagged result through ChartRenderer in the actual PreviewPane", async () => {
  render(<ChartConfigProvider schema={schema} initialConfig={config()} autoBind={false}><PreviewProvider><PreviewPane /></PreviewProvider></ChartConfigProvider>);
  expect(await screen.findByTestId("renderer-boundary")).toHaveTextContent("plotly");
  expect(screen.queryByTestId("legacy-plotly")).not.toBeInTheDocument();
});
