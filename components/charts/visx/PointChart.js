"use client";

/**
 * PointChart.js — the visx scatter and bubble charts, drawn from a point model
 * at an exact size.
 *
 * Drawn as the owner's reference scatter (2026-10-05) is:
 *   - Small filled points in their comparison's color; bubbles are sized by
 *     area, a little translucent with a white outline, in data order.
 *   - Light grid lines at every labeled tick in both directions, and 1px axis
 *     lines along the left and bottom, set a little apart from the outermost
 *     ticks so points at the edges are never cut and the axis titles sit
 *     clear of every grid line. A darker line marks zero
 *     when an axis crosses it. An axis that starts at zero sits on its axis
 *     line instead.
 *   - The axis titles in bold inside the plot: the vertical one at the top
 *     left, the horizontal one at the bottom right.
 *   - With Point labels on Automatic, each point's name sits beside it (right,
 *     left, above, or below) wherever it fits (`pointLabels.js`); a name that
 *     fits nowhere is left out, and the hover label still names its point.
 *   - The key naming several comparisons is drawn by ChartFrame, on top.
 *
 * Hover starts only with the pointer over a point itself (its circle plus a
 * few px), not over its name or empty plot (owner, 2026-10-05). The label then
 * matches the line chart's, as PPIC's published charts do it: the point gets a
 * ring and a short tick to a boxless label
 * (its name in bold, in its color darkened if too pale to read; then each
 * axis title and value in gray, and its size on a bubble). The label sits
 * above the point, flips left on the right half, and drops below near the top.
 *
 * Keyboard: the chart takes focus; Left/Right step to the next point across,
 * Up/Down to the next point up or down, Home/End to the first and last point,
 * and Escape closes the label. New data clears it.
 *
 * Props:
 *   model  {Object} — from buildPointModel (lib/visualization/models/pointModel.js)
 *   width  {number} — exact drawing width in px, from ChartFrame
 *   height {number} — exact drawing height in px, from ChartFrame
 *
 * Data sources:
 *   - Via props from ChartRenderer
 *
 * UI Kit reference:
 *   - Implements the "Chart Anatomy" rules from the UI Kit page
 */

import React from "react";
import { useChartHover } from "@/components/charts/chartFocus";

import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";

import { readableTextColor } from "@/lib/visualization/chartLayout/contrast";
import { plotClipRect, svgSafeId } from "@/lib/visualization/chartLayout/plotClip";
import { placePointLabels } from "@/lib/visualization/chartLayout/pointLabels";
import { interTextWidth, textWidth } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { text, graphLine, hoverLabel, point: pointStyle, range: rangeStyle } = CHART_STYLE;
const EDGE = 12; // breathing room at the plot edges
const TICK_GAP = 8;
// A value label on the left ends this far left of the plot.
const Y_LABEL_NUDGE = 6;
const INSET = 12; // px between the outermost points and an axis line
const LINE_HEIGHT = 1.2;
const HOVER_LINE_HEIGHT = 1.25;
const HOVER_LABEL_INSET = 3;
const TITLE_INSET = 6; // axis titles' distance from the axis lines
const MIN_PLOT = 120;
const HIT_SLOP = 3; // px beyond a point's edge that still counts as over it

// ── Helpers ──────────────────────────────────────────────────────────

/** Tick labels that would touch keep every second (third, ...) tick from the first. */
function thinned(ticks, tickText, scale, roomFor) {
  const spacing = ticks.length > 1 ? Math.abs(scale(ticks[1]) - scale(ticks[0])) : Infinity;
  const every = Math.max(1, Math.ceil(roomFor / Math.max(1, spacing)));
  return ticks
    .map((tick, index) => ({ tick, text: tickText[index] }))
    .filter((_, index) => index % every === 0);
}

/**
 * The point under (x, y), by index, or null when the pointer is over no point
 * (a name label, a grid line, empty plot). A point answers within its radius
 * plus `HIT_SLOP`, so a small dot is still easy to reach; where overlapping
 * bubbles both answer, the one whose center is nearest wins, so a small bubble
 * inside a large one can still be picked.
 */
