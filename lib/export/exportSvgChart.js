/**
 * exportSvgChart.js — image export for charts drawn with visx: builds one
 * self-contained SVG of the whole chart, frame included, from the picture
 * already on screen (renderer plan, Workstream M).
 *
 * The frame's HTML parts (eyebrow, title, subtitle, key, gray source box) are
 * redrawn as SVG <text> and <rect> at the exact positions the browser laid them
 * out, line by line, so wrapped titles and source lines wrap as they do on
 * screen. Each <svg> the chart draws is copied in place with its computed
 * styles written onto it as attributes. No <foreignObject> (some image and PDF
 * tools drop it) and no class names (a saved file has no page CSS). Inter is
 * embedded as an @font-face data URL, so the file looks the same on a computer
 * without Inter.
 *
 * Formats: SVG is saved directly; PNG and JPG draw the SVG onto a canvas at the
 * quality scale; PDF passes the SVG to jsPDF + svg2pdf.js with Inter registered
 * as TrueType (jsPDF cannot read woff2).
 *
 * This module is CLIENT-SAFE: it never imports `node:fs` or server-only code.
 *
 * Exports:
 *   EXPORT_FONTS   — the Inter files embedded in exports, in public/fonts/
 *   buildSvgChart(element, {width, height, renderAtSize, embedFonts})
 *                  — resolves to standalone SVG text
 *   renderSvgChart(element, {format, width, height, scale, quality,
 *                            renderAtSize, filename})
 *                  — resolves to a data URL in the chosen format
 *
 * `element` is the chart frame (`[data-chart-frame]`) or anything containing
 * it. The image puts `CHART_STYLE.imagePadding` of white around the frame, as
 * PPIC's published images do. `renderAtSize({ width, height, padding })`, when
 * given, draws the chart again at the export size and resolves to an element
 * (or `{ element, dispose }`) whose box is the whole image: the frame inset by
 * `padding` on every side. So a 650px export is laid out at 650px rather than
 * scaled from the screen. Every failure rejects with a named EXPORT_* error.
 *
 * Data sources:
 *   - the mounted chart frame (client-side only)
 *   - public/fonts/Inter-*.{woff2,ttf} (SIL Open Font License, Inter-OFL.txt)
 */

import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The Inter weights the charts use (chartStyle.js text roles: 400 and 700).
 * woff2 is the Latin subset, embedded in SVG/PNG/JPG; ttf is the full font,
 * which jsPDF needs for PDF.
 */
export const EXPORT_FONTS = Object.freeze([
  Object.freeze({
    weight: 400,
    pdfStyle: "normal",
    woff2: "/fonts/Inter-Regular-latin.woff2",
    ttf: "/fonts/Inter-Regular.ttf",
  }),
  Object.freeze({
    weight: 700,
    pdfStyle: "bold",
    woff2: "/fonts/Inter-Bold-latin.woff2",
    ttf: "/fonts/Inter-Bold.ttf",
  }),
]);

// Inter's ascender share of its content box. A text range's box is that
// content box, so the baseline sits this far down it.
const { ascent, descent } = CHART_STYLE.fontMetrics;
const INTER_ASCENT_SHARE = ascent / (ascent + descent);

const INHERITED_SVG_STYLES = Object.freeze([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
  "visibility",
]);

function exportError(code, message, cause) {
  return Object.assign(new Error(message), { code, source: "exportSvgChart", cause });
}

// ── Text and color helpers ───────────────────────────────────────────

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attributes(map) {
  return Object.entries(map)
    .filter(([, value]) => value != null && value !== "")
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join("");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** "rgba(r, g, b, a)" → { color: "rgb(r, g, b)", opacity: a }; null when fully transparent. */
function splitAlpha(value) {
  if (!value || value === "transparent") return null;
  const match = /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(value);
  if (!match) return { color: value, opacity: null };
  const opacity = Number(match[4]);
  if (opacity <= 0) return null;
  return {
    color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`,
    opacity: opacity < 1 ? opacity : null,
  };
}

/** Any Inter stack (including next/font's generated name) becomes the embedded Inter. */
function exportFontFamily(value) {
  if (!value) return value;
  return /inter/i.test(value) ? "Inter, sans-serif" : value;
}

function applyTextTransform(text, transform) {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  return text;
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

async function fetchFontBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font request failed (${response.status}): ${url}`);
  return bytesToBase64(await response.arrayBuffer());
}

async function fontFaceCss() {
  let faces;
  try {
    faces = await Promise.all(
      EXPORT_FONTS.map(async (font) => ({ font, data: await fetchFontBase64(font.woff2) })),
    );
  } catch (cause) {
    throw exportError(
      "EXPORT_RENDER_FAILED",
      "The Inter font could not be loaded for export.",
      cause,
    );
  }
  return faces
    .map(
      ({ font, data }) =>
        `@font-face{font-family:"Inter";font-style:normal;font-weight:${font.weight};` +
        `src:url(data:font/woff2;base64,${data}) format("woff2");}`,
    )
    .join("");
}

// ── Reading the laid-out frame ───────────────────────────────────────

function isSvgRoot(node) {
  return node.namespaceURI === SVG_NS && node.localName === "svg";
}

function isHidden(node, style) {
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0" ||
    node.classList?.contains("sr-only")
  );
}

