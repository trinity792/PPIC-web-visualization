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
 *     fontMetrics:  { ascent, descent } — Proxima Nova's hhea ascender and descender as
 *                   shares of the font size, for placing text against its baseline
 *     imagePadding  — px of white around an exported image, as PPIC publishes it
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
 *     dot:          { markerSize, minMarkerSize, maxMarkerSize, band, outline,
 *                   labelGap } — the dot plot's dot diameter and its limits,
 *                   the light band behind a row's dots, and the white outline
 *                   on an overlapping dot
 *     forest:       { interval, cap, endpoint, marker, noEffect, labelGap } — the
 *                   forest plot's interval line, its end marks, the one-size
 *                   estimate marker, the line of no effect, and the gap
 *                   before a value label
 *     point:        { radius, grid, labelGap, labelMaxWidth, bubble } — scatter
 *                   points, their grid lines and name labels, and bubble sizing
 *     pie:          { outline, labelGap, leader, labelMaxShare, maxHole } — the
 *                   white edge between slices, the gap between a slice and its
 *                   label, the 1px leader line, the widest share of the chart a
 *                   label column may take, and the donut hole's upper limit
 *     heatmap:      { cellGap, emptyCell, cellText, hoverOutline, minRowHeight,
 *                   maxRowHeight, labelGap, scaleBar } — the heatmap's cells,
 *                   their value text, and the key's gradient bar
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
  // Proxima Nova (unitsPerEm 1000): hhea ascender 1079, descender 325.
  fontMetrics: Object.freeze({ ascent: 1079 / 1000, descent: 325 / 1000 }),
  // Measured from a published PPIC chart image (owner, 2026-10-12): 5px of
  // white on every side of the title, chart, and source box.
  imagePadding: 5,
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
  // The dot plot: several dots per row on a light band from the row's lowest
  // dot to its highest (the business-regulations range references), the
  // range chart's grid, row, and zero lines, and a white outline on a dot
  // that overlaps an earlier one in its row. `markerSize` is a diameter, as
  // Plotly's was, so a saved `markerSize` draws the same size in both.
  dot: Object.freeze({
    markerSize: 9,
    minMarkerSize: 6,
    maxMarkerSize: 20,
    // Paler than the range connector, so a light gray dot still shows on it.
    band: Object.freeze({ width: 6, color: COLORS.chartSourceBox }),
    outline: Object.freeze({ width: 1.5, color: COLORS.white }),
    labelGap: 4,
  }),
  // The forest plot (renderer plan H): a thin gray interval line per row with
  // a mark at each end, one estimate marker of one size (the study weight is
  // never drawn), and a dashed line of no effect. The estimate `size` is a
  // square's side, a dot's diameter, and a diamond's width, so one number
  // keeps every marker the same; end dots and diamonds are a little smaller.
  forest: Object.freeze({
    interval: Object.freeze({ width: 1.5, color: COLORS.gray5 }),
    cap: Object.freeze({ height: 10, width: 1.5, color: COLORS.gray5 }),
    endpoint: Object.freeze({ size: 8, width: 1.5 }),
    marker: Object.freeze({ size: 10, outline: Object.freeze({ width: 1, color: COLORS.white }) }),
    noEffect: Object.freeze({ width: 1.5, color: COLORS.chartAxis, dash: "5 4" }),
    labelGap: 4,
  }),
  // Scatter and bubble charts, as PPIC's published scatter draws them
  // (owner reference, 2026-10-05): small filled points, light grid lines in
  // both directions, 1px axis lines on the left and bottom, bold axis titles
  // inside the plot's top-left and bottom-right corners, and point names
  // beside their points. Bubbles are sized by area up to `maxRadius`, drawn
  // a little translucent with a white outline so overlaps stay readable.
  point: Object.freeze({
    radius: 4,
    grid: Object.freeze({ width: 1, color: COLORS.officialGray }),
    labelGap: 6,
    labelMaxWidth: 96,
    bubble: Object.freeze({ maxRadius: 28, minRadius: 2, opacity: 0.8, outline: COLORS.white }),
  }),
  // The pie chart (renderer plan K): slices separated by a thin white edge,
  // each named and valued outside its slice, joined by a 1px leader line when
  // the label cannot sit beside the slice. `maxHole` is the donut slider's top.
  pie: Object.freeze({
    outline: Object.freeze({ width: 1.5, color: COLORS.white }),
    labelGap: 8,
    leader: Object.freeze({ width: 1, color: COLORS.chartAxis, run: 14 }),
    labelMaxShare: 0.3,
    maxHole: 0.6,
  }),
  // The heatmap (renderer plan I): cells split by thin white gaps, an empty
  // cell outlined in the source-box gray rather than filled with the lowest
  // color, and cell values in white or dark gray, whichever reads better on the
  // cell. The hovered cell takes a dark outline. `scaleBar` is the key's
  // gradient bar.
  heatmap: Object.freeze({
    cellGap: 1,
    emptyCell: Object.freeze({ fill: COLORS.white, stroke: COLORS.chartSourceBox, width: 1 }),
    cellText: Object.freeze({ dark: COLORS.gray5, light: COLORS.white }),
    hoverOutline: Object.freeze({ width: 2, color: COLORS.officialDarkGray }),
    minRowHeight: 18,
    maxRowHeight: 56,
    labelGap: 8,
    scaleBar: Object.freeze({ width: 160, height: 12 }),
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
