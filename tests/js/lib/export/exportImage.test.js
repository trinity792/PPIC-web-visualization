/**
 * Tests for lib/export/exportImage.js - Phase 5 image export. The module must
 * stay client-safe: Plotly is supplied by the mounted graph div/global runtime,
 * while PDF dependencies are loaded only for PDF export.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportImage,
  IMAGE_FORMATS,
  suggestFilename,
} from "@/lib/export/exportImage";

const baseSpec = {
  module: "widgets",
  chartType: "line",
  data: { source: "module" },
};

function dataUrl(mime, body) {
  return `data:${mime};base64,${btoa(body)}`;
}

function stubAnchorClick() {
  const clicks = [];
  const spy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function click() {
      clicks.push({ href: this.href, download: this.download });
    });
  return { clicks, spy };
}

describe("IMAGE_FORMATS", () => {
  it("advertises PNG, SVG, JPEG, and PDF with alpha/vector capabilities", () => {
    expect(IMAGE_FORMATS.map((format) => format.id)).toEqual([
      "png",
      "svg",
      "jpeg",
      "pdf",
    ]);
    expect(IMAGE_FORMATS.find((format) => format.id === "png")).toMatchObject({
      supportsAlpha: true,
      vector: false,
    });
    expect(IMAGE_FORMATS.find((format) => format.id === "svg")).toMatchObject({
      supportsAlpha: true,
      vector: true,
    });
    expect(IMAGE_FORMATS.find((format) => format.id === "jpeg")).toMatchObject({
      supportsAlpha: false,
      vector: false,
    });
    expect(IMAGE_FORMATS.find((format) => format.id === "pdf")).toMatchObject({
      supportsAlpha: false,
      vector: true,
    });
  });
});

describe("suggestFilename", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T12:00:00-07:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses module/chart/date/extension, with jpg for jpeg", () => {
    expect(suggestFilename(baseSpec, "png")).toBe("widgets-line-2026-07-07.png");
    expect(suggestFilename(baseSpec, "jpeg")).toBe("widgets-line-2026-07-07.jpg");
  });

  it("uses your-data for inline uploads and sanitizes whitespace", () => {
    expect(
      suggestFilename(
        { module: "population housing", chartType: "bar", data: { source: "inline" } },
        "svg",
      ),
    ).toBe("your-data-bar-2026-07-07.svg");
  });
});

describe("exportImage", () => {
  beforeEach(() => {
    vi.stubGlobal("Plotly", {
      toImage: vi.fn().mockResolvedValue(dataUrl("image/png", "png")),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses Plotly.toImage and triggers a download for PNG/SVG/JPEG exports", async () => {
    const graphDiv = { id: "graph" };
    const { clicks } = stubAnchorClick();

    await exportImage(graphDiv, {
      format: "png",
      scale: 2,
      transparent: true,
      filename: "chart.png",
    });

    expect(globalThis.Plotly.toImage).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ format: "png", scale: 2 }),
    );
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("chart.png");
  });

  it("renders PDF from SVG first so PDF remains vector", async () => {
    const graphDiv = { id: "graph" };
    globalThis.Plotly.toImage.mockResolvedValueOnce(dataUrl("image/svg+xml", "<svg />"));
    stubAnchorClick();

    await exportImage(graphDiv, {
      format: "pdf",
      scale: 1,
      transparent: false,
      filename: "chart.pdf",
    });

    expect(globalThis.Plotly.toImage).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ format: "svg" }),
    );
  });

  it("rejects Plotly render failures with EXPORT_RENDER_FAILED", async () => {
    const graphDiv = { id: "graph" };
    globalThis.Plotly.toImage.mockRejectedValueOnce(new Error("plotly failed"));

    await expect(
      exportImage(graphDiv, {
        format: "png",
        scale: 1,
        filename: "chart.png",
      }),
    ).rejects.toMatchObject({
      code: "EXPORT_RENDER_FAILED",
      source: "exportImage",
    });
  });
});
