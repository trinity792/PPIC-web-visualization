"use client";

/**
 * PieChart.js — the visx pie chart (and donut), drawn from a pie model at an
 * exact size.
 *
 * Follows the PPIC style guide (renderer plan K): every slice is labeled
 * directly, outside the slice, with its name and its value, and no key is
 * needed. A label sits beside its slice. When a label is too long to sit
 * there (its name wraps onto several lines) or labels beside neighbouring
 * slices would collide, the label moves clear and is joined to its slice by a
 * 1px leader line. Slices start at 12 o'clock and run clockwise in the model's
 * order, separated by a thin white edge, and a donut leaves a hole of the
 * model's `hole` share of the radius (0 is a full pie). Pale label names are
 * darkened to stay readable.
 *
 * Space: the circle takes what is left after the widest label column (at most
 * 30% of the width) on each side, and the room above and below for a label
 * over the top or bottom slice. A model with nothing to draw says so instead
 * of leaving the area blank.
 *
 * Hover, in the bar chart's style (owner, 2026-09-30): the hovered slice keeps
 * its color and shows its share of the total beside its value; the other
 * slices fade to a 30% tint, and the key (when shown) fades the same entries
 * through chartFocus.js. No floating box. The hovered slice's text is carried
 * by role="tooltip" for screen readers.
 *
 * Keyboard: the chart takes focus; the arrow keys step through the slices,
 * Home and End jump to the first and last, and Escape clears the hover. New
 * data clears it too.
 *
 * Props:
 *   model  {Object} — from buildPieModel (lib/visualization/models/pieModel.js)
 *   width  {number} — exact drawing width in px, from ChartFrame
 *   height {number} — exact drawing height in px, from ChartFrame
 *
 * Data sources:
 *   - Via props from ChartRenderer
 *
 * UI Kit reference:
 *   - Implements the "Chart Anatomy" pie rules from the UI Kit page
 */

import React from "react";

import { Pie } from "@visx/shape";

import { useChartFocus, useChartHover } from "@/components/charts/chartFocus";

