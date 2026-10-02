"use client";

/**
 * ChartKey.js — the PPIC chart key (legend) shared by every visx chart.
 *
 * Square swatches no larger than the guide's 20px, an optional key title, and
 * top, right, or bottom placement. A key above or below the chart runs in a
 * wrapping row, as PPIC's published charts draw it. It is ordinary HTML inside ChartFrame, not drawn
 * in the chart's SVG, so long labels wrap normally. A series drawn as a line
 * gets a short line sample instead of a square, dashed when the series is; the
 * range chart's two ends get a dot sample.
 *
 * While the reader hovers one series (the chart's focus), the other entries'
 * samples fade exactly as their bars do, so the key still names every series
 * and matches what the chart shows. Labels stay at full strength (owner,
 * 2026-09-30: hiding them made the key too dim).
 *
 * Props:
 *   entries        {Array<Object>} — [{ id, label, color, kind?, dashed? }];
 *                                    kind "line" draws a line sample, kind
 *                                    "dot" a dot
 *   legendPosition {string}        — "top" | "right" | "bottom" | "hidden"; hidden renders nothing
 *   title          {string|null}   — optional key title
 *   fontSize       {number|null}   — key text size in px (Legend Text Size);
 *                                    defaults to the guide's 14px
 *   focusId        {string|null}   — the focused series; defaults to the
 *                                    surrounding ChartFrame's focus
 *
 * Data sources:
 *   - Via props from parent (ChartFrame, from the chart model)
 *
 * UI Kit reference:
 *   - Implements the "Key / legend structure" rules from the Chart Anatomy panel
 */

import React from "react";

import { useChartFocus } from "@/components/charts/chartFocus";
import { cn } from "@/components/ui/utils";

import { tint } from "@/lib/visualization/chartLayout/contrast";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { keySwatch, dataLine, text } = CHART_STYLE;

// ── Helpers ──────────────────────────────────────────────────────────

function Swatch({ entry, faded = false }) {
  const color = faded ? tint(entry.color, CHART_STYLE.bar.hover.fadeShare) : entry.color;
  if (entry.kind === "dot") {
    // The range chart's ends, drawn as the chart draws them.
    const { dotRadius } = CHART_STYLE.range;
    return (
      <svg
        aria-hidden="true"
        className="shrink-0"
        width={dotRadius * 2}
        height={keySwatch.height}
        data-key-sample="dot"
      >
        <circle cx={dotRadius} cy={keySwatch.height / 2} r={dotRadius} fill={color} />
      </svg>
    );
  }
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
          stroke={color}
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
      style={{ width: keySwatch.width, height: keySwatch.height, backgroundColor: color }}
    />
  );
}

// ── Component ────────────────────────────────────────────────────────

export default function ChartKey({
  entries = [],
  legendPosition = "right",
  title = null,
  fontSize = null,
  focusId = null,
}) {
  const frameFocus = useChartFocus().focusId;
  const focus = focusId ?? frameFocus;
  const focused = entries.some((entry) => entry.id === focus) ? focus : null;
  if (legendPosition === "hidden" || !entries.length) return null;
  const position = ["top", "bottom"].includes(legendPosition) ? legendPosition : "right";

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
          position === "right" ? "flex-col" : "flex-row flex-wrap",
        )}
        style={{
          fontFamily: text.key.fontFamily,
          fontSize: fontSize ?? text.key.fontSize,
          color: text.key.color,
        }}
      >
        {entries.map((entry) => (
          <li
            key={entry.id ?? entry.label}
            className="flex items-center gap-2"
            data-faded={focused && entry.id !== focused ? "" : undefined}
          >
            <Swatch entry={entry} faded={Boolean(focused) && entry.id !== focused} />
            <span>{entry.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
