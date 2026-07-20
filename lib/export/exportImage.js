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
 *   exportImage(graphDiv, {format, scale, transparent, quality, filename})
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

/** Vector-first PDF: render SVG, then convert with jsPDF + svg2pdf.js. */
async function exportPdf(graphDiv, { scale, filename }) {
  const svgDataUrl = await renderToImage(graphDiv, { format: "svg", scale });
  try {
    const svgText = decodeDataUrl(svgDataUrl);
    const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    const { jsPDF } = await import("jspdf");
    const { svg2pdf } = await import("svg2pdf.js");
    const doc = new jsPDF({ orientation: "landscape", unit: "px" });
    await svg2pdf(svgElement, doc, {});
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
  { format, scale = 1, transparent = false, quality, filename } = {},
) {
  const name = filename || suggestFilename({}, format);

  if (format === "pdf") {
    return exportPdf(graphDiv, { scale, filename: name });
  }

  const dataUrl = await renderToImage(graphDiv, { format, scale });

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
function gridDims(layout, count) {
  if (count <= 1 || layout === "1x1") return { cols: 1, rows: 1 };
  if (layout === "1x2") return { cols: 2, rows: 1 };
  if (layout === "2x1") return { cols: 1, rows: 2 };
  return { cols: 2, rows: Math.ceil(count / 2) }; // 2x2
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
async function compositeCanvas(graphDivs, { layout, scale, background }) {
  const images = await Promise.all(
    graphDivs.map(async (graphDiv) =>
      loadImage(await renderToImage(graphDiv, { format: "png", scale })),
    ),
  );
  const dim = (image, prop) => image[prop] || 0;
  const cellW = Math.max(...images.map((image) => dim(image, "naturalWidth")));
  const cellH = Math.max(...images.map((image) => dim(image, "naturalHeight")));
  const { cols, rows } = gridDims(layout, images.length);

  const canvas = document.createElement("canvas");
  canvas.width = cellW * cols;
  canvas.height = cellH * rows;
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
    // Center each chart within its cell so uneven chart sizes stay aligned.
    context.drawImage(image, col * cellW + (cellW - w) / 2, row * cellH + (cellH - h) / 2, w, h);
  });
  return canvas;
}

/**
 * Combine several mounted charts into one image, tiled in the workspace layout.
 * Charts are rasterized (PNG) and composited on a canvas; SVG/PDF wrap that
 * raster (combined vector export is not supported). Delegates to exportImage for
 * a single chart so the one-chart path stays vector-first.
 */
export async function exportCombinedImage(
  graphDivs,
  { layout = "1x1", format, scale = 1, transparent = false, quality, filename } = {},
) {
  const valid = (graphDivs || []).filter(Boolean);
  if (valid.length <= 1) {
    return exportImage(valid[0], { format, scale, transparent, quality, filename });
  }

  const name = filename || suggestFilename({}, format);
  const background = transparent && format !== "jpeg" ? null : "#ffffff";
  const canvas = await compositeCanvas(valid, { layout, scale, background });

  if (format === "pdf") {
    try {
      const { jsPDF } = await import("jspdf");
      const landscape = canvas.width >= canvas.height;
      const doc = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
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
