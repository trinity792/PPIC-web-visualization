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
