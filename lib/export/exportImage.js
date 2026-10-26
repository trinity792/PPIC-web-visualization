/**
 * exportImage.js — chart image export: PNG, SVG, and JPG, with
 * pixel-scale control and JPG quality re-encoding through an offscreen canvas.
 *
 * Two paths, chosen by the chart's renderer (renderer plan, Workstream M):
 *   - visx charts go through exportSvgChart.js, which copies the drawn SVG and
 *     its frame into one self-contained SVG and encodes it.
 *   - Plotly charts go through Plotly.toImage; a map in the PPIC frame is
 *     drawn by Plotly and composed into the frame's SVG (see below).
 * A workspace export may mix both; each chart is rasterized on its own path
 * and tiled onto one canvas.
 *
 * A chart is passed as either a bare Plotly graph div, or a handle
 * { renderer: "visx", chartType, element, renderAtSize } for a visx chart
 * (PreviewPane registers it) or { renderer: "plotly", graphDiv } for Plotly.
 * A map in the PPIC frame (renderer plan M step 5, owner 2026-10-12) is a
 * Plotly handle that also carries `element` (its ChartFrame) and
 * `renderAtSize`: Plotly.toImage draws the map alone as SVG, and
 * exportSvgChart.js composes the frame's title, key, and source box around it.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. It imports nothing from plotly directly — the caller
 * hands it the mounted graph div, keeping this module testable.
 *
 * Exports:
 *   IMAGE_FORMATS            — [{id:"png"|"svg"|"jpeg", label,
 *                              supportsAlpha, vector}]
 *   renderImagePreview       — renders one chart to a PNG data URL without
 *                              triggering a download
 *   renderCombinedImagePreview — renders a chart workspace to one preview URL
 *   exportImage(chart, {format, scale, width, height, transparent, quality,
 *                       filename})
 *                            — resolves to a triggered download; every failure
 *                              rejects with a named EXPORT_* error
 *   suggestFilename(spec)    — "<module-or-data>-<chartType>-<date>.<ext>"
 *
 * Data sources:
 *   - the rendered Plotly graph div or visx chart frame (client-side only)
 */

import { buildSvgChart, renderSvgChart } from "@/lib/export/exportSvgChart";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

export const IMAGE_FORMATS = [
  { id: "png", label: "PNG", supportsAlpha: true, vector: false, ext: "png" },
  { id: "svg", label: "SVG", supportsAlpha: true, vector: true, ext: "svg" },
  { id: "jpeg", label: "JPG", supportsAlpha: false, vector: false, ext: "jpg" },
];

/**
 * Export quality presets. `scale` sets the raster pixel density — it drives the
 * resolution of PNG/JPG and, because combined SVG wraps a rasterized canvas,
 * their crispness too. `jpegQuality` is the JPEG encoder quality (0–1). Ordered
 * highest-first so the default (index 0) is the sharpest / largest file.
 */
export const IMAGE_QUALITIES = [
  { id: "max", label: "Maximum", scale: 4, jpegQuality: 1 },
  { id: "high", label: "High", scale: 3, jpegQuality: 0.95 },
  { id: "standard", label: "Standard", scale: 2, jpegQuality: 0.85 },
  { id: "small", label: "Small", scale: 1.5, jpegQuality: 0.72 },
];

const FORMAT_BY_ID = new Map(IMAGE_FORMATS.map((format) => [format.id, format]));

function exportError(code, message, cause) {
  return Object.assign(new Error(message), { code, source: "exportImage", cause });
}

/** A visx handle, or the Plotly graph div behind a handle or passed bare. */
function isVisxChart(chart) {
  return chart?.renderer === "visx";
}

function plotlyGraphDiv(chart) {
  return chart?.renderer === "plotly" ? chart.graphDiv : chart;
}

function visxOptions(chart, options) {
  return { ...options, renderAtSize: chart.renderAtSize ?? null };
}

