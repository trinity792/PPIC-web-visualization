"use client";

/**
 * LineChart.js — the visx line chart, drawn from a line model at an exact size.
 *
 * Follows the PPIC style guide: 2px solid lines that break at missing values,
 * horizontal grid lines only, 1px axis lines in the axis color, no markers
 * unless Markers is on (or a point has no neighbour, which would otherwise be
 * invisible), and dashes only inside the reader's chosen dashed range.
 *
 * With the key set to "automatic" (the default) each line is labeled at its
 * right end in its own color when the labels fit; otherwise the chart draws the
 * shared key on its right. Other key positions are drawn by ChartFrame.
 *
 * Hover matches PPIC's published (Datawrapper) line charts: one invisible layer
 * over the plot finds the single data point nearest the pointer, in both
 * directions, and labels just that point. A ring circles the point, a short
 * tick joins it to a boxless label (series name in bold, in its line color
 * darkened if too pale to read; period and value in gray; a white halo so it
 * reads over other lines). The label sits above the point, flips to the left
 * of it on the right half of the chart, and drops below it near the top.
 * Values use the View Data table's number format.
 *
 * Keyboard: the chart takes focus; Left/Right move along the current line,
 * Up/Down move to the line above or below at the same period, Home/End jump to
 * the line's ends, and Escape closes the label. New data clears it.
 *
 * All horizontal and vertical ranges come from one `visibleRange`, so adding
 * zoom later means changing that one value. There are no zoom controls today.
 *
 * Line spacing (`model.lineSpacing`, in px) adds room between neighbouring
 * values: Vertical between periods, Horizontal between value gridlines. The
 * drawing grows by that much per gap, and scrolls sideways when it is wider
 * than the space ChartFrame gave it; the fallback key stays in view.
 *
 * Props:
 *   model  {Object} — from buildLineModel (lib/visualization/models/lineModel.js)
 *   width  {number} — exact drawing width in px, from ChartFrame
 *   height {number} — exact drawing height in px, from ChartFrame
 *
 * Data sources:
 *   - Via props from ChartRenderer
 *
 * UI Kit reference:
 *   - Implements the "Chart Anatomy" line rules from the UI Kit page
 */

import React from "react";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear, scalePoint } from "@visx/scale";
import { LinePath } from "@visx/shape";

import ChartKey from "@/components/charts/visx/ChartKey";

import { periodTicks } from "@/lib/visualization/chartLayout/axisScale";
import { dashedSegments } from "@/lib/visualization/chartLayout/dashedRange";
import { readableTextColor } from "@/lib/visualization/chartLayout/contrast";
import { directLabels } from "@/lib/visualization/chartLayout/directLabels";
import { textWidth } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { COLORS } from "@/lib/constants";

const { text, dataLine, graphLine, hoverLabel } = CHART_STYLE;
const MARKER_RADIUS = 3.5;
const DASH_PATTERN = "6 4";
const LABEL_GAP = 8;
const EDGE = 12; // breathing room at the plot edges
const KEY_GAP = 16;
// The label's left or right edge sits this far past the ring's center.
const HOVER_LABEL_INSET = 3;
const HOVER_LINE_HEIGHT = 1.25;
const TICK_GAP = 8;

// ── Helpers ──────────────────────────────────────────────────────────

function isAvailable(point) {
  return point?.status === "available" && Number.isFinite(point.value);
}

/**
 * Consecutive available points, each split where the dashed state changes.
 * Neighbouring runs share their boundary point so the line stays continuous.
 */
function lineRuns(points, dashed) {
  const runs = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (!isAvailable(points[index]) || !isAvailable(points[index + 1])) continue;
    const last = runs.at(-1);
    if (last && last.dashed === dashed[index] && last.indexes.at(-1) === index) {
      last.indexes.push(index + 1);
    } else {
      runs.push({ dashed: dashed[index], indexes: [index, index + 1] });
    }
  }
  return runs;
}

/**
 * Tick labels as plain SVG text. visx's default wraps each label in a nested
 * <svg>, which browsers expose as an image, so screen readers would announce
 * every tick as a separate picture.
 */
function TickLabel({ formattedValue, dx = 0, dy = 0, ...props }) {
  return (
    <text {...props} dx={dx} dy={dy}>
      {formattedValue}
    </text>
  );
}

/** The available point nearest (x, y), across every series: { series, point } indexes. */
function nearestPoint(series, positions, yOf, x, y) {
  let best = null;
  series.forEach((entry, seriesIndex) => {
    entry.points.forEach((point, pointIndex) => {
      if (!isAvailable(point)) return;
      const distance = Math.hypot(positions[pointIndex] - x, yOf(point.value) - y);
      if (!best || distance < best.distance) best = { series: seriesIndex, point: pointIndex, distance };
    });
  });
  return best ? { series: best.series, point: best.point } : null;
}

