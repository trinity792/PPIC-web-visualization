/**
 * textWidth.js — an estimate of how wide a line of chart text is, in px, and
 * how a label wraps to fit a width.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Chart layout reserves room for tick labels and direct labels before
 * anything is drawn, and must give the same answer in jsdom (which cannot
 * measure text) as in a browser. Inter's average glyph is a little over half
 * its font size, so 0.56em per character slightly over-reserves, which is the
 * safe direction: labels get a few spare pixels rather than being clipped.
 *
 * Where a label must line up exactly (the y-axis tick labels, whose widest
 * one sits on the chart's left edge with the title), `interTextWidth` adds up
 * Inter Regular's real advance widths instead, read from the font file the
 * export embeds (public/fonts/Inter-Regular.ttf). It is still the same answer
 * in jsdom and a browser; it ignores kerning, so it can run about 1px wide.
 *
 * Exports:
 *   textWidth(text, fontSize)            — estimated width in px
 *   interTextWidth(text, fontSize)       — width in px from Inter Regular's
 *     advance widths (printable ASCII; other characters use the estimate)
 *   wrapText(text, fontSize, maxWidth)   — the label split into lines at word
 *     boundaries, each no wider than maxWidth unless one word alone is wider;
 *     the lines rejoined with spaces are always the original text
 *
 * Data sources:
 *   - Chart text from the visx chart models
 */

const AVERAGE_GLYPH_EM = 0.56;

// Inter Regular advance widths in em (hmtx / unitsPerEm 2048), for the
// characters " " (32) through "~" (126), in order.
const INTER_ADVANCE_EM = Object.freeze([
  0.2812, 0.2876, 0.4658, 0.6333, 0.6416, 0.9819, 0.644, 0.2998, 0.3647, 0.3647,
  0.501, 0.6616, 0.2881, 0.46, 0.2881, 0.3604, 0.6309, 0.4067, 0.6099, 0.6177,
  0.646, 0.5933, 0.6201, 0.5659, 0.6187, 0.6201, 0.2881, 0.3018, 0.6616, 0.6616,
  0.6616, 0.5112, 0.9658, 0.6899, 0.6543, 0.7305, 0.7217, 0.6011, 0.5903, 0.7461,
  0.7432, 0.2686, 0.5708, 0.6719, 0.5654, 0.9033, 0.7534, 0.7646, 0.6387, 0.7646,
  0.6436, 0.6416, 0.6455, 0.7441, 0.6899, 0.9854, 0.6821, 0.6787, 0.6289, 0.3647,
  0.3604, 0.3647, 0.4712, 0.4561, 0.3228, 0.5615, 0.6123, 0.5713, 0.6123, 0.583,
  0.3701, 0.6133, 0.5913, 0.2422, 0.2422, 0.5488, 0.2422, 0.876, 0.5908, 0.5996,
  0.6123, 0.6123, 0.3765, 0.5278, 0.3271, 0.5913, 0.562, 0.8184, 0.5459, 0.562,
  0.5522, 0.4263, 0.3325, 0.4263, 0.6616,
]);

export function textWidth(text, fontSize) {
  return Math.ceil(String(text ?? "").length * fontSize * AVERAGE_GLYPH_EM);
}

export function interTextWidth(text, fontSize) {
  let em = 0;
  for (const character of String(text ?? "")) {
    const code = character.codePointAt(0);
    em += code >= 32 && code <= 126 ? INTER_ADVANCE_EM[code - 32] : AVERAGE_GLYPH_EM;
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
