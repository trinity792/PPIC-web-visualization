import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { config, schema, input, VISX_TYPES, MAP_TYPES } from "@/tests/fixtures/visualization-v3/renderer";
const state = vi.hoisted(() => ({ load: vi.fn(), geometry: vi.fn(), requested: [], defaultRenderer: "plotly" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => window.location.pathname, useRouter: () => ({ replace: vi.fn() }) }));
// Maps load their geometry beside the observations; serve the fixture's shapes
// rather than fetching them.
vi.mock("@/components/chart-builder/chartData", async original => ({ ...(await original()), loadObservations: state.load, loadObservationGeometry: state.geometry }));
// Stage B's Plotly default is injected, so this regression test remains valid
// after Stage M switches production defaults to visx.
vi.mock("@/lib/visualization/chartRegistry", async original => {
  const actual = await original();
  return { ...actual, rendererFor: (type, preview) => { state.requested.push(preview); return preview === "visx" && type === "line" ? "visx" : state.defaultRenderer; } };
});
import { ChartConfigProvider } from "@/components/chart-builder/chartConfigStore";
import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
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
  state.geometry.mockReset().mockImplementation(async (type) => (["choroplethMap", "symbolMap"].includes(type) ? input(type).geometry : null));
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

it.each([false, true])("shows shared-row diagnostics only in Advanced Mode: advanced=%s", async (advanced) => {
  state.load.mockResolvedValue({ status: "ok", observations: input().observations, comparisons: input().comparisons, periods: [2020, 2025, 2030], issues: [
    { code: "inlineRowsShareMapping", level: "warning", comparisonId: null, message: '4 rows share a bar because “Job” is not mapped. Map “Job” to a role.' },
    { code: "inlineMixedUnits", level: "information", comparisonId: null, message: "These outcomes use different units." },
  ] });
  render(<AdvancedModeProvider defaultAdvanced={advanced}><ChartConfigProvider schema={schema} initialConfig={config()} autoBind={false}><PreviewProvider><PreviewPane /></PreviewProvider></ChartConfigProvider></AdvancedModeProvider>);
  const chart = await screen.findByTestId("renderer-boundary");
  expect(screen.getByText("These outcomes use different units.")).toBeInTheDocument();
  if (advanced) {
    const warning = screen.getByText(/4 rows share a bar/);
    expect(warning.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  } else {
    expect(screen.queryByText(/4 rows share a bar/)).not.toBeInTheDocument();
  }
});

it("offers to fix a pasted-data warning in the data", async () => {
  const { EditDataContext } = await import("@/components/chart-builder/wizard/EditDataContext");
  const { default: PreviewPane } = await import("@/components/chart-builder/wizard/PreviewPane");
  const { fireEvent } = await import("@testing-library/react");
  const openData = vi.fn();
  state.load.mockResolvedValue({ status: "ok", observations: input().observations, comparisons: input().comparisons, periods: [2020, 2025, 2030], issues: [
    { code: "inlineRowsShareMapping", level: "warning", comparisonId: null, columns: ["Job"], message: "4 rows share 2 bars because “Job” is not mapped." },
  ] });
  render(<ChartConfigProvider schema={schema} initialConfig={config()} autoBind={false}><PreviewProvider><EditDataContext.Provider value={{ openData }}><PreviewPane /></EditDataContext.Provider></PreviewProvider></ChartConfigProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Fix in data" }));
  expect(openData).toHaveBeenCalledWith({ column: "Job" });
});
