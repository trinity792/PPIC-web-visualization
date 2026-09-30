/**
 * textWidth.js — an estimate of how wide a line of chart text is, in px.
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
 *   textWidth(text, fontSize) — estimated width in px
 *
 * Data sources:
 *   - Chart text from the visx chart models
 */

const AVERAGE_GLYPH_EM = 0.56;

export function textWidth(text, fontSize) {
  return Math.ceil(String(text ?? "").length * fontSize * AVERAGE_GLYPH_EM);
}