function clipsOverflow(style) {
  return [style.overflow, style.overflowX, style.overflowY].some(
    (value) => value && value !== "visible",
  );
}

function intersect(a, b) {
  if (!a) return b;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

function insideClip(rect, clip) {
  if (!clip) return true;
  return rect.right > clip.left && rect.left < clip.right && rect.bottom > clip.top && rect.top < clip.bottom;
}

function textAttributes(style) {
  const paint = splitAlpha(style.color);
  const letterSpacing = style.letterSpacing && style.letterSpacing !== "normal"
    ? style.letterSpacing
    : null;
  return {
    "font-family": exportFontFamily(style.fontFamily),
    "font-size": style.fontSize,
    "font-weight": style.fontWeight,
    "font-style": style.fontStyle && style.fontStyle !== "normal" ? style.fontStyle : null,
    "letter-spacing": letterSpacing,
    fill: paint?.color ?? "rgb(0, 0, 0)",
    "fill-opacity": paint?.opacity,
  };
}

/**
 * Split a text node into the lines the browser drew, by measuring each word.
 * Where layout is unavailable (jsdom), the whole node is one line at its
 * parent's corner.
 */
function textLines(node, origin) {
  const raw = node.nodeValue || "";
  const words = [...raw.matchAll(/\S+/g)];
  if (!words.length) return [];
  const range = typeof document.createRange === "function" ? document.createRange() : null;
  if (!range || typeof range.getBoundingClientRect !== "function") {
    const box = node.parentElement?.getBoundingClientRect?.() || { left: 0, top: 0, height: 0 };
    return [
      {
        text: words.map((word) => word[0]).join(" "),
        x: box.left - origin.left,
        y: box.top - origin.top + box.height * INTER_ASCENT_SHARE,
        rect: box,
      },
    ];
  }

  const lines = [];
  for (const word of words) {
    range.setStart(node, word.index);
    range.setEnd(node, word.index + word[0].length);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    const line = lines.at(-1);
    if (line && Math.abs(rect.top - line.rect.top) < rect.height / 2) {
      line.words.push(word[0]);
      line.rect = { ...line.rect, right: rect.right };
    } else {
      lines.push({
        words: [word[0]],
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, height: rect.height },
      });
    }
  }
  return lines.map((line) => ({
    text: line.words.join(" "),
    x: line.rect.left - origin.left,
    y: line.rect.top - origin.top + line.rect.height * INTER_ASCENT_SHARE,
    rect: line.rect,
  }));
}

function textParts(node, origin, clip) {
  const parent = node.parentElement;
  if (!parent) return [];
  const style = getComputedStyle(parent);
  const shared = attributes(textAttributes(style));
  return textLines(node, origin)
    .filter((line) => insideClip(line.rect, clip))
    .map(
      (line) =>
        `<text x="${round(line.x)}" y="${round(line.y)}"${shared} xml:space="preserve">` +
        `${escapeXml(applyTextTransform(line.text, style.textTransform))}</text>`,
    );
}

function backgroundPart(node, style, origin) {
  const paint = splitAlpha(style.backgroundColor);
  if (!paint) return null;
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;
  return `<rect${attributes({
    x: round(rect.left - origin.left),
    y: round(rect.top - origin.top),
    width: round(rect.width),
    height: round(rect.height),
    rx: radius ? round(radius) : null,
    fill: paint.color,
    "fill-opacity": paint.opacity,
  })}/>`;
}

const ALPHABETIC_BASELINES = new Set(["", "auto", "alphabetic", "baseline"]);

/**
 * svg2pdf ignores `dominant-baseline` (the scatter chart's tick labels use
 * "central" and "hanging"), so text placed that way lands on the wrong line in
 * a PDF. The copy gets the alphabetic baseline instead, moved by exactly the
 * distance the browser's baseline moved it: measured by drawing the original
 * once with each baseline. Every viewer then places it as the screen does.
 */
