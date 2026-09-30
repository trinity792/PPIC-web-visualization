/**
 * directLabels.js — where each line's end label goes, and whether they all fit.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * The style guide labels lines directly, in their own color, instead of with a
 * key. Each label starts at the height of its line's last available point;
 * overlapping labels are pushed apart without changing their top-to-bottom
 * order. The result reports "does not fit" when there are more than four lines
 * (the guide's limit) or when the labels cannot all fit the chart height, and
 * the line chart then falls back to the shared key.
 *
 * A label is written in its line's color. A pale color that would not reach
 * 4.5:1 contrast on white is darkened (same hue) until it does, as PPIC's
 * published charts do, so every label stays readable and matches its line.
 *
 * Exports:
 *   MAX_DIRECT_LABELS — 4
 *   directLabels({ series, height, fontSize }) — { fits, labels: [{ id, label,
 *     color, textColor, y }] } in the input series order
 *
 * Data sources:
 *   - LineChart, which passes each series' points with pixel `y` positions
 */

import { readableTextColor } from "./contrast";

export const MAX_DIRECT_LABELS = 4;

function lastAvailablePoint(points = []) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point?.status === "available" && Number.isFinite(point.y)) return point;
  }
  return null;
}

export function directLabels({ series = [], height = 0, fontSize = 14 } = {}) {
  const placed = series
    .map((entry, order) => ({ entry, order, point: lastAvailablePoint(entry.points) }))
    .filter(({ point }) => point);
  const top = fontSize / 2;
  const bottom = height - fontSize / 2;
  const fits =
    placed.length > 0 &&
    series.length <= MAX_DIRECT_LABELS &&
    placed.length * fontSize <= height;

  // Sweep down pushing each label below the one above it, then sweep up from
  // the bottom edge; both keep the order, so no two labels ever swap.
  const byHeight = [...placed].sort((a, b) => a.point.y - b.point.y || a.order - b.order);
  const ys = byHeight.map(({ point }) => Math.min(bottom, Math.max(top, point.y)));
  for (let index = 1; index < ys.length; index += 1) {
    ys[index] = Math.max(ys[index], ys[index - 1] + fontSize);
  }
  if (ys.length && ys.at(-1) > bottom) ys[ys.length - 1] = bottom;
  for (let index = ys.length - 2; index >= 0; index -= 1) {
    ys[index] = Math.min(ys[index], ys[index + 1] - fontSize);
  }
  const yById = new Map(byHeight.map(({ entry }, index) => [entry.id, ys[index]]));

  const labels = placed.map(({ entry }) => ({
    id: entry.id,
    label: entry.label,
    color: entry.color,
    textColor: readableTextColor(entry.color),
    y: yById.get(entry.id),
  }));
  return { fits, labels };
}