import { readableTextColor, tint } from "@/lib/visualization/chartLayout/contrast";
import { textWidth, wrapText } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { text, pie: pieStyle } = CHART_STYLE;
const hoverStyle = CHART_STYLE.bar.hover;
const EDGE = 12; // breathing room at the svg edges
const LINE_HEIGHT = 1.2;
const LABEL_GAP_Y = 2; // minimum space between two stacked labels
const MIN_RADIUS = 24;
const FULL_TURN = Math.PI * 2;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Pushes labels on one side of the pie apart so none overlap, keeping their
 * order, then keeps the group inside [min, max]. Each item is { y, height }
 * (a label's center and its height); returns the new centers.
 */
function spreadLabels(items, min, max) {
  const order = items.map((item, index) => ({ ...item, index })).sort((a, b) => a.y - b.y);
  let previous = null;
  for (const item of order) {
    const floor = previous ? previous.y + (previous.height + item.height) / 2 + LABEL_GAP_Y : min + item.height / 2;
    item.y = Math.max(item.y, floor);
    previous = item;
  }
  const last = order.at(-1);
  if (last && last.y + last.height / 2 > max) {
    last.y = max - last.height / 2;
    for (let i = order.length - 2; i >= 0; i -= 1) {
      const ceiling = order[i + 1].y - (order[i + 1].height + order[i].height) / 2 - LABEL_GAP_Y;
      order[i].y = Math.min(order[i].y, ceiling);
    }
  }
  const moved = new Array(items.length);
  for (const item of order) moved[item.index] = item.y;
  return moved;
}

// ── Component ────────────────────────────────────────────────────────

export default function PieChart({ model, width, height }) {
  // The hover belongs to one model; a new model (new data) starts closed.
  const [active, setActive, setPointerActive] = useChartHover(model);
  const tooltipId = React.useId();
  // The key around the chart (ChartFrame), when shown, fades the other slices.
  const { setFocusId } = useChartFocus();
  const slices = model.slices || [];
  const focusKey = active !== null ? slices[active]?.key ?? null : null;
  React.useEffect(() => {
    setFocusId(focusKey);
  }, [focusKey, setFocusId]);
  React.useEffect(() => () => setFocusId(null), [setFocusId]);

  if (!slices.length) {
    return (
      <div
        role="status"
        className="flex items-center justify-center p-6 text-center text-sm text-muted-foreground"
        style={{ width, minHeight: Math.min(height, 200) }}
      >
        {model.emptyMessage || "There are no values to draw for these selections."}
      </div>
    );
  }

  const labelSize = model.typography?.dataLabel ?? text.dataLabel.fontSize;
  const axisSize = model.typography?.axis ?? text.axis.fontSize;
  const lineHeight = labelSize * LINE_HEIGHT;
  const { leader, labelGap } = pieStyle;
  const reach = Math.max(labelGap, leader.run + 4); // how far a label may sit from the rim

  // ── Labels: wrapped names over the value, each block as tall as its lines. ──
  const maxColumn = Math.floor(width * pieStyle.labelMaxShare);
  const blocks = slices.map((slice) => {
    const lines = wrapText(slice.label, labelSize, maxColumn);
    const widest = Math.max(textWidth(`${slice.valueLabel} (${slice.shareText})`, labelSize), ...lines.map((line) => textWidth(line, labelSize)));
    return { lines, width: widest, height: (lines.length + 1) * lineHeight };
  });
  const column = Math.min(maxColumn, Math.max(...blocks.map((block) => block.width)));
  const tallest = Math.max(...blocks.map((block) => block.height));

  // ── The circle: what is left beside the label columns, above and below. ──
  const noteRoom = model.note ? axisSize * LINE_HEIGHT + 8 : 0;
  const drawHeight = Math.max(1, height - noteRoom);
  const radius = Math.max(
    MIN_RADIUS,
    Math.min(width / 2 - EDGE - column - reach, drawHeight / 2 - EDGE - labelGap - tallest),
  );
  const inner = radius * model.hole;
  const cx = width / 2;
  const cy = drawHeight / 2;

  // ── Angles and each label's natural spot, beside its slice ──
  let cursor = 0;
  const placed = slices.map((slice, index) => {
    const start = cursor;
    cursor += slice.share * FULL_TURN;
    const mid = (start + cursor) / 2;
    const sin = Math.sin(mid);
    const cos = Math.cos(mid);
    const block = blocks[index];
    const right = sin >= 0;
    // Beside the slice; over the top or bottom, the block's near edge touches the spot.
    const naturalY = cy - cos * (radius + labelGap) + (cos > 0 ? -1 : 1) * Math.abs(cos) * (block.height / 2);
    return { index, mid, sin, cos, right, block, naturalY, x: cx + sin * (radius + labelGap) };
  });
  for (const side of [true, false]) {
    const group = placed.filter((item) => item.right === side);
    const ys = spreadLabels(group.map((item) => ({ y: item.naturalY, height: item.block.height })), 0, drawHeight);
    group.forEach((item, position) => {
      item.y = ys[position];
    });
  }
  for (const item of placed) {
    const pushed = Math.abs(item.y - item.naturalY) > 1;
    item.leader = pushed || item.block.lines.length > 1;
    const sign = item.right ? 1 : -1;
    if (item.leader) {
      item.labelX = cx + sign * (radius + leader.run + 4);
      item.line = [
        [cx + item.sin * radius, cy - item.cos * radius],
        [cx + item.sin * (radius + leader.run * 0.6), cy - item.cos * (radius + leader.run * 0.6)],
        [cx + sign * (radius + leader.run), item.y],
      ];
    } else {
      item.labelX = item.x;
    }
  }

  // ── Interaction ──
  const onKeyDown = (event) => {
    const last = slices.length - 1;
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

  const activeSlice = active !== null ? slices[active] : null;
  const fillFor = (slice, index) =>
    active === null || active === index ? slice.color : tint(slice.color, hoverStyle.fadeShare);

  return (
    <div className="relative min-w-0" style={{ width, height }}>
      <svg
        role="img"
        aria-label={model.summary}
        tabIndex={0}
        width={width}
        height={height}
        className="block overflow-visible rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand"
        aria-describedby={activeSlice ? tooltipId : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <Pie
          data={slices}
          pieValue={(slice) => slice.value}
          pieSort={null}
          pieSortValues={null}
          outerRadius={radius}
          innerRadius={inner}
        >
          {({ arcs, path }) => (
            <g transform={`translate(${cx}, ${cy})`}>
              {arcs.map((arc, index) => (
                <path
                  key={arc.data.key}
                  d={path(arc) || ""}
                  fill={fillFor(arc.data, index)}
                  stroke={pieStyle.outline.color}
                  strokeWidth={pieStyle.outline.width}
                  data-mark="slice"
                  data-key={arc.data.key}
                  data-inner-radius={String(inner)}
                  data-outer-radius={String(radius)}
                  onPointerEnter={() => setPointerActive(index)}
                  onPointerLeave={() => setPointerActive(null)}
                />
              ))}
            </g>
          )}
        </Pie>

        {placed.map((item) => {
          const slice = slices[item.index];
          const sign = item.right ? 1 : -1;
          const isActive = active === item.index;
          const top = item.y - item.block.height / 2;
          const x = item.leader ? item.labelX + sign * 4 : item.labelX;
          return (
            <g key={slice.key} data-mark="slice-label-group">
              {item.leader ? (
                <polyline
                  points={item.line.map((point) => point.join(",")).join(" ")}
                  fill="none"
                  stroke={leader.color}
                  strokeWidth={leader.width}
                  data-mark="leader-line"
                  data-key={slice.key}
                  pointerEvents="none"
                />
              ) : null}
              <text
                x={x}
                y={top}
                textAnchor={item.right ? "start" : "end"}
                dominantBaseline="hanging"
                fontFamily={text.dataLabel.fontFamily}
                fontSize={labelSize}
                data-mark="slice-label"
                data-key={slice.key}
                data-leader={item.leader ? "true" : undefined}
                onPointerEnter={() => setPointerActive(item.index)}
                onPointerLeave={() => setPointerActive(null)}
              >
                {item.block.lines.map((line, lineIndex) => (
                  <tspan
                    key={lineIndex}
                    x={x}
                    dy={lineIndex ? lineHeight : 0}
                    fontWeight={700}
                    fill={readableTextColor(slice.color)}
                  >
                    {line}
                  </tspan>
                ))}
                <tspan x={x} dy={lineHeight} fill={text.dataLabel.color} fontWeight={isActive ? 700 : 400}>
                  {isActive ? `${slice.valueLabel} (${slice.shareText})` : slice.valueLabel}
                </tspan>
              </text>
            </g>
          );
        })}

        {model.note ? (
          <text
            x={cx}
            y={height - 2}
            textAnchor="middle"
            fontFamily={text.axis.fontFamily}
            fontSize={axisSize}
            fill={text.axis.color}
            data-mark="note"
          >
            {model.note}
          </text>
        ) : null}
      </svg>

      {activeSlice ? (
        <div id={tooltipId} role="tooltip" className="sr-only">
          {`${activeSlice.label}, ${activeSlice.valueLabel}, ${activeSlice.shareText} of the total`}
        </div>
      ) : null}
    </div>
  );
}
