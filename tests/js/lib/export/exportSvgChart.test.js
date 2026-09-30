import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildSvgChart, renderSvgChart } from "@/lib/export/exportSvgChart";
import ChartRenderer from "@/components/charts/ChartRenderer";
import { buildChartModel } from "@/lib/visualization/models";
import { input, VISX_TYPES } from "@/tests/fixtures/visualization-v3/renderer";
// Proposed export boundary: buildSvgChart returns standalone SVG text;
// renderSvgChart returns a data URL for exportImage's existing download path.
function frame() {
  const root = document.createElement("figure");
  root.innerHTML = '<div data-frame-part="eyebrow">Figure 2</div><h2 data-frame-part="title">Population</h2><p data-frame-part="subtitle">Selected counties</p><svg xmlns="http://www.w3.org/2000/svg" width="950" height="400"><path class="series" style="stroke: rgb(202, 79, 26); stroke-width: 2; fill: none" d="M0,0L100,100" /></svg><div data-frame-part="source">Source: DoF P-3</div><div data-frame-part="notes">Estimates may be revised.</div>';
  document.body.append(root);
  return root;
}
beforeEach(() => {
  // No font/network dependency. Binary is fixture bytes; production owns actual
  // bundled Inter font paths and font loading, asserted by embedded font data.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([0,1,0,0,73,110,116,101,114]).buffer }));
});
afterEach(() => { document.querySelectorAll("body > figure").forEach(el => el.remove()); vi.restoreAllMocks(); });
const parse = text => new DOMParser().parseFromString(text, "image/svg+xml");
it("includes the title, subtitle, and source in the exported SVG", async () => {
  const svg = parse(await buildSvgChart(frame(), { width: 650 }));
  expect(svg.querySelector("parsererror")).toBeNull();
  for(const text of ["Figure 2", "Population", "Selected counties", "Source: DoF P-3", "Estimates may be revised."]) expect(svg.documentElement.textContent).toContain(text);
  expect(svg.querySelector("foreignObject")).toBeNull();
});
it("writes styles into the SVG instead of class names", async () => {
  const svg = parse(await buildSvgChart(frame(), { width: 650 }));
  expect(svg.querySelector("[class]")).toBeNull();
  const path = svg.querySelector("path");
  expect(path.getAttribute("stroke") || path.style.stroke).toMatch(/#CA4F1A|rgb\(202, 79, 26\)/i);
  expect(path.getAttribute("stroke-width") || path.style.strokeWidth).toBe("2");
});
it("embeds the Inter font", async () => {
  const text = await buildSvgChart(frame(), { width: 650 });
  expect(text).toMatch(/@font-face/);
  expect(text).toMatch(/font-family:\s*["']?Inter/i);
  expect(text).toMatch(/url\(["']?data:(?:font|application)\/[^;]+;base64,/);
  expect(text).not.toMatch(/url\(["']?https?:/);
});
it.each([950,650,330])("draws at the chosen standard width: %s", async width => {
  const renderAtSize = vi.fn(async () => frame());
  const svg = parse(await buildSvgChart(frame(), { width, renderAtSize }));
  expect(renderAtSize).toHaveBeenCalledWith(expect.objectContaining({ width }));
  expect(Number.parseFloat(svg.documentElement.getAttribute("width"))).toBe(width);
  expect(svg.documentElement.getAttribute("viewBox").split(/\s+/).map(Number)[2]).toBe(width);
});
it.each(VISX_TYPES)("exports every visx chart type: %s", async chartType => {
  const model = buildChartModel(input(chartType));
  const { container } = render(<ChartRenderer result={{ renderer: "visx", chartType, model }} width={650} height={400} />);
  const svg = parse(await buildSvgChart(container, { width: 650 }));
  expect(svg.querySelector("parsererror")).toBeNull();
  expect(svg.querySelectorAll("path,rect,circle,line").length).toBeGreaterThan(0);
  expect(svg.documentElement.textContent).toContain("Population");
});
it("fails with a named export error when the chart is missing", async () => {
  await expect(buildSvgChart(null, { width: 650 })).rejects.toMatchObject({ code: "EXPORT_RENDER_FAILED" });
});
it("wraps a failed font fetch in a named export error", async () => {
  fetch.mockRejectedValueOnce(new Error("offline"));
  await expect(buildSvgChart(frame(), { width: 650 })).rejects.toMatchObject({ code: "EXPORT_RENDER_FAILED" });
});

it.each(["png", "jpeg"])("rasterizes the full SVG at the chosen quality scale: %s", async format => {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, fillRect: vi.fn() });
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function(mime) {
    expect(this.width).toBe(1300);
    expect(this.height).toBe(800);
    return `data:${mime};base64,aW1hZ2U=`;
  });
  const OriginalImage = globalThis.Image;
  vi.stubGlobal("Image", class { set src(value) { this.source = value; queueMicrotask(() => this.onload?.()); } });
  try {
    const result = await renderSvgChart(frame(), { format, width: 650, height: 400, scale: 2 });
    expect(result).toBe(`data:image/${format};base64,aW1hZ2U=`);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalled();
  } finally { vi.stubGlobal("Image", OriginalImage); }
});
