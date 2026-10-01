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
 * Exports:
 *   textWidth(text, fontSize)            — estimated width in px
 *   wrapText(text, fontSize, maxWidth)   — the label split into lines at word
 *     boundaries, each no wider than maxWidth unless one word alone is wider;
 *     the lines rejoined with spaces are always the original text
 *
 * Data sources:
 *   - Chart text from the visx chart models
 */

const AVERAGE_GLYPH_EM = 0.56;

export function textWidth(text, fontSize) {
  return Math.ceil(String(text ?? "").length * fontSize * AVERAGE_GLYPH_EM);
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