/** A Plotly chart drawn inside the PPIC frame (a map). */
function isFramedPlotly(chart) {
  return chart?.renderer === "plotly" && Boolean(chart.element);
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The framed map's parts for export: its frame (redrawn at the export size
 * when it can be) and the map itself as SVG text from Plotly.toImage, sized
 * to the frame's drawing area. Call `dispose` when done.
 */
async function framedPlotly(chart, { width, height } = {}) {
  let rendered = null;
  if (chart.renderAtSize && Number.isFinite(width) && width > 0) {
    try {
      rendered = await chart.renderAtSize({ width, height, padding: CHART_STYLE.imagePadding });
    } catch (cause) {
      throw exportError("EXPORT_RENDER_FAILED", "The map could not be drawn at the export size.", cause);
    }
  }
  const dispose = () => rendered?.dispose?.();
  try {
    const element = rendered?.element ?? chart.element;
    const graphDiv = rendered?.graphDiv ?? chart.graphDiv;
    const area = element.querySelector?.('[data-frame-part="chart"]')?.getBoundingClientRect?.();
    const svgUrl = await renderToImage(
      graphDiv,
      renderOptions("svg", { width: area?.width, height: area?.height }),
    );
    return { element, chartSvg: decodeDataUrl(svgUrl), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** A framed map as a data URL in the given format. */
async function renderFramedPlotly(chart, { format, scale, width, height, quality, filename }) {
  const { element, chartSvg, dispose } = await framedPlotly(chart, { width, height });
  try {
    if (format === "svg") {
      const text = await buildSvgChart(element, { width, height, chartSvg });
      return `data:image/svg+xml;base64,${utf8ToBase64(text)}`;
    }
    return await renderSvgChart(element, { format, scale, width, height, quality, filename, chartSvg });
  } finally {
    dispose();
  }
}

function slug(text) {
  return String(text || "data")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function isoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "<module-or-your-data>-<chartType>-<YYYY-MM-DD>.<ext>" (jpg for jpeg). */
export function suggestFilename(spec, formatId) {
  const base = spec?.data?.source === "inline" ? "your-data" : slug(spec?.module);
  const ext = FORMAT_BY_ID.get(formatId)?.ext || formatId;
  return `${base}-${spec?.chartType}-${isoDate()}.${ext}`;
}

/** Trigger a download for a data: URL (no object-URL needed, jsdom-safe). */
function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function decodeDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  return meta.includes(";base64") ? atob(body) : decodeURIComponent(body);
}

async function renderToImage(graphDiv, options) {
  try {
    return await globalThis.Plotly.toImage(graphDiv, options);
  } catch (cause) {
    throw exportError(
      "EXPORT_RENDER_FAILED",
      "Plotly could not render the chart for export.",
      cause,
    );
  }
}

function renderOptions(format, { scale = 1, width, height } = {}) {
  return {
    format,
    scale,
    ...(Number.isFinite(width) && width > 0 ? { width: Math.round(width) } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height: Math.round(height) } : {}),
  };
}

/** Render one chart exactly as its export will rasterize it, without downloading. */
export function renderImagePreview(chart, options = {}) {
  if (isFramedPlotly(chart)) {
    const { scale = 1, width, height } = options;
    return renderFramedPlotly(chart, { format: "png", scale, width, height });
  }
  if (isVisxChart(chart)) {
    const { scale = 1, width, height } = options;
    return renderSvgChart(chart.element, visxOptions(chart, { format: "png", scale, width, height }));
  }
  return renderToImage(plotlyGraphDiv(chart), renderOptions("png", options));
}

/**
 * Export the mounted chart. A visx chart is encoded from its drawn SVG; for
 * Plotly, PNG/SVG/JPEG go straight through Plotly.toImage.
 * Resolves after the download is triggered; rejects
 * with a named EXPORT_* error on any failure.
 */
export async function exportImage(
  chart,
  {
    format,
    scale = 1,
    width,
    height,
    transparent = false,
    quality,
    filename,
  } = {},
) {
  if (format === "pdf") {
    throw exportError("EXPORT_FORMAT_DISABLED", "PDF export is currently disabled.");
  }
  const name = filename || suggestFilename({}, format);

  if (isVisxChart(chart)) {
    const dataUrl = await renderSvgChart(
      chart.element,
      visxOptions(chart, { format, scale, width, height, quality, filename: name }),
    );
    downloadDataUrl(dataUrl, name);
    return undefined;
  }

  if (isFramedPlotly(chart)) {
    const dataUrl = await renderFramedPlotly(chart, {
      format,
      scale,
      width,
      height,
      quality,
      filename: name,
    });
    downloadDataUrl(dataUrl, name);
    return undefined;
  }

  const graphDiv = plotlyGraphDiv(chart);

  const dataUrl = await renderToImage(
    graphDiv,
    renderOptions(format, { scale, width, height }),
  );

  // JPEG has no alpha; an explicit quality re-encode goes through a canvas when
  // one is available (browser only — skipped where canvas is unimplemented).
  if (format === "jpeg" && quality != null) {
    try {
      const reencoded = await reencodeJpeg(dataUrl, quality);
      downloadDataUrl(reencoded, name);
      return undefined;
    } catch (cause) {
      throw exportError(
        "EXPORT_ENCODE_FAILED",
        "The chart could not be re-encoded as a JPEG.",
        cause,
      );
    }
  }

  void transparent;
  downloadDataUrl(dataUrl, name);
  return undefined;
}

/** Column/row grid for a workspace layout and chart count. */
function gridDims(layout, count, width, responsive = false) {
  if (count <= 1) return { cols: 1, rows: 1 };
  // The embedded workspace collapses multi-column layouts below Tailwind's lg
  // breakpoint. Device previews opt into the same behavior.
  if (responsive && Number.isFinite(width) && width < 1024) {
    return { cols: 1, rows: count };
  }
  if (layout === "1x2") return { cols: 2, rows: 1 };
  if (layout === "2x1") return { cols: 1, rows: count };
  if (layout === "2x2") return { cols: 2, rows: Math.ceil(count / 2) };
  return { cols: 1, rows: count };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Chart image failed to load for combining."));
    image.src = src;
  });
}

