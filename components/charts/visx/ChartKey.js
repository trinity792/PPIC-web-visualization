"use client";

/**
 * ChartKey.js — the PPIC chart key (legend) shared by every visx chart.
 *
 * Square swatches no larger than the guide's 20px, an optional key title, and
 * right or bottom placement. It is ordinary HTML inside ChartFrame, not drawn
 * in the chart's SVG, so long labels wrap normally. A series drawn as a line
 * gets a short line sample instead of a square, dashed when the series is.
 *
 * Props:
 *   entries        {Array<Object>} — [{ id, label, color, kind?, dashed? }];
 *                                    kind "line" draws a line sample
 *   legendPosition {string}        — "right" | "bottom" | "hidden"; hidden renders nothing
 *   title          {string|null}   — optional key title
 *   fontSize       {number|null}   — key text size in px (Legend Text Size);
 *                                    defaults to the guide's 14px
 *
 * Data sources:
 *   - Via props from parent (ChartFrame, from the chart model)
 *
 * UI Kit reference:
 *   - Implements the "Key / legend structure" rules from the Chart Anatomy panel
 */

import React from "react";

import { cn } from "@/components/ui/utils";

import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { keySwatch, dataLine, text } = CHART_STYLE;

// ── Helpers ──────────────────────────────────────────────────────────

function Swatch({ entry }) {
  if (entry.kind === "line") {
    const middle = keySwatch.height / 2;
    return (
      <svg
        aria-hidden="true"
        className="shrink-0"
        width={keySwatch.width}
        height={keySwatch.height}
        data-key-sample="line"
      >
        <line
          x1={0}
          x2={keySwatch.width}
          y1={middle}
          y2={middle}
          stroke={entry.color}
          strokeWidth={dataLine.width}
          strokeDasharray={entry.dashed ? "4 3" : undefined}
        />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="shrink-0"
      data-key-swatch=""
      style={{ width: keySwatch.width, height: keySwatch.height, backgroundColor: entry.color }}
    />
  );
}

// ── Component ────────────────────────────────────────────────────────

export default function ChartKey({ entries = [], legendPosition = "right", title = null, fontSize = null }) {
  if (legendPosition === "hidden" || !entries.length) return null;
  const position = legendPosition === "bottom" ? "bottom" : "right";

  return (
    <div data-key-position={position} className="min-w-0">
      {title ? (
        <p
          className="mb-2"
          style={{
            fontFamily: text.keyTitle.fontFamily,
            fontSize: text.keyTitle.fontSize,
            fontWeight: text.keyTitle.fontWeight,
            color: text.keyTitle.color,
          }}
        >
          {title}
        </p>
      ) : null}
      <ul
        className={cn(
          "flex gap-x-4 gap-y-2",
          position === "bottom" ? "flex-row flex-wrap" : "flex-col",
        )}
        style={{
          fontFamily: text.key.fontFamily,
          fontSize: fontSize ?? text.key.fontSize,
          color: text.key.color,
        }}
      >
        {entries.map((entry) => (
          <li key={entry.id ?? entry.label} className="flex items-center gap-2">
            <Swatch entry={entry} />
            <span>{entry.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
