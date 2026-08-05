/**
 * exportImage.js — chart image export via Plotly.toImage: PNG, SVG, JPG, and
 * PDF, with transparent background (PNG/SVG), pixel-scale control, and JPG
 * quality re-encoding through an offscreen canvas. PDF is produced vector-first
 * by rendering to SVG then converting with jsPDF + svg2pdf.js (lazy-imported),
 * so print output stays sharp.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. It imports nothing from plotly directly — the caller
 * hands it the mounted graph div, keeping this module testable.
 *
 * Exports:
 *   IMAGE_FORMATS            — [{id:"png"|"svg"|"jpeg"|"pdf", label,
 *                              supportsAlpha, vector}]
 *   renderImagePreview       — renders one chart to a PNG data URL without
 *                              triggering a download
 *   renderCombinedImagePreview — renders a chart workspace to one preview URL
 *   exportImage(graphDiv, {format, scale, width, height, transparent, quality,
 *                          filename})
 *                            — resolves to a triggered download; every failure
 *                              rejects with a named EXPORT_* error
 *   suggestFilename(spec)    — "<module-or-data>-<chartType>-<date>.<ext>"
 *
 * Data sources:
 *   - the rendered Plotly graph div (client-side only)
 */

export const IMAGE_FORMATS = [
  { id: "png", label: "PNG", supportsAlpha: true, vector: false, ext: "png" },
  { id: "svg", label: "SVG", supportsAlpha: true, vector: true, ext: "svg" },
  { id: "jpeg", label: "JPG", supportsAlpha: false, vector: false, ext: "jpg" },
  { id: "pdf", label: "PDF", supportsAlpha: false, vector: true, ext: "pdf" },
];

/**
 * Export quality presets. `scale` sets the raster pixel density — it drives the
 * resolution of PNG/JPG and, because combined SVG/PDF wrap a rasterized canvas,
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

/** Render one chart exactly as Plotly will rasterize it, without downloading. */
export function renderImagePreview(graphDiv, options = {}) {
  return renderToImage(graphDiv, renderOptions("png", options));
}

function svgDimension(svgElement, name, viewBoxIndex, fallback) {
  const attribute = Number.parseFloat(svgElement.getAttribute(name));
  if (Number.isFinite(attribute) && attribute > 0) return Math.round(attribute);
  const viewBox = String(svgElement.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const fromViewBox = viewBox[viewBoxIndex];
  return Number.isFinite(fromViewBox) && fromViewBox > 0
    ? Math.round(fromViewBox)
    : fallback;
}

function pdfPageDimensions(
  width,
  height,
  svgElement = null,
  fallback = { width: 800, height: 600 },
) {
  const fallbackWidth = svgElement
    ? svgDimension(svgElement, "width", 2, fallback.width)
    : fallback.width;
  const fallbackHeight = svgElement
    ? svgDimension(svgElement, "height", 3, fallback.height)
    : fallback.height;
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : fallbackWidth,
    height:
      Number.isFinite(height) && height > 0 ? Math.round(height) : fallbackHeight,
  };
}

function pdfDocumentOptions(width, height) {
  return {
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    hotfixes: ["px_scaling"],
    compress: true,
  };
}

function stripPdfLegendMarkers(svgElement) {
  // Browser/Plotly legends need synthetic trailing em spaces to keep the SVG
  // clip box from shaving off the last glyph of wrapped labels. svg2pdf treats
  // those Unicode spaces as part of its text-positioning run, which can spread
  // every glyph across the line. Remove them only from the parsed PDF copy;
  // the mounted chart and direct SVG export retain their clipping safeguard.
  function cleanTextNodes(node) {
    if (node.nodeType === 3) {
      node.nodeValue = node.nodeValue
        .replace(/\u2003+$/g, "")
        .replace(/\u200b/g, "");
      return;
    }
    for (const child of node.childNodes || []) cleanTextNodes(child);
  }

  for (const legendText of svgElement.querySelectorAll(
    ".legendtext, .legendtitletext",
  )) {
    cleanTextNodes(legendText);
  }
}

/** Vector-first PDF: render SVG, then convert with jsPDF + svg2pdf.js. */
async function exportPdf(graphDiv, { scale, width, height, filename }) {
  const svgDataUrl = await renderToImage(
    graphDiv,
    renderOptions("svg", { scale, width, height }),
  );
  try {
    const svgText = decodeDataUrl(svgDataUrl);
    const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svgElement = svgDoc.documentElement;
    stripPdfLegendMarkers(svgElement);
    const page = pdfPageDimensions(width, height, svgElement);

    const { jsPDF } = await import("jspdf");
    const { svg2pdf } = await import("svg2pdf.js");
    const doc = new jsPDF(pdfDocumentOptions(page.width, page.height));
    await svg2pdf(svgElement, doc, {
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
    });
    const dataUrl = doc.output("datauristring", { filename });
    downloadDataUrl(dataUrl, filename);
  } catch (cause) {
    throw exportError(
      "EXPORT_ENCODE_FAILED",
      "The chart could not be encoded as a PDF.",
      cause,
    );
  }
}

/**
 * Export the mounted chart. PNG/SVG/JPEG go straight through Plotly.toImage;
 * PDF renders to SVG first and converts. Resolves after the download is
 * triggered; rejects with a named EXPORT_* error on any failure.
 */
export async function exportImage(
  graphDiv,
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
  const name = filename || suggestFilename({}, format);

  if (format === "pdf") {
    return exportPdf(graphDiv, { scale, width, height, filename: name });
  }

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

/** Render each graph div to PNG and tile them onto one canvas in grid order. */
async function compositeCanvas(
  graphDivs,
  { layout, responsive, scale, width, height, background },
) {
  const { cols, rows } = gridDims(
    layout,
    graphDivs.length,
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
    graphDivs.map(async (graphDiv) =>
      loadImage(
        await renderToImage(
          graphDiv,
          renderOptions("png", {
            scale,
            width: cellWidth,
            height: cellHeight,
          }),
        ),
      ),
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
  graphDivs,
  { layout = "1x1", responsive = false, scale = 1, width, height } = {},
) {
  const valid = (graphDivs || []).filter(Boolean);
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
 * Charts are rasterized (PNG) and composited on a canvas; SVG/PDF wrap that
 * raster (combined vector export is not supported). Delegates to exportImage for
 * a single chart so the one-chart path stays vector-first.
 */
export async function exportCombinedImage(
  graphDivs,
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
  const valid = (graphDivs || []).filter(Boolean);
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

  if (format === "pdf") {
    try {
      const { jsPDF } = await import("jspdf");
      // The canvas carries quality-density pixels; the PDF page uses the
      // logical chart dimensions so the high-resolution image fits the page
      // instead of making the page several times larger.
      const density = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const page = pdfPageDimensions(width, height, null, {
        width: Math.round(canvas.width / density),
        height: Math.round(canvas.height / density),
      });
      const doc = new jsPDF(pdfDocumentOptions(page.width, page.height));
      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        page.width,
        page.height,
      );
      downloadDataUrl(doc.output("datauristring", { filename: name }), name);
      return undefined;
    } catch (cause) {
      throw exportError(
        "EXPORT_ENCODE_FAILED",
        "The combined charts could not be encoded as a PDF.",
        cause,
      );
    }
  }

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
