"use client";

/**
 * BarChart.js — the visx bar chart, drawn from a bar model at an exact size.
 *
 * Follows the PPIC style guide and PPIC's published bar charts (renderer plan
 * E): the value axis starts at zero, no bar is narrower than 10px, horizontal
 * grid lines only (horizontal bars draw none, since theirs would be vertical),
 * 1px axis lines in the axis color, and a stack shaded dark to light (the
 * model hands out the colors).
 *
 * Categories: a vertical chart wraps a long category label onto two lines, and
 * angles every label 45 degrees when that is still not enough, and turns
 * them upright when the bars are too close for angled labels. Nested
 * categories put the outer label under the inner ones with a divider between
 * groups; horizontal rows get a bold header row per group instead. Bars along
 * periods label only the periods `periodTicks` picks, as the line chart does.
 * Horizontal bars take their left-aligned row labels from `rowLabels.js`.
 *
 * Space: the gap between category groups is `groupGap` bar widths. When bars
 * would be narrower than 10px, the gap shrinks first; when even that is not
 * enough, the chart asks for fewer categories instead of drawing thinner bars.
 *
 * Value labels: an inside label sits at the end of a vertical bar or the start
 * of a horizontal one, in white or dark text, whichever reads better on the
 * bar. An outside label sits just past the bar's end (below a negative
 * vertical bar). An inside label that does not fit moves outside; an outside
 * one that would leave the plot moves inside; a stacked segment too small for
 * its label shows none. A label that would overlap another is left out, and
 * its value stays in hover and View Data.
 *
 * Key: with the key set to "automatic", stacked vertical bars name each series
 * beside the last stack (the line chart's direct-label rules); when the names
 * do not fit, or the bars are not stacked, the chart draws the shared key on
 * its right. Other key positions are drawn by ChartFrame.
 *
 * Hover, as PPIC's published bar charts do it (owner, 2026-09-30): the
 * information goes on the chart, not in a floating box. With several series,
 * the hovered bar's series keeps its color and shows every one of its values,
 * the other series fade to a 30% tint, and the key (here or in ChartFrame,
 * through chartFocus.js) fades the other swatches the same way. A stacked
 * segment too small for its value shows it past the end of the stack. With
 * one series, the hovered
 * bar darkens (official orange to official red) and shows its value above it
 * in bold, unless its value label is already shown. Either way the hovered
 * category label turns bold and dark; the others stay as they are. The hovered value
 * carries role="tooltip" with the series and category for screen readers.
 *
 * Keyboard: the chart takes focus; the arrow keys step through the bars, Home
 * and End jump to the first and last, and Escape clears the hover. New data
 * clears it too.
 *
 * Props:
 *   model  {Object} — from buildBarModel (lib/visualization/models/barModel.js)
 *   width  {number} — exact drawing width in px, from ChartFrame
 *   height {number} — exact drawing height in px, from ChartFrame
 *
 * Data sources:
 *   - Via props from ChartRenderer
 *
 * UI Kit reference:
 *   - Implements the "Chart Anatomy" bar rules from the UI Kit page
 */

import React from "react";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";

import { useChartFocus } from "@/components/charts/chartFocus";
import ChartKey from "@/components/charts/visx/ChartKey";

import { periodTicks } from "@/lib/visualization/chartLayout/axisScale";
import { darken, readableTextColor, textColorOn, tint } from "@/lib/visualization/chartLayout/contrast";
import { directLabels } from "@/lib/visualization/chartLayout/directLabels";
import { rowLabels } from "@/lib/visualization/chartLayout/rowLabels";
import { textWidth, wrapText } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { COLORS } from "@/lib/constants";

const { text, graphLine, hoverLabel, minBarWidth, bar: barStyle } = CHART_STYLE;
const hoverStyle = barStyle.hover;
const EDGE = 12; // breathing room at the plot edges
const TICK_GAP = 8;
const LABEL_GAP = 8;
const KEY_GAP = 16;
const INNER_GAP = 2; // between bars of one group
const DEFAULT_GROUP_GAP = 0.75; // bar widths between neighbouring groups
const MAX_ROW_BAR = 36; // horizontal bars stay bar-like, not blocks
const MAX_CATEGORY_LINES = 2;
// Angled labels need about two text heights between bars not to touch.
const ANGLED_LABEL_SLOT = 2;
const LINE_HEIGHT = 1.2;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Tick labels as plain SVG text. visx's default wraps each label in a nested
 * <svg>, which browsers expose as an image, so screen readers would announce
 * every tick as a separate picture.
 */
function TickLabel({ formattedValue, dx = 0, dy = 0, ...props }) {
  return (
    <text {...props} dx={dx} dy={dy} data-mark="axis-tick-label">
      {formattedValue}
    </text>
  );
}