/** One workspace cell as a PNG data URL, on the chart's own export path. */
function renderCell(chart, { scale, width, height }) {
  if (isFramedPlotly(chart)) {
    return renderFramedPlotly(chart, { format: "png", scale, width, height });
  }
  if (isVisxChart(chart)) {
    return renderSvgChart(chart.element, visxOptions(chart, { format: "png", scale, width, height }));
  }
  return renderToImage(plotlyGraphDiv(chart), renderOptions("png", { scale, width, height }));
}

/** Render each chart to PNG and tile them onto one canvas in grid order. */
async function compositeCanvas(
  charts,
  { layout, responsive, scale, width, height, background },
) {
  const { cols, rows } = gridDims(
    layout,
    charts.length,
    width,
    responsive,
  );
  const cellWidth = Number.isFinite(width)
    ? Math.max(1, Math.floor(width / cols))
    : null;
  const cellHeight = Number.isFinite(height)
    ? Math.max(1, Math.floor(height / rows))
    : null;
  const images = await Promise.all(
    charts.map(async (chart) =>
      loadImage(await renderCell(chart, { scale, width: cellWidth, height: cellHeight })),
    ),
  );
  const dim = (image, prop) => image[prop] || 0;
  const cellW = Math.max(...images.map((image) => dim(image, "naturalWidth")));
  const cellH = Math.max(...images.map((image) => dim(image, "naturalHeight")));
  const density = Number.isFinite(scale) && scale > 0 ? scale : 1;

  const canvas = document.createElement("canvas");
  // Explicit dimensions are an output contract. Size the combined canvas from
  // them directly so an odd custom width is not shortened by grid division.
  canvas.width = Number.isFinite(width)
    ? Math.round(width * density)
    : cellW * cols;
  canvas.height = Number.isFinite(height)
    ? Math.round(height * density)
    : cellH * rows;
  const context = canvas.getContext("2d");
  if (!context) {
    throw exportError(
      "EXPORT_ENCODE_FAILED",
      "A canvas is required to combine multiple charts into one image.",
    );
  }
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  images.forEach((image, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const w = dim(image, "naturalWidth");
    const h = dim(image, "naturalHeight");
    const left = Number.isFinite(width)
      ? Math.round((col * canvas.width) / cols)
      : col * cellW;
    const top = Number.isFinite(height)
      ? Math.round((row * canvas.height) / rows)
      : row * cellH;
    const targetWidth = Number.isFinite(width)
      ? Math.round(((col + 1) * canvas.width) / cols) - left
      : w;
    const targetHeight = Number.isFinite(height)
      ? Math.round(((row + 1) * canvas.height) / rows) - top
      : h;
    // Contain rather than fill. This avoids distorting a chart to absorb a
    // rounding pixel or a grid cell with a different aspect ratio.
    const fit = Math.min(targetWidth / w, targetHeight / h);
    const drawWidth = Math.round(w * fit);
    const drawHeight = Math.round(h * fit);
    const x = left + (targetWidth - drawWidth) / 2;
    const y = top + (targetHeight - drawHeight) / 2;
    context.drawImage(image, x, y, drawWidth, drawHeight);
  });
  return canvas;
}