function alphabeticBaseline(original, copy, style) {
  const baseline = style.getPropertyValue("dominant-baseline");
  if (ALPHABETIC_BASELINES.has(baseline) || typeof original.getBBox !== "function") return;
  const placed = original.getBBox().y;
  const inline = original.style.dominantBaseline;
  original.style.dominantBaseline = "alphabetic";
  const alphabetic = original.getBBox().y;
  original.style.dominantBaseline = inline;
  copy.setAttribute("dominant-baseline", "alphabetic");
  copy.style?.removeProperty?.("dominant-baseline");
  const shift = round(placed - alphabetic);
  if (!shift) return;
  const transform = copy.getAttribute("transform");
  copy.setAttribute("transform", `${transform ? `${transform} ` : ""}translate(0 ${shift})`);
}

/**
 * Write each element's computed paint and text styles onto the copy as
 * attributes, drop class names, and remove what the screen does not show.
 * A value is written where it differs from what the copy would inherit, or
 * where the element already carries that attribute (so CSS overrides win).
 */
function inlineSvgStyles(original, copy, inherited = null) {
  const style = getComputedStyle(original);
  if (inherited && isHidden(original, style)) {
    copy.remove();
    return;
  }
  const own = {};
  for (const name of INHERITED_SVG_STYLES) {
    let value = style.getPropertyValue(name);
    if (!value) continue;
    if (name === "font-family") value = exportFontFamily(value);
    own[name] = value;
    if (!inherited || inherited[name] !== value || copy.hasAttribute(name)) {
      copy.setAttribute(name, value);
    }
  }
  const opacity = style.getPropertyValue("opacity");
  if (opacity && opacity !== "1") copy.setAttribute("opacity", opacity);
  copy.removeAttribute("class");
  if (original.localName === "text") alphabeticBaseline(original, copy, style);

  const originals = [...original.children];
  const copies = [...copy.children];
  originals.forEach((child, index) => {
    if (copies[index]) inlineSvgStyles(child, copies[index], { ...inherited, ...own });
  });
}

function svgPart(svg, origin, clip) {
  const rect = svg.getBoundingClientRect();
  const copy = svg.cloneNode(true);
  inlineSvgStyles(svg, copy);
  const x = rect.left - origin.left;
  const y = rect.top - origin.top;
  copy.setAttribute("x", round(x));
  copy.setAttribute("y", round(y));
  if (rect.width > 0) copy.setAttribute("width", round(rect.width));
  if (rect.height > 0) copy.setAttribute("height", round(rect.height));
  const style = getComputedStyle(svg);
  copy.setAttribute("overflow", style.overflow === "visible" ? "visible" : "hidden");
  copy.removeAttribute("style");
  copy.removeAttribute("tabindex");
  const markup = new XMLSerializer().serializeToString(copy);

  // A drawing wider than its scroll box is cut at the box, as on screen.
  const clipped = clip && rect.width > 0 && (
    rect.left < clip.left || rect.top < clip.top || rect.right > clip.right || rect.bottom > clip.bottom
  );
  if (!clipped) return markup;
  const box = intersect(clip, rect);
  copy.setAttribute("x", round(rect.left - box.left));
  copy.setAttribute("y", round(rect.top - box.top));
  return `<svg${attributes({
    x: round(box.left - origin.left),
    y: round(box.top - origin.top),
    width: round(box.right - box.left),
    height: round(box.bottom - box.top),
    overflow: "hidden",
  })}>${new XMLSerializer().serializeToString(copy)}</svg>`;
}

/** Every drawn part of the frame, in paint order, as SVG markup. */
function frameParts(root, origin) {
  const parts = [];
  function visit(node, clip) {
    if (node.nodeType === 3) {
      parts.push(...textParts(node, origin, clip));
      return;
    }
    if (node.nodeType !== 1) return;
    if (isSvgRoot(node)) {
      const style = getComputedStyle(node);
      if (!isHidden(node, style)) parts.push(svgPart(node, origin, clip));
      return;
    }
    const style = getComputedStyle(node);
    if (isHidden(node, style)) return;
    const background = backgroundPart(node, style, origin);
    if (background) parts.push(background);
    let childClip = clip;
    if (node !== root && clipsOverflow(style)) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) childClip = intersect(clip, rect);
    }
    for (const child of node.childNodes) visit(child, childClip);
  }
  visit(root, null);
  return parts;
}

function frameRoot(element) {
  if (!element || typeof element.querySelector !== "function") return null;
  if (element.matches?.("[data-chart-frame]")) return element;
  return element.querySelector("[data-chart-frame]") || element;
}

// ── Building the SVG ─────────────────────────────────────────────────