/**
 * Where each category slot sits along the category axis. Bars shrink the gap
 * between groups before they go below the guide's 10px, and horizontal bars
 * stop growing at MAX_ROW_BAR so a short list does not become blocks.
 */
function bandLayout({ slots, groups, perSlot, length, groupGap, horizontal, headerSize }) {
  const headers = horizontal ? groups.length : 0;
  const count = Math.max(1, slots.length);
  const inner = perSlot > 1 ? INNER_GAP : 0;
  const available = Math.max(1, length - headers * headerSize);
  let slotSize = available / count;
  let gap = groupGap;
  let size = (slotSize - (perSlot - 1) * inner) / (perSlot + gap);
  if (size < minBarWidth) {
    gap = Math.max(0, (slotSize - (perSlot - 1) * inner) / minBarWidth - perSlot);
    size = (slotSize - (perSlot - 1) * inner) / (perSlot + gap);
  }
  const fits = size >= minBarWidth - 1e-6;
  if (horizontal && size > MAX_ROW_BAR) {
    size = MAX_ROW_BAR;
    slotSize = perSlot * size + (perSlot - 1) * inner + gap * size;
  }

  // Walk the axis: a header row before each group (horizontal only), then its slots.
  const starts = [];
  const headerStarts = [];
  let cursor = 0;
  slots.forEach((slot, index) => {
    const group = horizontal ? groups.findIndex((item) => item.start === index) : -1;
    if (group >= 0) {
      headerStarts[group] = cursor;
      cursor += headerSize;
    }
    starts.push(cursor);
    cursor += slotSize;
  });
  const block = perSlot * size + (perSlot - 1) * inner;
  return { fits, size, inner, slotSize, starts, headerStarts, used: cursor, offset: (slotSize - block) / 2 };
}

/**
 * Vertical category labels: wrapped to two lines when that fits; otherwise
 * angled 45 degrees while the bars are far enough apart for angled labels not
 * to touch (owner, 2026-09-30); otherwise turned upright. `overhang` is how far
 * an angled first label reaches left of its slot, which the plot's left
 * margin must cover.
 */
function categoryLabelLayout(labels, fontSize, slotSize) {
  const room = Math.max(1, slotSize - 4);
  const wrapped = labels.map((label) => wrapText(label, fontSize, room));
  const fits = wrapped.every(
    (lines) => lines.length <= MAX_CATEGORY_LINES && lines.every((line) => textWidth(line, fontSize) <= room),
  );
  if (fits) {
    const lines = Math.max(1, ...wrapped.map((item) => item.length));
    return { angle: 0, wrapped, depth: lines * fontSize * LINE_HEIGHT, overhang: 0 };
  }
  const widths = labels.map((label) => textWidth(label, fontSize));
  const single = labels.map((label) => [label]);
  if (slotSize >= ANGLED_LABEL_SLOT * fontSize) {
    return {
      angle: 45,
      wrapped: single,
      depth: Math.max(0, ...widths) * Math.SQRT1_2 + fontSize * Math.SQRT1_2 + 2,
      overhang: Math.max(0, (widths[0] ?? 0) * Math.SQRT1_2 - slotSize / 2),
    };
  }
  return { angle: 90, wrapped: single, depth: Math.max(0, ...widths) + 2, overhang: 0 };
}

function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

// ── Component ────────────────────────────────────────────────────────

