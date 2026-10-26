/**
 * textWidth.js — an estimate of how wide a line of chart text is, in px, and
 * how a label wraps to fit a width.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Chart layout reserves room for tick labels and direct labels before
 * anything is drawn, and must give the same answer in jsdom (which cannot
 * measure text) as in a browser. Proxima Nova's average glyph is a little over half
 * its font size, so 0.56em per character slightly over-reserves, which is the
 * safe direction: labels get a few spare pixels rather than being clipped.
 *
 * Where a label must line up exactly (the y-axis tick labels, whose widest
 * one sits on the chart's left edge with the title), `chartTextWidth` adds up
 * Proxima Nova Regular's real advance widths instead, read from the same Adobe Fonts face
 * used by the website and image exports. It is still the same answer
 * in jsdom and a browser; it ignores kerning, so it can run about 1px wide.
 *
 * Exports:
 *   textWidth(text, fontSize)            — estimated width in px
 *   chartTextWidth(text, fontSize)       — width in px from Proxima Nova Regular's
 *     advance widths (printable ASCII; other characters use the estimate)
 *   wrapText(text, fontSize, maxWidth)   — the label split into lines at word
 *     boundaries, each no wider than maxWidth unless one word alone is wider;
 *     the lines rejoined with spaces are always the original text
 *
 * Data sources:
 *   - Chart text from the visx chart models
 */

const AVERAGE_GLYPH_EM = 0.56;

// Proxima Nova Regular advance widths in em (hmtx / unitsPerEm 1000), for the
// characters " " (32) through "~" (126), in order.
const PROXIMA_ADVANCE_EM = Object.freeze([
  0.258, 0.23, 0.343, 0.59, 0.593, 0.731, 0.641, 0.199, 0.248, 0.248,
  0.34, 0.499, 0.23, 0.3, 0.23, 0.296, 0.612, 0.339, 0.588, 0.557,
  0.558, 0.59, 0.591, 0.515, 0.581, 0.591, 0.23, 0.23, 0.499, 0.499,
  0.499, 0.462, 0.783, 0.658, 0.629, 0.676, 0.7, 0.569, 0.55, 0.713,
  0.712, 0.239, 0.475, 0.601, 0.51, 0.809, 0.708, 0.765, 0.587, 0.765,
  0.608, 0.586, 0.57, 0.7, 0.658, 0.883, 0.652, 0.626, 0.585, 0.243,
  0.296, 0.243, 0.432, 0.564, 0.226, 0.527, 0.575, 0.495, 0.575, 0.563,
  0.283, 0.574, 0.552, 0.225, 0.225, 0.514, 0.225, 0.808, 0.551, 0.572,
  0.574, 0.574, 0.33, 0.465, 0.294, 0.551, 0.49, 0.734, 0.486, 0.49,
  0.472, 0.26, 0.211, 0.26, 0.503,
]);

export function textWidth(text, fontSize) {
  return Math.ceil(String(text ?? "").length * fontSize * AVERAGE_GLYPH_EM);
}

export function chartTextWidth(text, fontSize) {
  let em = 0;
  for (const character of String(text ?? "")) {
    const code = character.codePointAt(0);
    em += code >= 32 && code <= 126 ? PROXIMA_ADVANCE_EM[code - 32] : AVERAGE_GLYPH_EM;
  }
  return em * fontSize;
}

export function wrapText(text, fontSize, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const line = lines.at(-1);
    if (line !== undefined && textWidth(`${line} ${word}`, fontSize) <= maxWidth) {
      lines[lines.length - 1] = `${line} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines.length ? lines : [""];
}
