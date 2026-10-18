import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { config, schema, input, VISX_TYPES, MAP_TYPES } from "@/tests/fixtures/visualization-v3/renderer";
const state = vi.hoisted(() => ({ load: vi.fn(), geometry: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => window.location.pathname, useRouter: () => ({ replace: vi.fn() }) }));
// Maps load their geometry beside the observations; serve the fixture's shapes
// rather than fetching them.
vi.mock("@/components/chart-builder/chartData", async original => ({ ...(await original()), loadObservations: state.load, loadObservationGeometry: state.geometry }));
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
// ChartFrame draws a visx chart only once it has measured its width.
class MeasuredResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe(target) { this.callback([{ target, contentRect: { width: 650, height: 400 }, contentBoxSize: [{ inlineSize: 650, blockSize: 400 }] }]); }
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", MeasuredResizeObserver);
  state.geometry.mockReset().mockImplementation(async (type) => (["choroplethMap", "symbolMap"].includes(type) ? input(type).geometry : null));
  state.load.mockReset().mockResolvedValue({ status: "ok", blocked: false, observations: input().observations, comparisons: input().comparisons, periods: [2020,2025,2030], issues: [] });
});
afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});
// Renderer plan O: Plotly draws only the maps, and there is no page-address
// override any more.
it.each(VISX_TYPES)("draws every non-map chart type with visx: %s", type => {
  mount(type);
  return waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent('"renderer":"visx"'));
});
it.each(MAP_TYPES)("draws every map with Plotly: %s", type => {
  mount(type);
  return waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent('"renderer":"plotly"'));
});
it("ignores a renderer parameter in the page address", async () => {
  window.history.replaceState({}, "", "/?renderer=plotly");
  mount("line");
  await waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent('"renderer":"visx"'));
});

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
vi.mock("@/components/charts/ChartRenderer", () => ({ default: ({ result }) => <div data-testid="renderer-boundary">{result.renderer}</div> }));
vi.mock("@/components/charts/PlotlyChart", () => ({ default: () => <div data-testid="legacy-plotly" /> }));
it("draws the tagged result through ChartRenderer in the actual PreviewPane", async () => {
  render(<ChartConfigProvider schema={schema} initialConfig={config()} autoBind={false}><PreviewProvider><PreviewPane /></PreviewProvider></ChartConfigProvider>);
  expect(await screen.findByTestId("renderer-boundary")).toHaveTextContent("visx");
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
