/**
 * pointLabels.js — where each scatter point's name goes, so names sit beside
 * their points without covering another name, another point, or the plot's
 * edge.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Follows the owner's reference scatter (2026-10-05): a name sits to the right
 * of its point, else to the left, above, or below, in that order, and wraps
 * onto two or three short lines ("Central / Valley and / Sierra"). A point in
 * a corner, where none of those fit, tries above or below again with the name
 * starting or ending at the point, so it reads away from the edge. Points are
 * placed in data order, and a name that fits nowhere is left out; the chart's
 * hover label still names that point. Everything here is in px within the
 * plot, so the same answer comes out in jsdom and in a browser.
 *
 * Exports:
 *   LABEL_SIDES — "right" | "left" | "above" | "below", then the corner
 *                 placements "above-left" | "above-right" | "below-left" |
 *                 "below-right", in the order tried
 *   placePointLabels({ points, fontSize, lineHeight?, maxWidth, gap?, width,
 *                      height, obstacles? }) — one entry per point:
 *     { side, x, y, textAnchor, lines, box } or null when its name does not fit.
 *     `points` are [{ x, y, radius, text }]; `obstacles` are boxes
 *     { x0, y0, x1, y1 } the names must also avoid (the axis titles). `x` is
 *     the text's anchor and `y` the first line's middle.
 *
 * Data sources:
 *   - PointChart, which passes its points' pixel positions
 */

import { textWidth, wrapText } from "./textWidth";

export const LABEL_SIDES = Object.freeze([
  "right",
  "left",
  "above",
  "below",
  "above-left",
  "above-right",
  "below-left",
  "below-right",
]);

// Names keep this much air between each other.
const PADDING = 2;

// ── Helpers ──────────────────────────────────────────────────────────

function overlaps(a, b) {
  return a.x0 < b.x1 + PADDING && b.x0 < a.x1 + PADDING && a.y0 < b.y1 + PADDING && b.y0 < a.y1 + PADDING;
}

/** Whether a circle touches a box (nearest point of the box within the radius). */
function touchesCircle(box, circle) {
  const nearestX = Math.max(box.x0, Math.min(circle.x, box.x1));
  const nearestY = Math.max(box.y0, Math.min(circle.y, box.y1));
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.radius + PADDING;
}

/** The label's box, anchor, and first-line middle for one side of its point. */
function candidate(point, side, { width, height, lineSize, gap }) {
  const reach = point.radius + gap;
  if (side === "right" || side === "left") {
    const x0 = side === "right" ? point.x + reach : point.x - reach - width;
    const y0 = point.y - height / 2;
    return {
      side,
      x: side === "right" ? x0 : x0 + width,
      y: y0 + lineSize / 2,
      textAnchor: side === "right" ? "start" : "end",
      box: { x0, y0, x1: x0 + width, y1: y0 + height },
    };
  }
  const [vertical, horizontal] = side.split("-");
  const y0 = vertical === "above" ? point.y - reach - height : point.y + reach;
  // Centered on the point, or ending (left) or starting (right) at it.
  const x0 = horizontal === "left" ? point.x - width : horizontal === "right" ? point.x : point.x - width / 2;
  return {
    side,
    x: point.x,
    y: y0 + lineSize / 2,
    textAnchor: horizontal === "left" ? "end" : horizontal === "right" ? "start" : "middle",
    box: { x0, y0, x1: x0 + width, y1: y0 + height },
  };
}

// ── Public API ───────────────────────────────────────────────────────

export function placePointLabels({
  points = [],
  fontSize = 14,
  lineHeight = 1.2,
  maxWidth = 96,
  gap = 6,
  width = 0,
  height = 0,
  obstacles = [],
} = {}) {
  const lineSize = fontSize * lineHeight;
  const placed = [...obstacles];
  return points.map((_, index) => placeOne(index));

  function placeOne(index) {
    const point = points[index];
    if (!point?.text) return null;
    const lines = wrapText(point.text, fontSize, maxWidth);
    const size = {
      width: Math.max(...lines.map((line) => textWidth(line, fontSize))),
      height: lines.length * lineSize,
      lineSize,
      gap,
    };
    for (const side of LABEL_SIDES) {
      const spot = candidate(point, side, size);
      const { box } = spot;
      if (box.x0 < 0 || box.y0 < 0 || box.x1 > width || box.y1 > height) continue;
      if (placed.some((other) => overlaps(box, other))) continue;
      if (points.some((other, otherIndex) => otherIndex !== index && other && touchesCircle(box, other))) continue;
      placed.push(box);
      return { ...spot, lines };
    }
    return null;
  }
}