async function composeSvg(element, { width, height, renderAtSize = null, embedFonts = true } = {}) {
  if (!element) {
    throw exportError("EXPORT_RENDER_FAILED", "There is no chart on screen to export.");
  }
  const fontCss = embedFonts ? await fontFaceCss() : "";

  const padding = CHART_STYLE.imagePadding;
  let rendered = null;
  try {
    if (renderAtSize) {
      try {
        rendered = await renderAtSize({ width, height, padding });
      } catch (cause) {
        throw exportError(
          "EXPORT_RENDER_FAILED",
          "The chart could not be drawn at the export size.",
          cause,
        );
      }
    }
    const container = rendered?.element ?? rendered;
    const root = frameRoot(container ?? element);
    if (!root) {
      throw exportError("EXPORT_RENDER_FAILED", "There is no chart on screen to export.");
    }
    await globalThis.document?.fonts?.ready;

    // The image box: a redrawn copy's own box (padding already inside it), or
    // the on-screen frame with the padding added around it.
    const frameBox = root.getBoundingClientRect();
    const origin = container && container !== root
      ? container.getBoundingClientRect()
      : {
          left: frameBox.left - padding,
          top: frameBox.top - padding,
          width: frameBox.width + padding * 2,
          height: frameBox.height + padding * 2,
        };
    const outWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : Math.round(origin.width);
    const outHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : Math.ceil(origin.height);
    const parts = frameParts(root, origin);
    const text =
      `<svg xmlns="${SVG_NS}" width="${outWidth}" height="${outHeight}" ` +
      `viewBox="0 0 ${outWidth} ${outHeight}">` +
      (fontCss ? `<defs><style>${fontCss}</style></defs>` : "") +
      `<rect width="${outWidth}" height="${outHeight}" fill="#FFFFFF"/>` +
      parts.join("") +
      "</svg>";
    return { text, width: outWidth, height: outHeight };
  } catch (error) {
    if (error?.code) throw error;
    throw exportError("EXPORT_RENDER_FAILED", "The chart could not be copied for export.", error);
  } finally {
    rendered?.dispose?.();
  }
}

/** Standalone SVG text of the whole chart, frame included. */
export async function buildSvgChart(element, options = {}) {
  return (await composeSvg(element, options)).text;
}

// ── Formats ──────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The chart image failed to load for encoding."));
    image.src = src;
  });
}

async function rasterize({ text, width, height }, { format, scale, quality }) {
  try {
    const image = await loadImage(`data:image/svg+xml;base64,${utf8ToBase64(text)}`);
    const density = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A canvas is required to encode the chart image.");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    return format === "jpeg" ? canvas.toDataURL(mime, quality ?? 0.92) : canvas.toDataURL(mime);
  } catch (cause) {
    throw exportError(
      "EXPORT_ENCODE_FAILED",
      `The chart could not be encoded as ${format === "jpeg" ? "a JPG" : "a PNG"}.`,
      cause,
    );
  }
}

async function encodePdf({ text, width, height }, { filename }) {
  try {
    const svgElement = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
    const { jsPDF } = await import("jspdf");
    const { svg2pdf } = await import("svg2pdf.js");
    const doc = new jsPDF({
      orientation: width >= height ? "landscape" : "portrait",
      unit: "px",
      format: [width, height],
      hotfixes: ["px_scaling"],
      compress: true,
    });
    for (const font of EXPORT_FONTS) {
      const file = font.ttf.split("/").pop();
      doc.addFileToVFS(file, await fetchFontBase64(font.ttf));
      doc.addFont(file, "Inter", font.pdfStyle);
    }
    await svg2pdf(svgElement, doc, { x: 0, y: 0, width, height });
    return doc.output("datauristring", { filename });
  } catch (cause) {
    throw exportError("EXPORT_ENCODE_FAILED", "The chart could not be encoded as a PDF.", cause);
  }
}

/**
 * The chart as a data URL: SVG as drawn, PNG/JPG on a canvas at `scale`
 * pixels per chart pixel, or a vector PDF with Inter embedded.
 */
export async function renderSvgChart(
  element,
  { format = "svg", width, height, scale = 1, quality, renderAtSize = null, filename } = {},
) {
  const svg = await composeSvg(element, {
    width,
    height,
    renderAtSize,
    // jsPDF takes TrueType fonts, registered in encodePdf; svg2pdf ignores @font-face.
    embedFonts: format !== "pdf",
  });
  if (format === "svg") return `data:image/svg+xml;base64,${utf8ToBase64(svg.text)}`;
  if (format === "pdf") return encodePdf(svg, { filename });
  return rasterize(svg, { format, scale, quality });
}