function pointAt(points, positions, x, y, shown) {
  let best = null;
  positions.forEach((position, index) => {
    if (!shown[index]) return;
    const distance = Math.hypot(position.x - x, position.y - y);
    if (distance > points[index].radius + HIT_SLOP) return;
    if (!best || distance < best.distance) best = { index, distance };
  });
  return best ? best.index : null;
}

// ── Component ────────────────────────────────────────────────────────

export default function PointChart({ model, width, height }) {
  // The reader's Hide grid lines switch (the axes stay).
  const showGrid = model.grid?.show !== false;
  // The hover label belongs to one model; a new model (new data) starts closed.
  const [active, setActive, setPointerActive] = useChartHover(model);
  const hoverLabelId = React.useId();
  const clipId = svgSafeId("plot-clip", React.useId());

  const points = model.points || [];
  const series = model.series || [];
  const axisSize = model.typography?.axis ?? text.axis.fontSize;
  const labelSize = model.typography?.dataLabel ?? text.dataLabel.fontSize;
  const axisFont = { fontFamily: text.axis.fontFamily, fontSize: axisSize, fill: text.axis.color };
  const xAxis = model.xAxis || { domain: [0, 1], ticks: [], tickText: [] };
  const yAxis = model.yAxis || { domain: [0, 1], ticks: [], tickText: [] };
  const xTitle = model.labels?.xAxis;
  const yTitle = model.labels?.yAxis;

  if (!points.length) {
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

  // ── Size ──
  // The widest value label starts at the drawing's left edge, in line with the
  // title above it (owner, 2026-10-12).
  const left = Math.ceil(Math.max(0, ...yAxis.tickText.map((label) => interTextWidth(label, axisSize)))) + Y_LABEL_NUDGE;
  const lastTickHalf = Math.ceil(textWidth(xAxis.tickText.at(-1) || "", axisSize) / 2);
  const right = Math.max(EDGE, lastTickHalf);
  const top = EDGE;
  // The x labels hang TICK_GAP below the plot and their box ends a fraction
  // past one font size lower; the drawing ends 1px after that, so the frame's
  // gap below is measured from the text, as PPIC publishes it (owner, 2026-10-12).
  const bottom = TICK_GAP + axisSize + 1;
  const plotWidth = Math.max(MIN_PLOT, width - left - right);
  const plotHeight = Math.max(MIN_PLOT, height - top - bottom);
  const svgWidth = left + plotWidth + right;
  const svgHeight = top + plotHeight + bottom;

  // Points keep clear of the axis lines, except along an axis that starts at
  // zero, which sits on its line as a bar chart's baseline does.
  // The axis titles sit in that clear band, above the top tick and below the
  // lowest one, so no grid line runs through them.
  const largest = Math.max(0, ...points.map((point) => point.radius));
  const pad = largest + INSET;
  const titleBand = axisSize + 2 * TITLE_INSET;
  const padTop = Math.max(pad, yTitle ? titleBand : 0);
  const padBottom = Math.max(pad, xTitle ? titleBand : 0);
  const xScale = scaleLinear({
    domain: xAxis.domain,
    range: [xAxis.domain[0] === 0 ? 0 : pad, plotWidth - pad],
  });
  const yScale = scaleLinear({
    domain: yAxis.domain,
    range: [yAxis.domain[0] === 0 ? plotHeight : plotHeight - padBottom, padTop],
  });
  const positions = points.map((point) => ({ x: xScale(point.x), y: yScale(point.y) }));

  // ── A reader's axis range ──
  // It may leave points past the axes. Their marks are clipped where the
  // scale ends (inside the clear band), and they take no name, hover, or
  // keyboard stop. A bubble is clipped flush; a dot on the range's end stays whole.
  const [xFrom, xTo] = xScale.range();
  const [yBottom, yTop] = yScale.range();
  const clipRect = plotClipRect({
    left: xFrom,
    top: yTop,
    width: xTo - xFrom,
    height: yBottom - yTop,
    clipX: xAxis.clip,
    clipY: yAxis.clip,
    bleed: model.bubble ? 0 : largest,
  });
  const within = (value, [low, high]) => value >= low && value <= high;
  const shown = points.map((point) =>
    (!xAxis.clip || within(point.x, xAxis.domain)) && (!yAxis.clip || within(point.y, yAxis.domain)));
  const shownIndexes = points.map((_, index) => index).filter((index) => shown[index]);

  const xTickRoom = Math.max(0, ...xAxis.tickText.map((label) => textWidth(label, axisSize))) + TICK_GAP;
  const xTicks = thinned(xAxis.ticks, xAxis.tickText, xScale, xTickRoom);
  const yTicks = thinned(yAxis.ticks, yAxis.tickText, yScale, axisSize + 4);

  // ── Axis titles inside the plot, and the names that must avoid them ──
  const titleFont = { ...axisFont, fontWeight: 700 };
  const titleBoxes = [];
  if (yTitle) {
    titleBoxes.push({ x0: 0, y0: 0, x1: TITLE_INSET + textWidth(yTitle, axisSize), y1: axisSize + TITLE_INSET });
  }
  if (xTitle) {
    titleBoxes.push({
      x0: plotWidth - TITLE_INSET - textWidth(xTitle, axisSize),
      y0: plotHeight - axisSize - TITLE_INSET,
      x1: plotWidth,
      y1: plotHeight,
    });
  }

  // ── Point names ──
  const placedLabels = model.pointLabels === "automatic"
    ? placePointLabels({
      points: shownIndexes.map((index) => ({ ...positions[index], radius: points[index].radius, text: points[index].name })),
      fontSize: labelSize,
      lineHeight: LINE_HEIGHT,
      maxWidth: pointStyle.labelMaxWidth,
      gap: pointStyle.labelGap,
      width: plotWidth,
      height: plotHeight,
      obstacles: titleBoxes,
    })
    : [];
  const nameLabels = points.map(() => null);
  shownIndexes.forEach((index, order) => {
    nameLabels[index] = placedLabels[order] ?? null;
  });

  // ── Interaction ──
  const moveTo = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = ((event.clientX - box.left) / box.width) * plotWidth;
    const y = ((event.clientY - box.top) / box.height) * plotHeight;
    setPointerActive(pointAt(points, positions, x, y, shown));
  };
  const byX = [...shownIndexes].sort((a, b) => positions[a].x - positions[b].x || a - b);
  const byY = [...shownIndexes].sort((a, b) => positions[b].y - positions[a].y || a - b);
  const step = (order, direction) => {
    if (active === null) return direction > 0 ? order[0] : order.at(-1);
    const at = order.indexOf(active);
    return order[Math.min(order.length - 1, Math.max(0, at + direction))];
  };
  const onKeyDown = (event) => {
    const moves = {
      ArrowRight: () => step(byX, 1),
      ArrowLeft: () => step(byX, -1),
      ArrowUp: () => step(byY, 1),
      ArrowDown: () => step(byY, -1),
      Home: () => shownIndexes[0] ?? null,
      End: () => shownIndexes.at(-1) ?? null,
      Escape: () => null,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive(moves[event.key]());
  };

  const activePoint = active !== null ? points[active] ?? null : null;
  const activeSeries = activePoint ? series.find((entry) => entry.id === activePoint.seriesId) : null;
  const pointX = activePoint ? positions[active].x : null;
  const pointY = activePoint ? positions[active].y : null;
  const ringRadius = activePoint ? Math.max(hoverLabel.ring.radius, activePoint.radius + 3) : 0;
  const details = activePoint
    ? [
      ...(series.length > 1 && activeSeries ? [activeSeries.label] : []),
      `${xTitle || "Horizontal"}: ${activePoint.xText}`,
      `${yTitle || "Vertical"}: ${activePoint.yText}`,
      ...(model.bubble && activePoint.sizeText !== null ? [`Size: ${activePoint.sizeText}`] : []),
    ]
    : [];
  const nameSize = hoverLabel.name.fontSize;
  const detailSize = hoverLabel.detail.fontSize;
  const labelHeight = (nameSize + details.length * detailSize) * HOVER_LINE_HEIGHT;
  const leaderReach = ringRadius + hoverLabel.leader.length;
  const labelBelow = pointY !== null && pointY - leaderReach - labelHeight < 0;
  const labelFlipped = pointX !== null && pointX > plotWidth / 2;
  const leaderSign = labelBelow ? 1 : -1;
  // A white outline around every glyph, as the line chart's hover label has.
  const halo = [[2, 0], [-2, 0], [0, 2], [0, -2], [1.5, 1.5], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5]]
    .map(([x, y]) => `${x}px ${y}px 0 ${hoverLabel.halo}`)
    .concat(`0 0 3px ${hoverLabel.halo}`)
    .join(", ");

  const bubbleStyle = model.bubble
    ? { fillOpacity: pointStyle.bubble.opacity, stroke: pointStyle.bubble.outline, strokeWidth: 1 }
    : {};

  return (
    <div className="relative min-w-0" style={{ width: svgWidth, height: svgHeight }}>
      <svg
        role="img"
        aria-label={model.summary}
        tabIndex={0}
        width={svgWidth}
        height={svgHeight}
        className="block overflow-visible rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand"
        aria-describedby={activePoint ? hoverLabelId : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <Group left={left} top={top}>
          {clipRect ? (
            <defs>
              <clipPath id={clipId}>
                <rect {...clipRect} />
              </clipPath>
            </defs>
          ) : null}
          {/* Grid lines at each labeled tick. Plain SVG text for tick labels:
              visx's default nests an <svg> per tick, which screen readers
              announce as images. */}
          {yTicks.map(({ tick, text: label }) => (
            <g key={`y-${tick}`}>
              {showGrid ? (
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke={pointStyle.grid.color}
                  strokeWidth={pointStyle.grid.width}
                  data-grid="horizontal"
                />
              ) : null}
              <text
                x={-Y_LABEL_NUDGE}
                y={yScale(tick)}
                textAnchor="end"
                dominantBaseline="central"
                {...axisFont}
                data-mark="axis-tick-label"
                data-axis="y"
              >
                {label}
              </text>
            </g>
          ))}
          {xTicks.map(({ tick, text: label }) => (
            <g key={`x-${tick}`}>
              {showGrid ? (
                <line
                  x1={xScale(tick)}
                  x2={xScale(tick)}
                  y1={0}
                  y2={plotHeight}
                  stroke={pointStyle.grid.color}
                  strokeWidth={pointStyle.grid.width}
                  data-grid="vertical"
                />
              ) : null}
              <text
                x={xScale(tick)}
                y={plotHeight + TICK_GAP}
                textAnchor="middle"
                dominantBaseline="hanging"
                {...axisFont}
                data-mark="axis-tick-label"
                data-axis="x"
              >
                {label}
              </text>
            </g>
          ))}
          {xAxis.zero ? (
            <line
              x1={xScale(0)}
              x2={xScale(0)}
              y1={0}
              y2={plotHeight}
              stroke={rangeStyle.zeroLine.color}
              strokeWidth={rangeStyle.zeroLine.width}
              data-mark="zero-line"
              data-axis="x"
            />
          ) : null}
          {yAxis.zero ? (
            <line
              x1={0}
              x2={plotWidth}
              y1={yScale(0)}
              y2={yScale(0)}
              stroke={rangeStyle.zeroLine.color}
              strokeWidth={rangeStyle.zeroLine.width}
              data-mark="zero-line"
              data-axis="y"
            />
          ) : null}
          {/* Axis lines along the left and bottom. */}
          <line x1={0} x2={0} y1={0} y2={plotHeight} stroke={graphLine.color} strokeWidth={graphLine.width} data-mark="axis-line" />
          <line
            x1={0}
            x2={plotWidth}
            y1={plotHeight}
            y2={plotHeight}
            stroke={graphLine.color}
            strokeWidth={graphLine.width}
            data-mark="axis-line"
          />

          {yTitle ? (
            <text x={TITLE_INSET} y={TITLE_INSET} dominantBaseline="hanging" {...titleFont} data-axis-title="y">
              {yTitle}
            </text>
          ) : null}
          {xTitle ? (
            <text
              x={plotWidth - TITLE_INSET}
              y={plotHeight - TITLE_INSET}
              textAnchor="end"
              {...titleFont}
              data-axis-title="x"
            >
              {xTitle}
            </text>
          ) : null}

          <g clipPath={clipRect ? `url(#${clipId})` : undefined} data-plot-clip={clipRect ? "" : undefined}>
          {points.map((point, index) => (
            <circle
              key={point.key}
              cx={positions[index].x}
              cy={positions[index].y}
              r={point.radius}
              fill={point.color}
              {...bubbleStyle}
              data-mark="point"
              data-series={point.seriesId}
              pointerEvents="none"
            />
          ))}
          </g>

          {nameLabels.map((label, index) =>
            label && index !== active ? (
              <text
                key={`name-${points[index].key}`}
                x={label.x}
                y={label.y}
                textAnchor={label.textAnchor}
                dominantBaseline="central"
                fontFamily={text.dataLabel.fontFamily}
                fontSize={labelSize}
                fill={text.axis.color}
                data-mark="point-label"
                data-side={label.side}
                pointerEvents="none"
              >
                {label.lines.map((line, lineIndex) => (
                  <tspan key={lineIndex} x={label.x} dy={lineIndex ? labelSize * LINE_HEIGHT : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            ) : null,
          )}

          {activePoint ? (
            <g pointerEvents="none" data-mark="hover-point">
              <line
                x1={pointX}
                x2={pointX}
                y1={pointY + leaderSign * ringRadius}
                y2={pointY + leaderSign * leaderReach}
                stroke={hoverLabel.ring.color}
                strokeWidth={hoverLabel.ring.width}
              />
              <circle
                cx={pointX}
                cy={pointY}
                r={ringRadius}
                fill="none"
                stroke={hoverLabel.ring.color}
                strokeWidth={hoverLabel.ring.width}
              />
            </g>
          ) : null}

          <rect
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            data-chart-interaction=""
            onPointerMove={moveTo}
            onPointerLeave={() => setPointerActive(null)}
          />
        </Group>
      </svg>

      {activePoint ? (
        <div
          id={hoverLabelId}
          role="tooltip"
          className="pointer-events-none absolute z-10"
          style={{
            left: left + pointX + (labelFlipped ? HOVER_LABEL_INSET : -HOVER_LABEL_INSET),
            top: top + pointY + leaderSign * leaderReach,
            transform: `translate(${labelFlipped ? "-100%" : "0"}, ${labelBelow ? "0" : "-100%"})`,
            width: "max-content",
            maxWidth: Math.max(120, plotWidth / 2),
            textAlign: labelFlipped ? "right" : "left",
            lineHeight: HOVER_LINE_HEIGHT,
            textShadow: halo,
          }}
        >
          <div
            style={{
              fontFamily: hoverLabel.name.fontFamily,
              fontSize: nameSize,
              fontWeight: hoverLabel.name.fontWeight,
              color: readableTextColor(activePoint.color),
            }}
          >
            {activePoint.name || activeSeries?.label}
          </div>
          <div
            className="tabular-nums"
            style={{ fontFamily: hoverLabel.detail.fontFamily, fontSize: detailSize, color: hoverLabel.detail.color }}
          >
            {details.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
