/**
 * chartTypeIcons.js — the small chart drawings on the sidebar's chart-type tiles.
 *
 * One inline-SVG drawing per chart type, drawn on a shared 64×48 canvas so the
 * tiles line up. A family tile (Maps, Scatter) shows the drawing of the
 * variant it currently stands for when that variant has one of its own — the
 * Maps tile switches between the choropleth and symbol drawings (owner,
 * 2026-10-12) — and its opening variant's drawing otherwise. A chart with no
 * drawing gets a generic fallback, so a newly registered type still renders a
 * complete tile.
 *
 * Colors are palette tokens only (`var(--ppic-*)`, generated from
 * lib/constants.js into app/globals.css); a test rejects hex literals here.
 *
 * Props (ChartTypeIcon):
 *   id         {string} — chart type id (e.g. "line", "choroplethMap")
 *   className  {string} — sizing classes for the svg
 *
 * Data sources:
 *   - None (static drawings)
 *
 * UI Kit reference:
 *   - Implements the "Chart Type tile" pattern in the Editor Sidebar showcase
 */

import React from "react";

import { cn } from "@/components/ui/utils";

// ── Palette ──────────────────────────────────────────────────────────

const DARK = "var(--ppic-data-blue)";
const MID = "var(--ppic-navy-blue-100)";
const LIGHT = "var(--ppic-navy-blue-50)";
const DEEP = "var(--ppic-navy-blue-200)";
const ACCENT = "var(--ppic-brand)";
const RULE = "var(--ppic-neutral-100)";
const PALE = "var(--ppic-neutral-50)";

// ── Shared shapes ────────────────────────────────────────────────────

// A simplified California, shared by both map drawings.
const CALIFORNIA =
  "M16 3 L32 3 L32 17 L50 35 L50 41 L43 46 L34 38 L26 31 L19 22 L15 12 Z";

function Baseline() {
  return <line x1="6" y1="42" x2="58" y2="42" stroke={RULE} strokeWidth="2" strokeLinecap="round" />;
}

// ── Drawings ─────────────────────────────────────────────────────────