/** Render a workspace grid to a PNG data URL without triggering a download. */
export async function renderCombinedImagePreview(
  charts,
  { layout = "1x1", responsive = false, scale = 1, width, height } = {},
) {
  const valid = (charts || []).filter(Boolean);
  if (valid.length <= 1) {
    return renderImagePreview(valid[0], { scale, width, height });
  }
  const canvas = await compositeCanvas(valid, {
    layout,
    responsive,
    scale,
    width,
    height,
    background: null,
  });
  return canvas.toDataURL("image/png");
}

/**
 * Combine several mounted charts into one image, tiled in the workspace layout.
 * Charts are rasterized (PNG) and composited on a canvas; SVG wraps that
 * raster (combined vector export is not supported). Delegates to exportImage for
 * a single chart so the one-chart path stays vector-first.
 */
export async function exportCombinedImage(
  charts,
  {
    layout = "1x1",
    responsive = false,
    format,
    scale = 1,
    width,
    height,
    transparent = false,
    quality,
    filename,
  } = {},
) {
  const valid = (charts || []).filter(Boolean);
  if (valid.length <= 1) {
    return exportImage(valid[0], {
      format,
      scale,
      width,
      height,
      transparent,
      quality,
      filename,
    });
  }

  if (format === "pdf") {
    throw exportError("EXPORT_FORMAT_DISABLED", "PDF export is currently disabled.");
  }
  const name = filename || suggestFilename({}, format);
  const background = transparent && format !== "jpeg" ? null : "#ffffff";
  const canvas = await compositeCanvas(valid, {
    layout,
    responsive,
    scale,
    width,
    height,
    background,
  });

  if (format === "svg") {
    const png = canvas.toDataURL("image/png");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" ` +
      `viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${png}" ` +
      `width="${canvas.width}" height="${canvas.height}"/></svg>`;
    downloadDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, name);
    return undefined;
  }

  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const dataUrl =
    format === "jpeg" ? canvas.toDataURL(mime, quality ?? 0.92) : canvas.toDataURL(mime);
  downloadDataUrl(dataUrl, name);
  return undefined;
}

/** Re-encode a raster data URL as JPEG at the given quality via a canvas. */
function reencodeJpeg(dataUrl, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}