export default function BarChart({ model, width, height }) {
  // The hover label belongs to one model; a new model (new data) starts closed.
  const [hovered, setHovered] = React.useState(null);
  const active = hovered?.model === model ? hovered.index : null;
  const setActive = (index) => setHovered(index === null || index === undefined ? null : { model, index });
  const tooltipId = React.useId();
  // The key around the chart (ChartFrame) fades the other series.
  const { setFocusId } = useChartFocus();
  const hoveredSeries = active !== null && (model.series || []).length > 1
    ? model.bars?.[active]?.seriesId ?? null
    : null;
  React.useEffect(() => {
    setFocusId(hoveredSeries);
  }, [hoveredSeries, setFocusId]);
  React.useEffect(() => () => setFocusId(null), [setFocusId]);

  const horizontal = model.orientation === "horizontal";
  const slots = model.categories || [];
  const groups = model.groups || [];
  const series = model.series || [];
  const bars = model.bars || [];
  const stacked = model.stackMode !== "none";
  const perSlot = stacked ? 1 : Math.max(1, series.length);
  const axisSize = model.typography?.axis ?? text.axis.fontSize;
  const labelSize = model.typography?.dataLabel ?? text.dataLabel.fontSize;
  const axisFont = { fontFamily: text.axis.fontFamily, fontSize: axisSize, fill: text.axis.color };
  const labelFont = { fontFamily: text.dataLabel.fontFamily, fontSize: labelSize };
  const tickText = model.valueAxis?.tickText || [];
  const ticks = model.valueAxis?.ticks || [];
  const domain = model.valueAxis?.domain || [0, 1];
  const baseline = model.valueAxis?.baseline ?? 0;
  const groupGap = Number.isFinite(model.groupGap) && model.groupGap >= 0 ? model.groupGap : DEFAULT_GROUP_GAP;
  // One series names its value in the key, so the value axis title is not repeated.
  const yTitle = model.valueTitleInKey && !horizontal ? null : model.labels?.yAxis;
  const xTitle = model.valueTitleInKey && horizontal ? null : model.labels?.xAxis;
  const minimal = model.minimalAxis;
  const anyLabels = bars.some((item) => item.label) || model.totals?.length > 0;

  // ── Key: direct series names beside the last stack, else a key on the right. ──
  const automatic = model.key?.position === "automatic";
  const keyWidth = Math.min(220, Math.max(120, Math.round(width * 0.3)));
  const nameRoom = Math.max(0, ...series.map((entry) => textWidth(entry.label, labelSize))) + LABEL_GAP;
  const canName = automatic && model.directLabels && !horizontal && series.length > 0 && nameRoom <= width * 0.35;

  // ── Frame of the plot ──
  const top = (yTitle ? axisSize + 12 : 0) + EDGE + (anyLabels && !horizontal ? labelSize + barStyle.labelGap : 0);
  const referenceLabelRoom = model.reference?.label ? textWidth(model.reference.label, axisSize) + LABEL_GAP : 0;
  const tickLabelWidth = minimal ? 0 : Math.max(0, ...tickText.map((label) => textWidth(label, axisSize)));

  // A first pass at the key decides the width the plot gets; a named key
  // that turns out not to fit (checked after the scale exists) falls back.
  const layoutFor = (named) => {
    const fallbackKey = automatic && !named;
    const viewWidth = Math.max(1, width - (fallbackKey ? keyWidth + KEY_GAP : 0));
    let left;
    let right;
    let bottom;
    let rows = null;
    let categoryLayout = null;
    if (horizontal) {
      rows = rowLabels({
        labels: slots,
        fontSize: axisSize,
        maxWidth: Math.max(60, Math.min(220, Math.round(viewWidth * 0.3))),
      });
      const groupWidth = Math.max(0, ...groups.map((group) => textWidth(group.label, axisSize)));
      left = Math.max(rows.width, groupWidth) + LABEL_GAP;
      const outsideRoom = anyLabels
        ? Math.max(0, ...bars.filter((item) => item.label).map((item) => textWidth(item.label.text, labelSize)),
          ...(model.totals || []).map((total) => textWidth(total.text, labelSize))) + barStyle.labelGap
        : 0;
      const lastTickHalf = minimal ? 0 : Math.ceil(textWidth(tickText.at(-1) || "", axisSize) / 2);
      right = Math.max(EDGE, outsideRoom, lastTickHalf, referenceLabelRoom);
      bottom = (minimal ? 0 : TICK_GAP + axisSize) + (xTitle ? TICK_GAP + axisSize : 0) + TICK_GAP;
    } else {
      left = minimal ? EDGE : tickLabelWidth + 10;
      right = Math.max(EDGE, named ? nameRoom + EDGE : 0, referenceLabelRoom);
      const labelsFor = (margin) => (model.categoryAxis?.kind === "period"
        ? { angle: 0, wrapped: slots.map((slot) => [slot]), depth: axisSize * LINE_HEIGHT, overhang: 0 }
        : categoryLabelLayout(slots, axisSize, Math.max(1, viewWidth - margin - right) / Math.max(1, slots.length)));
      categoryLayout = labelsFor(left);
      // An angled first label reaches left of its bar; widen the margin to hold it.
      if (categoryLayout.overhang > left) {
        left = Math.ceil(categoryLayout.overhang) + 2;
        categoryLayout = labelsFor(left);
      }
      bottom = TICK_GAP + categoryLayout.depth +
        (groups.length ? TICK_GAP + axisSize * LINE_HEIGHT : 0) +
        (xTitle ? TICK_GAP + axisSize : 0) + TICK_GAP;
    }
    return { fallbackKey, viewWidth, left, right, bottom, rows, categoryLayout };
  };

  let frame = layoutFor(canName);
  let plotWidth = Math.max(1, frame.viewWidth - frame.left - frame.right);
  let availableHeight = Math.max(1, height - top - frame.bottom);
  const headerSize = axisSize * LINE_HEIGHT + TICK_GAP;
  const band = (plotLength) => bandLayout({
    slots,
    groups,
    perSlot,
    length: plotLength,
    groupGap,
    horizontal,
    headerSize,
  });
  let bands = band(horizontal ? availableHeight : plotWidth);
  let plotHeight = horizontal ? Math.max(1, bands.used) : availableHeight;

  let valueScale = horizontal
    ? scaleLinear({ domain, range: [0, plotWidth] })
    : scaleLinear({ domain, range: [plotHeight, 0] });

  // Direct series names: one per series, level with its segment in the
  // rightmost stack that has one.
  const barGeometry = (item, scale, layout) => {
    const position = stacked ? 0 : item.seriesIndex;
    const along = layout.starts[item.slot] + layout.offset + position * (layout.size + layout.inner);
    const [a, b] = [scale(item.start), scale(item.end)];
    const lo = Math.min(a, b);
    const length = Math.abs(b - a);
    return horizontal
      ? { x: lo, y: along, width: length, height: layout.size }
      : { x: along, y: lo, width: layout.size, height: length };
  };
  let direct = null;
  if (canName) {
    direct = directLabels({
      series: series.map((entry) => {
        const last = [...bars].reverse().find((item) => item.seriesId === entry.id);
        if (!last) return { ...entry, points: [] };
        const box = barGeometry(last, valueScale, bands);
        return { ...entry, points: [{ status: "available", y: box.y + box.height / 2 }] };
      }),
      height: plotHeight,
      fontSize: labelSize,
    });
    if (!direct.fits) {
      frame = layoutFor(false);
      plotWidth = Math.max(1, frame.viewWidth - frame.left - frame.right);
      availableHeight = Math.max(1, height - top - frame.bottom);
      bands = band(plotWidth);
      plotHeight = availableHeight;
      valueScale = scaleLinear({ domain, range: [plotHeight, 0] });
      direct = null;
    }
  }
  const useDirect = Boolean(direct?.fits);
  const { fallbackKey, viewWidth, left, bottom, rows } = frame;
  const categoryLayout = frame.categoryLayout;
  const svgWidth = plotWidth + left + frame.right;
  const svgHeight = plotHeight + top + bottom;

  // ── Too many categories for 10px bars: say so rather than draw thinner ones. ──
  if (!bands.fits || !slots.length) {
    return (
      <div
        role="status"
        className="flex items-center justify-center p-6 text-center text-sm text-muted-foreground"
        style={{ width, minHeight: Math.min(height, 200) }}
      >
        {slots.length
          ? "These bars would be narrower than the style guide allows. Show fewer categories, or switch to horizontal bars."
          : "There are no values to draw for these selections."}
      </div>
    );
  }

  const geometry = bars.map((item) => barGeometry(item, valueScale, bands));
  const baselinePx = valueScale(baseline);

  // ── Label placement: one rule for value labels, hover labels, and the
  //    hovered bar's own value. ──
  const spotFor = (index, text, placement) => {
    const item = bars[index];
    const box = geometry[index];
    const wide = textWidth(text, labelSize);
    const negative = item.end < item.start;
    const inset = barStyle.labelInset;
    const across = (y) => ({ y0: y - labelSize / 2, y1: y + labelSize / 2 });
    if (placement === "inside") {
      if (horizontal) {
        if (wide + 2 * inset > box.width || labelSize + 2 > box.height) return null;
        // At the bar's start; a stacked segment's start, as PPIC's 100% bars read.
        const x = negative ? box.x + box.width - inset : box.x + inset;
        const y = box.y + box.height / 2;
        return { x, y, anchor: negative ? "end" : "start", box: { x0: negative ? x - wide : x, x1: negative ? x : x + wide, ...across(y) } };
      }
      if (wide + 4 > box.width || labelSize + 2 * inset > box.height) return null;
      const y = stacked
        ? box.y + box.height / 2
        : negative ? box.y + box.height - inset - labelSize / 2 : box.y + inset + labelSize / 2;
      const x = box.x + box.width / 2;
      return { x, y, anchor: "middle", box: { x0: x - wide / 2, x1: x + wide / 2, ...across(y) } };
    }
    const gap = barStyle.labelGap;
    if (horizontal) {
      const x = negative ? box.x - gap : box.x + box.width + gap;
      const x0 = negative ? x - wide : x;
      if (x0 < -left || x0 + wide > plotWidth + frame.right) return null;
      const y = box.y + box.height / 2;
      return { x, y, anchor: negative ? "end" : "start", box: { x0, x1: x0 + wide, ...across(y) } };
    }
    const y = negative ? box.y + box.height + gap + labelSize / 2 : box.y - gap - labelSize / 2;
    if (y - labelSize / 2 < -top || y + labelSize / 2 > plotHeight + bottom) return null;
    const x = box.x + box.width / 2;
    return { x, y, anchor: "middle", box: { x0: x - wide / 2, x1: x + wide / 2, ...across(y) } };
  };
  /** The preferred spot, else the other side (never outside a stacked segment). */
  const settle = (index, text, preferred) => {
    let placement = preferred;
    let spot = spotFor(index, text, placement);
    if (!spot && !stacked) {
      placement = placement === "inside" ? "outside" : "inside";
      spot = spotFor(index, text, placement);
    }
    return spot ? { ...spot, placement } : null;
  };

  // Value labels, dropping any that would collide.
  const placedBoxes = [];
  const labelFits = (box) => !placedBoxes.some((other) => overlaps(box, other));
  const valueLabels = [];
  bars.forEach((item, index) => {
    if (!item.label) return;
    const spot = settle(index, item.label.text, item.label.placement);
    if (!spot || !labelFits(spot.box)) return;
    placedBoxes.push(spot.box);
    valueLabels.push({
      item,
      ...spot,
      fill: spot.placement === "inside" ? item.label.insideColor : item.label.outsideColor,
    });
  });
  const labeledKeys = new Set(valueLabels.map((label) => label.item.key));

  // ── Hover, as PPIC's published bar charts do it (owner, 2026-09-30) ──
  // Several series: the hovered series keeps its color and shows every value;
  // the others fade. One series: the hovered bar darkens and shows its value.
  const activeBar = active !== null ? bars[active] ?? null : null;
  const focusSeries = activeBar && series.length > 1 ? activeBar.seriesId : null;
  const fillFor = (item, index) => {
    if (!activeBar) return item.color;
    if (focusSeries) return item.seriesId === focusSeries ? item.color : tint(item.color, hoverStyle.fadeShare);
    return index === active ? (hoverStyle.shades[item.color] ?? darken(item.color, hoverStyle.darken)) : item.color;
  };
  /**
   * Past the end of a stack, beyond its total when totals are shown: where a
   * hovered segment's value goes when the series' values do not all fit
   * inside their segments (a segment's value never sits just outside the
   * segment itself, which would read as the stack's).
   */
  const stackEndSpot = (index) => {
    const slot = bars[index].slot;
    const boxes = geometry.filter((_, other) => bars[other].slot === slot);
    const total = (model.totals || []).find((entry) => entry.slot === slot);
    const gap = barStyle.labelGap;
    if (horizontal) {
      const end = Math.max(...boxes.map((box) => box.x + box.width));
      const x = end + gap + (total ? textWidth(total.text, labelSize) + 2 * gap : 0);
      return { x, y: geometry[index].y + geometry[index].height / 2, anchor: "start", placement: "outside" };
    }
    const end = Math.min(...boxes.map((box) => box.y));
    const y = end - gap - labelSize / 2 - (total ? labelSize + gap : 0);
    return { x: geometry[index].x + geometry[index].width / 2, y, anchor: "middle", placement: "outside" };
  };

  // Hover numbers take the hovered bar's color (owner, 2026-09-30): outside a
  // bar, its fill darkened just enough to read; inside, white or dark gray,
  // whichever reads on the fill.
  const hoverTextColor = (item, index, placement) => {
    const fill = fillFor(item, index);
    return placement === "inside" ? textColorOn(fill) : readableTextColor(fill);
  };

  // The focused series' other values. A stack labels them only when every
  // one fits inside its segment, so hovering any stack shows the same thing
  // (owner, 2026-09-30); otherwise only the hovered value shows, past its stack.
  const hoverLabels = [];
  let stackLabelsFit = true;
  if (focusSeries) {
    const candidates = [];
    bars.forEach((item, index) => {
      if (item.seriesId !== focusSeries || labeledKeys.has(item.key)) return;
      const spot = settle(index, item.text, "inside");
      if (stacked && !spot) stackLabelsFit = false;
      if (index !== active) candidates.push({ item, index, spot });
    });
    if (!stacked || stackLabelsFit) {
      for (const { item, index, spot } of candidates) {
        if (!spot || !labelFits(spot.box)) continue;
        placedBoxes.push(spot.box);
        hoverLabels.push({ item, ...spot, fill: hoverTextColor(item, index, spot.placement) });
      }
    }
  }

  // The hovered bar's own value is the tooltip: shown on the bar unless its
  // value label already is, and always read to screen readers.
  let tooltip = null;
  if (activeBar) {
    const visible = !labeledKeys.has(activeBar.key);
    let spot = null;
    if (visible && stacked) {
      spot = (focusSeries ? stackLabelsFit : true) ? settle(active, activeBar.text, "inside") : null;
      spot = spot ?? stackEndSpot(active);
    } else if (visible) {
      spot = settle(active, activeBar.text, focusSeries ? "inside" : "outside") ??
        { ...spotFor(active, activeBar.text, "inside"), placement: "inside" };
    }
    const usable = spot && Number.isFinite(spot.x) ? spot : null;
    tooltip = {
      visible: Boolean(usable),
      placement: usable?.placement ?? (visible ? "outside" : "inside"),
      left: left + (usable?.x ?? geometry[active].x + geometry[active].width / 2),
      top: top + (usable?.y ?? geometry[active].y),
      shift: usable?.anchor === "start" ? "0" : usable?.anchor === "end" ? "-100%" : "-50%",
      color: hoverTextColor(activeBar, active, usable?.placement ?? "outside"),
    };
  }
  const activeSlot = activeBar ? activeBar.slot : null;
  const categoryStyle = (index) =>
    activeSlot === null
      ? {}
      : index === activeSlot
        ? { fill: hoverStyle.category, fontWeight: 700 }
        : {};

  const totals = (model.totals || []).map((total) => {
    const slotBars = bars
      .map((item, index) => ({ item, box: geometry[index] }))
      .filter(({ item }) => item.slot === total.slot);
    if (!slotBars.length) return null;
    const gap = barStyle.labelGap;
    if (horizontal) {
      const end = Math.max(...slotBars.map(({ box }) => box.x + box.width));
      return { ...total, x: end + gap, y: slotBars[0].box.y + slotBars[0].box.height / 2, anchor: "start" };
    }
    const end = Math.min(...slotBars.map(({ box }) => box.y));
    return { ...total, x: slotBars[0].box.x + slotBars[0].box.width / 2, y: end - gap - labelSize / 2, anchor: "middle" };
  }).filter(Boolean);

  // ── Category labels (vertical charts) and which periods to label ──
  const center = (index) => bands.starts[index] + bands.slotSize / 2;
  const labeledPeriods = model.categoryAxis?.kind === "period"
    ? new Set(periodTicks(slots, { width: horizontal ? plotHeight : plotWidth, increment: model.categoryAxis.increment }).map(String))
    : null;
  const showsCategory = (label) => !labeledPeriods || labeledPeriods.has(String(label));

  // ── Interaction ──
  const onKeyDown = (event) => {
    if (!bars.length) return;
    const last = bars.length - 1;
    const moves = {
      ArrowRight: () => (active === null ? 0 : Math.min(last, active + 1)),
      ArrowDown: () => (active === null ? 0 : Math.min(last, active + 1)),
      ArrowLeft: () => (active === null ? last : Math.max(0, active - 1)),
      ArrowUp: () => (active === null ? last : Math.max(0, active - 1)),
      Home: () => 0,
      End: () => last,
      Escape: () => null,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive(moves[event.key]());
  };

  const activeSeries = activeBar ? series.find((entry) => entry.id === activeBar.seriesId) : null;
  const halo = [[2, 0], [-2, 0], [0, 2], [0, -2], [1.5, 1.5], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5]]
    .map(([x, y]) => `${x}px ${y}px 0 ${hoverLabel.halo}`)
    .concat(`0 0 3px ${hoverLabel.halo}`)
    .join(", ");

  return (
    <div className="flex min-w-0 items-start" style={{ width, gap: fallbackKey ? KEY_GAP : 0 }}>
      <div className="relative min-w-0 shrink-0" style={{ width: viewWidth, height: svgHeight }}>
        <svg
          role="img"
          aria-label={model.summary}
          tabIndex={0}
          width={svgWidth}
          height={svgHeight}
          className="block overflow-visible rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand"
          aria-describedby={activeBar ? tooltipId : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {yTitle ? (
            <text x={0} y={axisSize} {...axisFont} data-axis-title="y">
              {yTitle}
            </text>
          ) : null}
          <Group left={left} top={top}>
            {/* Value axis: horizontal grid lines on vertical bars only; the
                guide never draws vertical grid lines. */}
            {!horizontal && !minimal ? (
              <GridRows
                scale={valueScale}
                width={plotWidth}
                tickValues={ticks.filter((tick) => tick !== baseline)}
                stroke={graphLine.color}
                strokeWidth={graphLine.width}
                data-grid="horizontal"
              />
            ) : null}
            {!minimal && !horizontal ? (
              <AxisLeft
                scale={valueScale}
                tickValues={ticks}
                tickFormat={(_, index) => tickText[index]}
                hideAxisLine
                hideTicks
                tickComponent={TickLabel}
                tickLabelProps={() => ({ ...axisFont, textAnchor: "end", dx: -6, dy: "0.33em" })}
              />
            ) : null}
            {!minimal && horizontal ? (
              <AxisBottom
                top={plotHeight}
                scale={valueScale}
                tickValues={ticks}
                tickFormat={(_, index) => tickText[index]}
                hideAxisLine
                hideTicks
                tickComponent={TickLabel}
                tickLabelProps={() => ({ ...axisFont, textAnchor: "middle", dy: TICK_GAP - axisSize * 0.2 })}
              />
            ) : null}

            {/* Track rails: a pale full-length bar behind each bar. */}
            {model.trackRail
              ? bars.map((item, index) => {
                const box = geometry[index];
                const [from, to] = [valueScale(domain[0]), valueScale(domain[1])];
                return horizontal ? (
                  <rect key={`rail-${item.key}`} x={Math.min(from, to)} y={box.y} width={Math.abs(to - from)} height={box.height} fill={barStyle.rail} data-mark="track-rail" />
                ) : (
                  <rect key={`rail-${item.key}`} x={box.x} y={Math.min(from, to)} width={box.width} height={Math.abs(to - from)} fill={barStyle.rail} data-mark="track-rail" />
                );
              })
              : null}

            {bars.map((item, index) => {
              const box = geometry[index];
              return (
                <rect
                  key={item.key}
                  x={box.x}
                  y={box.y}
                  width={Math.max(0, box.width)}
                  height={Math.max(0, box.height)}
                  fill={fillFor(item, index)}
                  data-mark="bar"
                  data-key={item.key}
                  data-series={item.seriesId}
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                />
              );
            })}

            {/* The line the bars grow from: zero, or the diverging center. */}
            {horizontal ? (
              <line x1={baselinePx} x2={baselinePx} y1={0} y2={plotHeight} stroke={graphLine.color} strokeWidth={graphLine.width} data-mark="axis-line" data-value={String(baseline)} />
            ) : (
              <line x1={0} x2={plotWidth} y1={baselinePx} y2={baselinePx} stroke={graphLine.color} strokeWidth={graphLine.width} data-mark="axis-line" data-value={String(baseline)} />
            )}

            {model.reference ? (
              <g data-mark="reference-line" data-value={String(model.reference.value)}>
                {horizontal ? (
                  <line x1={valueScale(model.reference.value)} x2={valueScale(model.reference.value)} y1={0} y2={plotHeight} stroke={COLORS.officialDarkGray} strokeWidth={graphLine.width} />
                ) : (
                  <line x1={0} x2={plotWidth} y1={valueScale(model.reference.value)} y2={valueScale(model.reference.value)} stroke={COLORS.officialDarkGray} strokeWidth={graphLine.width} />
                )}
                {model.reference.label ? (
                  <text
                    x={horizontal ? valueScale(model.reference.value) + 4 : plotWidth + 4}
                    y={horizontal ? -4 : valueScale(model.reference.value)}
                    dominantBaseline={horizontal ? "auto" : "central"}
                    {...axisFont}
                    fill={COLORS.officialDarkGray}
                  >
                    {model.reference.label}
                  </text>
                ) : null}
              </g>
            ) : null}

            {/* A faded series shows no values while another is hovered. */}
            {valueLabels.filter((label) => !focusSeries || label.item.seriesId === focusSeries).map((label) => (
              <text
                key={`label-${label.item.key}`}
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                dominantBaseline="central"
                {...labelFont}
                fill={label.fill}
                data-mark="value-label"
                data-key={label.item.key}
                data-series={label.item.seriesId}
                data-placement={label.placement}
                pointerEvents="none"
              >
                {label.item.label.text}
              </text>
            ))}

            {hoverLabels.map((label) => (
              <text
                key={`hover-${label.item.key}`}
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                dominantBaseline="central"
                {...labelFont}
                fontWeight={700}
                fill={label.fill}
                data-mark="hover-label"
                data-key={label.item.key}
                pointerEvents="none"
              >
                {label.item.text}
              </text>
            ))}

            {totals.map((total) => (
              <text
                key={`total-${total.slot}`}
                x={total.x}
                y={total.y}
                textAnchor={total.anchor}
                dominantBaseline="central"
                {...labelFont}
                fontWeight={700}
                fill={text.axis.color}
                data-mark="stack-total"
                pointerEvents="none"
              >
                {total.text}
              </text>
            ))}

            {/* Category labels */}
            {horizontal
              ? rows.labels.map((row, index) => {
                const y = center(index) - ((row.lines.length - 1) * axisSize * LINE_HEIGHT) / 2;
                return (
                  <text
                    key={`category-${index}`}
                    x={row.x - left}
                    y={y}
                    textAnchor={row.textAnchor}
                    dominantBaseline="central"
                    {...axisFont}
                    {...categoryStyle(index)}
                    data-mark="category-label"
                  >
                    {row.lines.map((line, lineIndex) => (
                      <tspan key={lineIndex} x={row.x - left} dy={lineIndex ? axisSize * LINE_HEIGHT : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                );
              })
              : slots.map((slot, index) => {
                if (!showsCategory(slot)) return null;
                const x = center(index);
                const y = plotHeight + TICK_GAP;
                if (categoryLayout.angle) {
                  return (
                    <text
                      key={`category-${index}`}
                      x={x}
                      y={y}
                      transform={`rotate(-${categoryLayout.angle}, ${x}, ${y})`}
                      textAnchor="end"
                      dominantBaseline="central"
                      {...axisFont}
                      {...categoryStyle(index)}
                      data-mark="category-label"
                    >
                      {slot}
                    </text>
                  );
                }
                return (
                  <text
                    key={`category-${index}`}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    {...axisFont}
                    {...categoryStyle(index)}
                    data-mark="category-label"
                  >
                    {categoryLayout.wrapped[index].map((line, lineIndex) => (
                      <tspan key={lineIndex} x={x} dy={lineIndex ? axisSize * LINE_HEIGHT : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                );
              })}

            {/* Nested categories: outer labels under the inner ones with dividers
                between groups, or bold header rows on horizontal bars. */}
            {groups.map((group, index) => {
              if (horizontal) {
                return (
                  <text
                    key={`group-${index}`}
                    x={-left}
                    y={bands.headerStarts[index] + headerSize / 2}
                    dominantBaseline="central"
                    {...axisFont}
                    fill={text.key.color}
                    fontWeight={700}
                    data-mark="group-label"
                  >
                    {group.label}
                  </text>
                );
              }
              const from = bands.starts[group.start];
              const to = bands.starts[group.end] + bands.slotSize;
              const labelY = plotHeight + TICK_GAP + categoryLayout.depth + TICK_GAP;
              return (
                <g key={`group-${index}`}>
                  <text
                    x={(from + to) / 2}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    {...axisFont}
                    data-mark="group-label"
                  >
                    {group.label}
                  </text>
                  {[from, ...(index === groups.length - 1 ? [to] : [])].map((x) => (
                    <line
                      key={x}
                      x1={x}
                      x2={x}
                      y1={plotHeight}
                      y2={labelY + axisSize * LINE_HEIGHT}
                      stroke={barStyle.groupDivider.color}
                      strokeWidth={barStyle.groupDivider.width}
                      data-mark="group-divider"
                    />
                  ))}
                </g>
              );
            })}

            {xTitle ? (
              <text
                x={plotWidth / 2}
                y={plotHeight + bottom - TICK_GAP}
                textAnchor="middle"
                {...axisFont}
                data-axis-title="x"
              >
                {xTitle}
              </text>
            ) : null}

            {useDirect
              ? direct.labels.map((label) => (
                <text
                  key={label.id}
                  x={plotWidth + LABEL_GAP}
                  y={label.y}
                  dominantBaseline="central"
                  {...labelFont}
                  fill={label.textColor}
                  data-mark="direct-label"
                >
                  {label.label}
                </text>
              ))
              : null}

          </Group>
        </svg>

        {activeBar && tooltip ? (
          <div
            id={tooltipId}
            role="tooltip"
            data-placement={tooltip.placement}
            className={tooltip.visible ? "pointer-events-none absolute z-10 tabular-nums" : "sr-only"}
            style={
              tooltip.visible
                ? {
                  left: tooltip.left,
                  top: tooltip.top,
                  transform: `translate(${tooltip.shift}, -50%)`,
                  width: "max-content",
                  fontFamily: text.dataLabel.fontFamily,
                  fontSize: labelSize,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: tooltip.color,
                  // A white outline keeps an outside value readable over grid lines.
                  textShadow: tooltip.placement === "outside" ? halo : undefined,
                }
                : undefined
            }
          >
            {tooltip.visible ? activeBar.text : null}
            <span className="sr-only">
              {`${tooltip.visible ? "" : `${activeBar.text}, `}${activeSeries?.label ?? ""}, ${activeBar.group ? `${activeBar.group}, ` : ""}${activeBar.category}${activeBar.total ? `, total ${activeBar.total}` : ""}`}
            </span>
          </div>
        ) : null}
      </div>

      {fallbackKey ? (
        <div style={{ width: keyWidth }} className="shrink-0 pt-2">
          <ChartKey entries={model.key.entries} legendPosition="right" fontSize={model.typography?.legend} focusId={focusSeries} />
        </div>
      ) : null}
    </div>
  );
}
