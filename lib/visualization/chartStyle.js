/**
 * chartStyle.js — the PPIC Data Visualization Style Guide rules every chart
 * reads, in one frozen object.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Every color and the font family come from `lib/constants.js`; this file
 * only composes them into the guide's roles, so a token changed there reaches
 * every chart. The visx charts, `ChartFrame`, the Plotly map defaults
 * (`plotlyDefaults.js`), and the UI Kit's Chart Anatomy panel all read it.
 *
 * Exports:
 *   CHART_STYLE — {
 *     text:         { title, subtitle, keyTitle, key, eyebrow, axis, dataLabel, source }
 *                   each { fontFamily, fontSize, fontWeight, color, letterSpacing? }
 *     dataLine:     { width }              — 2px series lines
 *     graphLine:    { width, color }       — 1px axis and grid lines
 *     tableDivider: { width, color }       — 1px table row dividers
 *     sourceBox:    { background, padding, gap, caption } — the source-and-notes
 *                   box, as PPIC publishes it: gray, 15px inside, 20px below
 *                   the chart, with bold uppercase "Source:" / "Notes:" captions
 *     partSpacing   — the guide's px between chart parts (48), quoted by the UI Kit
 *     frameGap:     { header, key, keySide } — the px ChartFrame actually draws
 *                   below the title block and between the key and the chart
 *     keySwatch:    { width, height }      — square key swatch, the guide's maximum
 *     minBarWidth   — px, the narrowest bar the guide allows
 *     bar:          { rail, labelGap, labelInset, groupDivider, hover } — the
 *                   track rail's fill, the gap between a bar's end and an
 *                   outside value label, an inside label's inset from the bar's
 *                   end, the divider between nested category groups, and the
 *                   hover look (faded share, darkening, official shade pairs,
 *                   category label colors)
 *     range:        { dotRadius, connector, arrow, grid, rowLine, zeroLine,
 *                   labelGap } — the range chart's end dots, the light
 *                   connector or the arrow between them, its grid, row, and
 *                   zero lines, and the gap before a value label
 *     exportWidths  — the guide's standard figure widths, widest first
 *     grid:         { horizontal, vertical } — which grid lines a chart draws
 *     hoverLabel:   { name, detail, ring, leader, halo } — the point label
 *                   shown on hover, matching PPIC's published charts
 *   }
 *
 * Data sources:
 *   - lib/constants.js (COLORS, CHART_FONT_FAMILY)
 *   - docs/ref/Data Visualization Style Guide_062321-1 5 3.pdf (pp.11–12, 18–21)
 */

import { CHART_FONT_FAMILY, COLORS } from "@/lib/constants";

// ── Helpers ──────────────────────────────────────────────────────────

function textRole(fontSize, { fontWeight = 400, color = COLORS.officialDarkGray, ...rest } = {}) {
  return Object.freeze({ fontFamily: CHART_FONT_FAMILY, fontSize, fontWeight, color, ...rest });
}

// ── Style rules ──────────────────────────────────────────────────────

export const CHART_STYLE = Object.freeze({
  text: Object.freeze({
    title: textRole(20, { fontWeight: 700 }),
    subtitle: textRole(18, { color: COLORS.chartSubtitle }),
    keyTitle: textRole(16, { fontWeight: 700 }),
    key: textRole(14),
    eyebrow: textRole(12, { fontWeight: 700, letterSpacing: "0.05em" }),
    axis: textRole(14, { color: COLORS.chartAxis }),
    dataLabel: textRole(14),
    // Matches PPIC's published (Datawrapper) source box: 11px on 16px lines,
    // in the graph-line gray.
    source: textRole(11, { color: COLORS.chartAxis, lineHeight: "16px" }),
  }),
  dataLine: Object.freeze({ width: 2 }),
  graphLine: Object.freeze({ width: 1, color: COLORS.chartAxis }),
  tableDivider: Object.freeze({ width: 1, color: COLORS.chartSourceBox }),
  sourceBox: Object.freeze({
    background: COLORS.chartSourceBox,
    padding: 15,
    gap: 20,
    caption: Object.freeze({ fontWeight: 700, textTransform: "uppercase" }),
  }),
  partSpacing: 48,
  // The spacing ChartFrame draws, tighter than the guide's 48px as PPIC's
  // published charts are (owner, 2026-10-01): below the title block, and
  // between the key and the chart (a key on the right sits further away).
  frameGap: Object.freeze({ header: 20, key: 12, keySide: 24 }),
  keySwatch: Object.freeze({ width: 20, height: 20 }),
  minBarWidth: 10,
  // PPIC's published bar charts: a pale full-length rail behind each bar, value
  // labels a few px past (or inside) the bar's end, and 1px gray dividers
  // between nested category groups.
  bar: Object.freeze({
    rail: COLORS.chartSourceBox,
    labelGap: 4,
    labelInset: 6,
    groupDivider: Object.freeze({ width: 1, color: COLORS.chartAxis }),
    // Hover, as PPIC's published bar charts do it (owner, 2026-09-30): other
    // series fade to 30% of their color; a lone series' hovered bar darkens,
    // official orange to official red; the hovered category label turns bold
    // and dark (the others are gray enough already).
    hover: Object.freeze({
      fadeShare: 0.3,
      darken: 15,
      shades: Object.freeze({ [COLORS.officialOrange]: COLORS.officialRed }),
      category: COLORS.officialDarkGray,
    }),
  }),
  // The range chart (dumbbell), as PPIC's published range plots draw it
  // (mockups/range chart reference/): each end a filled dot in its own color, a
  // thick light connector between them (or an arrow from start to end), a
  // light vertical grid line at each tick, a dotted guide line along each row,
  // and a darker line at zero.
  range: Object.freeze({
    dotRadius: 6,
    connector: Object.freeze({ width: 6, color: COLORS.officialGray }),
    arrow: Object.freeze({ width: 3, head: 7 }),
    grid: Object.freeze({ width: 1, color: COLORS.officialGray }),
    rowLine: Object.freeze({ width: 1, color: COLORS.gray3, dash: "1 3" }),
    zeroLine: Object.freeze({ width: 1, color: COLORS.chartAxis }),
    labelGap: 4,
  }),
  exportWidths: Object.freeze([950, 650, 330]),
  // The guide asks for horizontal grid lines only; bars and points are
  // labeled directly instead of read against vertical rules.
  grid: Object.freeze({ horizontal: true, vertical: false }),
  // The hover label on PPIC's published (Datawrapper) charts: no box, the
  // series name in bold over the period and value in gray, a white halo so it
  // reads over lines, and a ring on the point joined to the label by a tick.
  hoverLabel: Object.freeze({
    name: textRole(14, { fontWeight: 700 }),
    detail: textRole(13, { color: COLORS.chartAxis }),
    ring: Object.freeze({ radius: 5, width: 1, color: COLORS.chartAxis }),
    leader: Object.freeze({ gap: 5, length: 10 }),
    halo: COLORS.white,
  }),
});
