/**
 * plotClip.js — the rectangle a visx chart clips its marks to when the reader
 * has set an axis range (Advanced Mode) narrower than the data.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Only a ranged axis is clipped. The other stays open, so a marker on the
 * first period or at an automatic axis end is never sliced in half; `bleed`
 * does the same for a marker sitting exactly on the range's end. `left` and
 * `top` place the box when the axis ends sit inside the plot (the scatter
 * plot keeps its points clear of the axis lines).
 *
 * Exports:
 *   plotClipRect({ width, height, left?, top?, clipX?, clipY?, bleed? }) — { x, y, width, height } | null
 *   svgSafeId(prefix, reactId) — an id that reads safely inside url(#…)
 *
 * Data sources:
 *   - Chart model axes (`clip`) and the renderer's plot size
 */

// Far enough past any plot that an unclipped axis never cuts a mark.
const OPEN = 10000;

export function plotClipRect({ width, height, left = 0, top = 0, clipX = false, clipY = false, bleed = 0 }) {
  if (!clipX && !clipY) return null;
  const pad = Math.max(0, Number(bleed) || 0);
  const [x, w] = clipX ? [left - pad, width + 2 * pad] : [-OPEN, width + 2 * OPEN];
  const [y, h] = clipY ? [top - pad, height + 2 * pad] : [-OPEN, height + 2 * OPEN];
  return { x, y, width: w, height: h };
}

/** React's ids contain colons (":r1:"), which some renderers misread in url(#…). */
export function svgSafeId(prefix, reactId) {
  return `${prefix}-${String(reactId).replace(/[^\w-]/g, "")}`;
}
