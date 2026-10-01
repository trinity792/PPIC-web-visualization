/**
 * rowLabels.js — the label column for charts drawn one row per category:
 * horizontal bars (Workstream E), and the range chart, dot plot, and forest
 * plot (F, G, H).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Labels are left-aligned by default, as PPIC's published charts show (owner,
 * September 30, 2026; the style guide shows right-aligned); the alignment
 * setting can still choose center or right. A label too long for the column
 * wraps onto further lines at word boundaries rather than being cut off.
 *
 * Exports:
 *   ROW_LABEL_ALIGNMENTS — "left" | "center" | "right"
 *   rowLabels({ labels, fontSize, maxWidth, alignment? }) — {
 *     width,                                  — the label column's width in px
 *     labels: [{ text, lines, x, textAnchor }] — x within the column, one per label
 *   }
 *
 * Data sources:
 *   - Chart drawings, which pass their category labels and text size
 */

import { textWidth, wrapText } from "./textWidth";

export const ROW_LABEL_ALIGNMENTS = Object.freeze(["left", "center", "right"]);

const ANCHORS = Object.freeze({ left: "start", center: "middle", right: "end" });

export function rowLabels({ labels = [], fontSize = 14, maxWidth = 160, alignment = "left" } = {}) {
  const align = ROW_LABEL_ALIGNMENTS.includes(alignment) ? alignment : "left";
  const wrapped = labels.map((text) => wrapText(text, fontSize, maxWidth));
  const width = Math.min(
    maxWidth,
    Math.max(0, ...wrapped.flat().map((line) => textWidth(line, fontSize))),
  );
  const x = align === "left" ? 0 : align === "center" ? width / 2 : width;
  return {
    width,
    labels: labels.map((text, index) => ({
      text: String(text ?? ""),
      lines: wrapped[index],
      x,
      textAnchor: ANCHORS[align],
    })),
  };
}