const DRAWINGS = {
  line: () => (
    <>
      <Baseline />
      <polyline points="8,39 18,35 28,36 38,30 52,27" fill="none" stroke={MID} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="8,35 18,26 28,30 38,17 52,13" fill="none" stroke={ACCENT} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  bar: () => (
    <>
      <Baseline />
      <rect x="11" y="21" width="8" height="21" rx="1" fill={DARK} />
      <rect x="23" y="9" width="8" height="33" rx="1" fill={DARK} />
      <rect x="35" y="17" width="8" height="25" rx="1" fill={DARK} />
      <rect x="47" y="31" width="8" height="11" rx="1" fill={MID} />
    </>
  ),
  dumbbell: () => (
    <>
      {[
        [16, 44, 10],
        [12, 34, 24],
        [22, 52, 38],
      ].map(([start, end, y]) => (
        <g key={y}>
          <line x1={start} y1={y} x2={end} y2={y} stroke={RULE} strokeWidth="3.5" />
          <circle cx={start} cy={y} r="4.5" fill={MID} />
          <circle cx={end} cy={y} r="4.5" fill={DARK} />
        </g>
      ))}
    </>
  ),
  choroplethMap: () => (
    <>
      <path d="M16 3 L32 3 L32 17 L17.8 19 L15 12 Z" fill={DARK} />
      <path d="M17.8 19 L32 17 L40 25 L30 34.5 L26 31 L19 22 Z" fill={LIGHT} />
      <path d="M30 34.5 L40 25 L50 35 L50 41 L43 46 L34 38 Z" fill={MID} />
      <path d={CALIFORNIA} fill="none" stroke={DARK} strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  symbolMap: () => (
    <>
      <path d={CALIFORNIA} fill={PALE} stroke={RULE} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="23" cy="10" r="4" fill={MID} />
      <circle cx="28" cy="23" r="2.5" fill={MID} />
      <circle cx="41" cy="36" r="5.5" fill={MID} />
    </>
  ),
  forest: () => (
    <>
      <line x1="34" y1="3" x2="34" y2="45" stroke={RULE} strokeWidth="2" strokeDasharray="3 2" />
      {[
        [16, 42, 27, 10],
        [24, 52, 38, 24],
        [12, 36, 21, 38],
      ].map(([start, end, center, y]) => (
        <g key={y}>
          <line x1={start} y1={y} x2={end} y2={y} stroke={DARK} strokeWidth="2.5" />
          <rect x={center - 4} y={y - 4} width="8" height="8" fill={DARK} />
        </g>
      ))}
    </>
  ),
  scatter: () => (
    <>
      <polyline points="8,4 8,42 58,42" fill="none" stroke={RULE} strokeWidth="2" />
      {[
        [15, 36],
        [20, 31],
        [23, 35],
        [26, 25],
        [31, 28],
        [36, 30],
        [39, 20],
        [44, 18],
        [41, 30],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" fill={DARK} />
      ))}
    </>
  ),
  // A donut from three dashed rings: circumference 2π·12.5 ≈ 78.5.
  pie: () => (
    <g transform="rotate(-90 32 24)" fill="none" strokeWidth="11">
      <circle cx="32" cy="24" r="12.5" stroke={DARK} strokeDasharray="22 78.5" />
      <circle cx="32" cy="24" r="12.5" stroke={DEEP} strokeDasharray="17 78.5" strokeDashoffset="-22" />
      <circle cx="32" cy="24" r="12.5" stroke={MID} strokeDasharray="39.5 78.5" strokeDashoffset="-39" />
    </g>
  ),
  heatmap: () => (
    <>
      {[
        [PALE, MID, DARK, DARK],
        [LIGHT, MID, PALE, MID],
        [DARK, LIGHT, MID, LIGHT],
        [MID, DARK, PALE, LIGHT],
      ].flatMap((row, r) =>
        row.map((fill, c) => (
          <rect key={`${r}-${c}`} x={13 + c * 10} y={5 + r * 10} width="8" height="8" rx="1" fill={fill} />
        )),
      )}
    </>
  ),
  dataTable: () => (
    <>
      <rect x="10" y="6" width="44" height="36" rx="3" fill="none" stroke={DARK} strokeWidth="2.5" />
      <path d="M10 9 A3 3 0 0 1 13 6 L51 6 A3 3 0 0 1 54 9 L54 14 L10 14 Z" fill={DARK} />
      <line x1="12" y1="24" x2="52" y2="24" stroke={RULE} strokeWidth="2" />
      <line x1="12" y1="33" x2="52" y2="33" stroke={RULE} strokeWidth="2" />
      <line x1="30" y1="14" x2="30" y2="40" stroke={RULE} strokeWidth="2" />
    </>
  ),
};

function Fallback() {
  return (
    <>
      <rect x="10" y="6" width="44" height="36" rx="3" fill="none" stroke={RULE} strokeWidth="2" />
      <polyline points="16,34 26,26 34,30 48,16" fill="none" stroke={MID} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

// ── Exports ──────────────────────────────────────────────────────────

/** Whether `id` has a drawing of its own (otherwise the fallback is drawn). */
export function hasChartTypeIcon(id) {
  return Object.hasOwn(DRAWINGS, id);
}

export function ChartTypeIcon({ id, className }) {
  const known = hasChartTypeIcon(id);
  const Drawing = known ? DRAWINGS[id] : Fallback;
  return (
    <svg
      viewBox="0 0 64 48"
      aria-hidden="true"
      focusable="false"
      data-chart-icon={known ? id : "fallback"}
      className={cn("h-15 w-20 shrink-0", className)}
    >
      <Drawing />
    </svg>
  );
}

export default ChartTypeIcon;
