/**
 * Tests for lib/export/exportImage.js - Phase 5 image export. The module must
 * stay client-safe: Plotly is supplied by the mounted graph div/global runtime,
 * and PDF export is disabled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportCombinedImage,
  exportImage,
  IMAGE_FORMATS,
  renderCombinedImagePreview,
  renderImagePreview,
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
  it("advertises PNG, SVG, and JPEG with alpha/vector capabilities", () => {
    expect(IMAGE_FORMATS.map((format) => format.id)).toEqual([
      "png",
      "svg",
      "jpeg",
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
    expect(IMAGE_FORMATS.some((format) => format.id === "pdf")).toBe(false);
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
      width: 1200,
      height: 700,
      transparent: true,
      filename: "chart.png",
    });

    expect(globalThis.Plotly.toImage).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({
        format: "png",
        scale: 2,
        width: 1200,
        height: 700,
      }),
    );
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("chart.png");
  });

  it("renders a preview data URL without triggering a download", async () => {
    const graphDiv = { id: "graph" };
    const { clicks } = stubAnchorClick();

    const preview = await renderImagePreview(graphDiv, {
      scale: 1,
      width: 768,
      height: 1024,
    });

    expect(preview).toContain("data:image/png");
    expect(globalThis.Plotly.toImage).toHaveBeenCalledWith(graphDiv, {
      format: "png",
      scale: 1,
      width: 768,
      height: 1024,
    });
    expect(clicks).toHaveLength(0);
  });

  it("exportCombinedImage delegates to the vector path for a single chart", async () => {
    const graphDiv = { id: "graph" };
    const { clicks } = stubAnchorClick();

    await exportCombinedImage([graphDiv, null], {
      layout: "1x1",
      format: "png",
      scale: 2,
      filename: "one-chart.png",
    });

    // One real chart => single-chart export (no canvas compositing).
    expect(globalThis.Plotly.toImage).toHaveBeenCalledWith(
      graphDiv,
      expect.objectContaining({ format: "png", scale: 2 }),
    );
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("one-chart.png");
  });

  it("keeps custom combined-preview dimensions exact across a grid", async () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL: vi.fn(() => dataUrl("image/png", "combined")),
    };
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) =>
      tagName === "canvas" ? canvas : createElement(tagName),
    );
    vi.stubGlobal(
      "Image",
      class ImageStub {
        set src(value) {
          this.currentSrc = value;
          this.naturalWidth = 1440;
          this.naturalHeight = 1800;
          queueMicrotask(() => this.onload());
        }
      },
    );

    const preview = await renderCombinedImagePreview([{ id: 1 }, { id: 2 }], {
      layout: "1x2",
      scale: 2,
      width: 1441,
      height: 900,
    });

    expect(preview).toContain("data:image/png");
    expect(canvas).toMatchObject({ width: 2882, height: 1800 });
    expect(globalThis.Plotly.toImage).toHaveBeenCalledTimes(2);
    expect(globalThis.Plotly.toImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 720, height: 900, scale: 2 }),
    );
    for (const call of drawImage.mock.calls) {
      expect(call.slice(-2)).toEqual([1440, 1800]);
    }
  });

  it("stacks multi-chart device previews at responsive widths", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => dataUrl("image/png", "responsive")),
    };
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) =>
      tagName === "canvas" ? canvas : createElement(tagName),
    );
    vi.stubGlobal(
      "Image",
      class ImageStub {
        set src(value) {
          this.currentSrc = value;
          this.naturalWidth = 390;
          this.naturalHeight = 520;
          queueMicrotask(() => this.onload());
        }
      },
    );

    await renderCombinedImagePreview([{ id: 1 }, { id: 2 }], {
      layout: "1x2",
      responsive: true,
      scale: 1,
      width: 390,
      height: 1040,
    });

    expect(canvas).toMatchObject({ width: 390, height: 1040 });
    expect(globalThis.Plotly.toImage).toHaveBeenCalledTimes(2);
    expect(globalThis.Plotly.toImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 390, height: 520, scale: 1 }),
    );
  });

  it("rejects PDF export before rendering or downloading", async () => {
    const { clicks } = stubAnchorClick();
    await expect(exportImage({ id: "graph" }, { format: "pdf" })).rejects.toMatchObject({ code: "EXPORT_FORMAT_DISABLED" });
    expect(globalThis.Plotly.toImage).not.toHaveBeenCalled();
    expect(clicks).toHaveLength(0);
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