/** The nearest available point along one series, stepping from `from` by `step`. */
function stepAlong(points, from, step) {
  for (let index = from + step; index >= 0 && index < points.length; index += step) {
    if (isAvailable(points[index])) return index;
  }
  return null;
}

/** The series drawn just above (direction -1) or below (+1) the active one at its period. */
function neighbourSeries(series, active, yOf, direction) {
  const current = yOf(series[active.series].points[active.point].value);
  let best = null;
  series.forEach((entry, index) => {
    const point = entry.points[active.point];
    if (index === active.series || !isAvailable(point)) return;
    const offset = (yOf(point.value) - current) * direction;
    if (offset < 0 || (offset === 0 && (index - active.series) * direction < 0)) return;
    if (!best || offset < best.offset) best = { index, offset };
  });
  return best ? best.index : null;
}

// ── Component ────────────────────────────────────────────────────────

export default function LineChart({ model, width, height }) {
  // The hover label belongs to one model; a new model (new data) starts closed.
  const [hovered, setHovered] = React.useState(null);
  const active = hovered?.model === model ? hovered.target : null;
  const setActiveTarget = (target) => setHovered(target ? { model, target } : null);

  const periods = model.periods || [];
  const series = model.series || [];
  const axisSize = model.typography?.axis ?? text.axis.fontSize;
  const labelSize = model.typography?.dataLabel ?? text.dataLabel.fontSize;
  const axisFont = { fontFamily: text.axis.fontFamily, fontSize: axisSize, fill: text.axis.color };

  // ── Size ──
  const yTitle = model.labels?.yAxis;
  const xTitle = model.labels?.xAxis;
  const tickText = model.yAxis?.tickText || [];
  const automatic = model.key?.position === "automatic";
  const dashedEntry = model.key?.entries?.find((entry) => entry.id === "dashed-range");
  // With direct labels the dashed-range sample sits under the chart; the room
  // is kept even if the labels then fall back to the key (which lists it).
  const bottomNote = automatic && dashedEntry ? axisSize + 16 : 0;
  // Line spacing adds room between neighbouring values: Vertical between
  // periods, Horizontal between value gridlines. The drawing grows to fit, and
  // a drawing wider than the space it was given scrolls sideways.
  const spacing = model.lineSpacing || { horizontal: 0, vertical: 0 };
  const tickGaps = Math.max(0, (model.yAxis?.ticks?.length || 1) - 1);
  const periodGaps = Math.max(0, periods.length - 1);
  const top = (yTitle ? axisSize + 12 : 0) + EDGE;
  // A year label is centered on its tick, so the plot keeps half the widest
  // one clear at each edge; otherwise a label at the end is clipped.
  const periodLabelHalf = Math.ceil(Math.max(...periods.map((period) => textWidth(String(period), axisSize)), 0) / 2) + 2;
  const left = Math.max(Math.max(...tickText.map((label) => textWidth(label, axisSize)), 0) + 10, periodLabelHalf);
  const tickLabelTop = TICK_GAP; // tick labels hang this far below the axis
  const xTitleBaseline = tickLabelTop + axisSize + TICK_GAP + axisSize;
  const bottom = (xTitle ? xTitleBaseline : tickLabelTop + axisSize) + TICK_GAP;
  const plotHeight = Math.max(1, height - bottomNote - top - bottom) + spacing.horizontal * tickGaps;
  const svgHeight = plotHeight + top + bottom;

  // ── Visible range: the one value every scale reads (the zoom seam). ──
  const visibleRange = {
    periods: [0, Math.max(0, periods.length - 1)],
    values: model.yAxis?.domain || [0, 1],
  };
  const yScale = scaleLinear({
    domain: visibleRange.values,
    range: [plotHeight, 0],
  });

  // ── Key: direct labels when "automatic" and they fit, else the shared key. ──
  const direct = automatic
    ? directLabels({
      series: series.map((entry) => ({
        ...entry,
        points: entry.points.map((point) => ({ ...point, y: isAvailable(point) ? yScale(point.value) : null })),
      })),
      height: plotHeight,
      fontSize: labelSize,
    })
    : null;
  const labelRoom = direct
    ? Math.max(...direct.labels.map((label) => textWidth(label.label, labelSize)), 0) + LABEL_GAP
    : 0;
  const useDirect = Boolean(direct?.fits) && labelRoom <= width * 0.35;
  const fallbackKey = automatic && !useDirect;
  const keyWidth = fallbackKey ? Math.min(220, Math.max(120, Math.round(width * 0.3))) : 0;
  const viewWidth = Math.max(1, width - (fallbackKey ? keyWidth + KEY_GAP : 0));
  const right = Math.max((useDirect ? labelRoom : 0) + EDGE, periodLabelHalf);
  const plotWidth = Math.max(1, viewWidth - left - right) + spacing.vertical * periodGaps;
  const svgWidth = plotWidth + left + right;

  const numeric = periods.length > 0 && periods.every((period) => Number.isFinite(Number(period)));
  const xRange = [0, plotWidth];
  const shown = periods.slice(visibleRange.periods[0], visibleRange.periods[1] + 1);
  const xScale = numeric
    ? scaleLinear({
      domain: shown.length > 1 ? [Number(shown[0]), Number(shown.at(-1))] : [Number(shown[0]) - 1, Number(shown[0]) + 1],
      range: xRange,
    })
    : scalePoint({ domain: shown.map(String), range: xRange, padding: 0.5 });
  const xOf = (period) => (numeric ? xScale(Number(period)) : xScale(String(period)));
  const positions = periods.map(xOf);

  const dashed = dashedSegments(periods, model.dashedRange);
  const periodTickValues = periodTicks(periods, {
    width: plotWidth - spacing.vertical * periodGaps,
    increment: model.xAxis?.increment,
  }).map((period) => (numeric ? Number(period) : String(period)));

  // ── Interaction ──
  const moveTo = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = ((event.clientX - box.left) / box.width) * plotWidth;
    const y = ((event.clientY - box.top) / box.height) * plotHeight;
    setActiveTarget(nearestPoint(series, positions, yScale, x, y));
  };
  const onKeyDown = (event) => {
    const first = active ?? (() => {
      const index = series.findIndex((entry) => entry.points.some(isAvailable));
      return index < 0 ? null : { series: index, point: null };
    })();
    if (!first) return;
    const points = series[first.series].points;
    const firstIndex = stepAlong(points, -1, 1);
    const lastIndex = stepAlong(points, points.length, -1);
    const along = (step) =>
      first.point === null ? (step > 0 ? firstIndex : lastIndex) : stepAlong(points, first.point, step) ?? first.point;
    const across = (direction) => {
      if (first.point === null) return first.series;
      return neighbourSeries(series, first, yScale, direction) ?? first.series;
    };
    const moves = {
      ArrowRight: () => ({ series: first.series, point: along(1) }),
      ArrowLeft: () => ({ series: first.series, point: along(-1) }),
      Home: () => ({ series: first.series, point: firstIndex }),
      End: () => ({ series: first.series, point: lastIndex }),
      ArrowUp: () => ({ series: across(-1), point: first.point ?? lastIndex }),
      ArrowDown: () => ({ series: across(1), point: first.point ?? lastIndex }),
      Escape: () => null,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActiveTarget(moves[event.key]());
  };

  const activeSeries = active ? series[active.series] : null;
  const activePoint = activeSeries?.points[active.point] ?? null;
  const pointX = activePoint ? positions[active.point] : null;
  const pointY = activePoint ? yScale(activePoint.value) : null;
  const nameSize = hoverLabel.name.fontSize;
  const detailSize = hoverLabel.detail.fontSize;
  const labelHeight = (nameSize + 2 * detailSize) * HOVER_LINE_HEIGHT;
  const leaderReach = hoverLabel.leader.gap + hoverLabel.leader.length;
  // Above the point, unless that would leave the plot; right-half points read leftward.
  const labelBelow = pointY !== null && pointY - leaderReach - labelHeight < 0;
  const labelFlipped = pointX !== null && pointX > plotWidth / 2;
  const leaderSign = labelBelow ? 1 : -1;
  // A white outline around every glyph (PPIC draws a white-stroked copy under
  // the text), so lines and grid rules never strike through the label.
  const halo = [[2, 0], [-2, 0], [0, 2], [0, -2], [1.5, 1.5], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5]]
    .map(([x, y]) => `${x}px ${y}px 0 ${hoverLabel.halo}`)
    .concat(`0 0 3px ${hoverLabel.halo}`)
    .join(", ");
  const hoverLabelId = React.useId();

  return (
    <div className="flex min-w-0 items-start" style={{ width, gap: fallbackKey ? KEY_GAP : 0 }}>
      <div className="min-w-0 shrink-0 overflow-x-auto" style={{ width: viewWidth }} data-chart-scroll="">
      <div className="relative" style={{ width: svgWidth, height: svgHeight + bottomNote }}>
        <svg
          role="img"
          aria-label={model.summary}
          tabIndex={0}
          width={svgWidth}
          height={svgHeight}
          className="block overflow-visible rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand"
          aria-describedby={activePoint ? hoverLabelId : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setActiveTarget(null)}
        >
          {yTitle ? (
            <text x={0} y={axisSize} {...axisFont} data-axis-title="y">
              {yTitle}
            </text>
          ) : null}
          <Group left={left} top={top}>
            <GridRows
              scale={yScale}
              width={plotWidth}
              tickValues={model.yAxis.ticks}
              stroke={graphLine.color}
              strokeWidth={graphLine.width}
              data-grid="horizontal"
            />
            <AxisLeft
              scale={yScale}
              tickValues={model.yAxis.ticks}
              tickFormat={(_, index) => tickText[index]}
              hideAxisLine
              hideTicks
              tickComponent={TickLabel}
              tickLabelProps={() => ({ ...axisFont, textAnchor: "end", dx: -6, dy: "0.33em" })}
            />
            <AxisBottom
              top={plotHeight}
              tickLength={tickLabelTop}
              scale={xScale}
              tickValues={periodTickValues}
              tickFormat={(value) => String(value)}
              stroke={graphLine.color}
              strokeWidth={graphLine.width}
              hideTicks
              tickComponent={TickLabel}
              // visx already sets bottom labels one font size below the tick.
              tickLabelProps={() => ({ ...axisFont, textAnchor: "middle" })}
            />
            {xTitle ? (
              <text
                x={plotWidth / 2}
                y={plotHeight + xTitleBaseline}
                textAnchor="middle"
                {...axisFont}
                data-axis-title="x"
              >
                {xTitle}
              </text>
            ) : null}

            {series.map((entry) => (
              <g key={entry.id} data-series={entry.id}>
                {lineRuns(entry.points, dashed).map((run) => (
                  <LinePath
                    key={run.indexes.join("-")}
                    data={run.indexes}
                    x={(index) => positions[index]}
                    y={(index) => yScale(entry.points[index].value)}
                    stroke={entry.color}
                    strokeWidth={dataLine.width}
                    strokeDasharray={run.dashed ? DASH_PATTERN : undefined}
                    strokeLinejoin="round"
                    fill="none"
                    data-mark="series-line"
                  />
                ))}
                {entry.points.map((point, index) => {
                  if (!isAvailable(point)) return null;
                  const isolated = !isAvailable(entry.points[index - 1]) && !isAvailable(entry.points[index + 1]);
                  if (!model.markers && !isolated) return null;
                  return (
                    <circle
                      key={String(point.period)}
                      cx={positions[index]}
                      cy={yScale(point.value)}
                      r={MARKER_RADIUS}
                      fill={entry.color}
                      stroke={COLORS.white}
                      strokeWidth={1}
                      data-mark="point"
                    />
                  );
                })}
              </g>
            ))}

            {useDirect
              ? direct.labels.map((label) => {
                const entry = series.find((item) => item.id === label.id);
                const lastIndex = entry.points.findLastIndex(isAvailable);
                const x = positions[lastIndex] + LABEL_GAP;
                return (
                  <g key={label.id} data-mark="direct-label">
                    <text
                      x={x}
                      y={label.y}
                      dominantBaseline="middle"
                      fontFamily={text.dataLabel.fontFamily}
                      fontSize={labelSize}
                      fill={label.textColor}
                    >
                      {label.label}
                    </text>
                  </g>
                );
              })
              : null}

            {activePoint ? (
              <g pointerEvents="none" data-mark="hover-point">
                <line
                  x1={pointX}
                  x2={pointX}
                  y1={pointY + leaderSign * hoverLabel.leader.gap}
                  y2={pointY + leaderSign * leaderReach}
                  stroke={hoverLabel.ring.color}
                  strokeWidth={hoverLabel.ring.width}
                />
                <circle
                  cx={pointX}
                  cy={pointY}
                  r={hoverLabel.ring.radius}
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
              onPointerLeave={() => setActiveTarget(null)}
            />
          </Group>
        </svg>

        {bottomNote && useDirect ? (
          <div className="mt-2" style={{ marginLeft: left }}>
            <ChartKey entries={[dashedEntry]} legendPosition="bottom" fontSize={model.typography?.legend} />
          </div>
        ) : null}

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
                color: readableTextColor(activeSeries.color),
              }}
            >
              {activeSeries.label}
            </div>
            <div
              style={{
                fontFamily: hoverLabel.detail.fontFamily,
                fontSize: detailSize,
                color: hoverLabel.detail.color,
              }}
            >
              <div>{String(activePoint.period)}</div>
              <div className="tabular-nums">{activePoint.text}</div>
            </div>
          </div>
        ) : null}
      </div>
      </div>

      {fallbackKey ? (
        <div style={{ width: keyWidth }} className="shrink-0 pt-2">
          <ChartKey entries={model.key.entries} legendPosition="right" fontSize={model.typography?.legend} />
        </div>
      ) : null}
    </div>
  );
}
