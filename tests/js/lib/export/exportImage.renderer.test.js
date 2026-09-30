import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exportImage, exportCombinedImage } from "@/lib/export/exportImage";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="650" height="400"><text>Population</text><text>DoF P-3</text><path d="M0,0L10,10"/></svg>';
const mocks = vi.hoisted(() => ({ renderSvgChart: vi.fn(), buildSvgChart: vi.fn() }));
vi.mock("@/lib/export/exportSvgChart", () => mocks);
const url = text => `data:image/svg+xml;base64,${btoa(text)}`;
let plotly, clicks, drawImage;
beforeEach(() => {
  mocks.renderSvgChart.mockReset().mockResolvedValue(url(svg));
  mocks.buildSvgChart.mockReset().mockResolvedValue(svg);
  plotly = vi.fn().mockResolvedValue(url('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0L10,10"/></svg>'));
  vi.stubGlobal("Plotly", { toImage: plotly });
  clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function() { clicks.push(this.href); });
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, fillRect: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cG5n");
  vi.stubGlobal("Image", class { naturalWidth=650; naturalHeight=400; set src(value) { this._src=value; queueMicrotask(() => this.onload?.()); } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const visx = () => ({ renderer: "visx", element: document.createElement("figure") });
const map = () => ({ renderer: "plotly", chartType: "choroplethMap", graphDiv: document.createElement("div"), element: document.createElement("figure") });
it.each(["svg", "png", "jpeg", "pdf"])("uses the SVG path for a visx chart: %s", async format => {
  const chart = visx();
  await exportImage(chart, { format, width: 650 });
  expect(mocks.renderSvgChart).toHaveBeenCalledWith(chart.element, expect.objectContaining({ format, width: 650 }));
  expect(plotly).not.toHaveBeenCalled();
  expect(clicks).toHaveLength(1);
});
it("still uses Plotly.toImage for a map", async () => {
  const chart = map();
  await exportImage(chart, { format: "svg", width: 650 });
  expect(plotly).toHaveBeenCalledWith(chart.graphDiv, expect.objectContaining({ format: "svg" }));
});
it("includes the frame around an exported map", async () => {
  const chart = map();
  chart.element.innerHTML = '<h2 data-frame-part="title">Population</h2><p data-frame-part="source">DoF P-3</p>';
  await exportImage(chart, { format: "svg", width: 650 });
  expect(mocks.buildSvgChart).toHaveBeenCalledWith(chart.element, expect.objectContaining({ width: 650, chartSvg: expect.stringContaining("<path") }));
  expect(clicks).toHaveLength(1);
  expect(atob(clicks[0].split(",")[1])).toContain("DoF P-3");
});
it("combines a visx chart and a map in one workspace export", async () => {
  const charts = [visx(),map()];
  await exportCombinedImage(charts, { format: "png", layout: "2x1", width: 1300, height: 400 });
  expect(mocks.renderSvgChart).toHaveBeenCalled();
  expect(plotly).toHaveBeenCalledWith(charts[1].graphDiv, expect.any(Object));
  expect(plotly.mock.calls.some(([arg]) => arg === charts[0])).toBe(false);
  expect(drawImage).toHaveBeenCalledTimes(2);
  expect(clicks).toHaveLength(1);
});

vi.mock("jspdf", () => ({ jsPDF: class { output() { return "data:application/pdf;base64,cGRm"; } } }));
vi.mock("svg2pdf.js", () => ({ svg2pdf: vi.fn().mockResolvedValue(undefined) }));
it("preserves named SVG export errors for the menu", async () => {
  mocks.renderSvgChart.mockRejectedValueOnce(Object.assign(new Error("Cannot draw"), { code: "EXPORT_RENDER_FAILED" }));
  await expect(exportImage(visx(), { format: "png", width: 650 })).rejects.toMatchObject({ code: "EXPORT_RENDER_FAILED" });
  expect(clicks).toHaveLength(0);
});
