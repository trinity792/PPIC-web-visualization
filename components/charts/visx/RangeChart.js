"use client";

/**
 * RangeChart.js — the visx range chart (dumbbell), drawn from a range model at
 * an exact size.
 *
 * Drawn as PPIC's published range plots are (mockups/range chart reference/;
 * renderer plan F, owner decisions October 1, 2026):
 *   - One row per category (and comparison), labeled at the left from
 *     `rowLabels.js`, left-aligned by default, with a dotted guide line along
 *     the row. Groups of rows get a bold header row.
 *   - Range style Dots: a thick light connector from the start value to the
 *     end value, and a filled dot at each end in that end's color. Range style
 *     Arrow: an arrow from the start to the end in the end's color, with no
 *     dots. A row missing either value draws no connector and only the dot it
 *     has.
 *   - The key naming the two ends is drawn by ChartFrame, above the chart by
 *     default. The drawing is only as tall as its rows (the model's
 *     `fitContent`), so the source box follows it directly.
 *   - The value axis sits at the bottom or the top, with a light vertical grid
 *     line at each labeled tick and a darker line at zero whenever the axis
 *     reaches it. Labels thin out when they would touch. Hide X-Axis leaves
 *     out the labels and grid lines but keeps the zero line.
 *
 * Point values: each value sits just outside its row's range, left of the
 * lower end and right of the higher one, in its end's color, so it never
 * covers the connector. The plot keeps room for them at both sides.
 *
 * Hover, in the manner of PPIC's published bar charts: the information goes
 * on the chart, not in a floating box. The hovered row's label turns bold and
 * dark and both of its values appear beside its ends in bold; with several
 * comparisons, the other comparisons' rows fade to a 30% tint and their point
 * values step back. A screen-reader-only role="tooltip" names the row, both
 * periods, and both values.
 *
 * Keyboard: the chart takes focus; the arrow keys step through the rows, Home
 * and End jump to the first and last, and Escape clears the hover. New data
 * clears it too.
 *
 * Props:
 *   model  {Object} — from buildRangeModel (lib/visualization/models/rangeModel.js)
 *   width  {number} — exact drawing width in px, from ChartFrame
 *   height {number} — exact drawing height in px, from ChartFrame; a chart with
 *                     more rows than fit grows taller rather than squeezing them
 *
 * Data sources:
 *   - Via props from ChartRenderer
 *
 * UI Kit reference:
 *   - Implements the "Chart Anatomy" rules from the UI Kit page
 */

import React from "react";

import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";

import { readableTextColor, tint } from "@/lib/visualization/chartLayout/contrast";
import { rowLabels } from "@/lib/visualization/chartLayout/rowLabels";
import { textWidth } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { text, range: rangeStyle, bar: barStyle } = CHART_STYLE;
const EDGE = 12; // breathing room at the plot edges
const TICK_GAP = 8;
const LABEL_GAP = 12; // between the row label column and the plot
const LINE_HEIGHT = 1.2;
const MAX_ROW = 40; // a short list keeps rows close, not spread down the frame
const ENDS = Object.freeze(["start", "end"]);

// ── Helpers ──────────────────────────────────────────────────────────

/** x of a label anchored left, center, or right in a column `width` wide. */
function anchorX(alignment, width) {
  if (alignment === "center") return width / 2;
  if (alignment === "right") return width;
  return 0;
}

const ANCHORS = Object.freeze({ left: "start", center: "middle", right: "end" });

/**
 * Which side of the row each end's labels go on: left of the lower end and
 * right of the higher one. A row with one value puts it on the right.
 */
function sides(row) {
  const { start, end } = row;
  if (start.value === null || end.value === null) return { start: "right", end: "right" };
  return start.value <= end.value ? { start: "left", end: "right" } : { start: "right", end: "left" };
}

// ── Component ────────────────────────────────────────────────────────

export default function RangeChart({ model, width, height }) {
  // The hover belongs to one model; a new model (new data) starts closed.
  const [hovered, setHovered] = React.useState(null);
  const active = hovered?.model === model ? hovered.index : null;
  const setActive = (index) => setHovered(index === null || index === undefined ? null : { model, index });
  const tooltipId = React.useId();

  const rows = model.rows || [];
  const groups = model.groups || [];
  const series = model.series || [];
  const ends = model.ends || { start: { label: "", color: text.axis.color }, end: { label: "", color: text.axis.color } };
  const arrow = model.rangeStyle === "arrow";
  const axisSize = model.typography?.axis ?? text.axis.fontSize;
  const labelSize = model.typography?.dataLabel ?? text.dataLabel.fontSize;
  const axisFont = { fontFamily: text.axis.fontFamily, fontSize: axisSize, fill: text.axis.color };
  const labelFont = { fontFamily: text.dataLabel.fontFamily, fontSize: labelSize };
  const valueAxis = model.valueAxis || {};
  const showAxis = valueAxis.visible !== false;
  const axisOnTop = valueAxis.position === "top";
  const domain = valueAxis.domain || [0, 1];
  const ticks = valueAxis.ticks || [];
  const tickText = valueAxis.tickText || [];
  const yTitle = model.labels?.yAxis;
  const xTitle = showAxis ? model.labels?.xAxis : null;
  const radius = rangeStyle.dotRadius;
  const markReach = arrow ? rangeStyle.arrow.head : radius;
  const groupAlignment = model.rowLabels?.groupAlignment || "left";
  const variableAlignment = model.rowLabels?.variableAlignment || "left";

  if (!rows.length) {
    return (
      <div
        role="status"
        className="flex items-center justify-center p-6 text-center text-sm text-muted-foreground"
        style={{ width, minHeight: Math.min(height, 200) }}
      >
        There are no values to draw for these selections.
      </div>
    );
  }

  // ── Row label column ──
  const wrapped = rowLabels({
    labels: rows.map((row) => row.label),
    fontSize: axisSize,
    maxWidth: Math.max(60, Math.min(220, Math.round(width * 0.3))),
    alignment: variableAlignment,
  });
  // A centered or right-aligned group header must fit inside the column.
  const groupWidth = groupAlignment === "left"
    ? 0
    : Math.max(0, ...groups.map((group) => textWidth(group.label, axisSize)));
  const columnWidth = Math.max(wrapped.width, groupWidth);
  const left = columnWidth + LABEL_GAP;

  // ── Plot width: keep room beside the ends for their values. ──
  const lastTickHalf = showAxis ? Math.ceil(textWidth(tickText.at(-1) || "", axisSize) / 2) : 0;
  const right = Math.max(EDGE, lastTickHalf);
  const plotWidth = Math.max(1, width - left - right);
  const rough = scaleLinear({ domain, range: [0, plotWidth] });
  let padLeft = markReach + 2;
  let padRight = markReach + 2;
  const reserve = (x, side, room) => {
    if (side === "left") padLeft = Math.max(padLeft, room - x);
    else padRight = Math.max(padRight, x + room - plotWidth);
  };
  for (const row of rows) {
    const side = sides(row);
    for (const end of ENDS) {
      const point = row[end];
      if (point.value === null) continue;
      reserve(rough(point.value), side[end], textWidth(point.label ?? point.text, labelSize) + rangeStyle.labelGap + markReach);
    }
  }
  // Never squeeze the plot to less than half its width for labels.
  const padLimit = plotWidth / 4;
  const valueScale = scaleLinear({
    domain,
    range: [Math.min(padLeft, padLimit), Math.max(plotWidth / 2, plotWidth - Math.min(padRight, padLimit))],
  });

  // Tick labels that would touch keep every second (third, ...) tick from the
  // first, so a narrow chart's axis stays readable.
  const tickRoom = Math.max(0, ...tickText.map((label) => textWidth(label, axisSize))) + TICK_GAP;
  const tickSpacing = ticks.length > 1 ? Math.abs(valueScale(ticks[1]) - valueScale(ticks[0])) : Infinity;
  const tickEvery = Math.max(1, Math.ceil(tickRoom / Math.max(1, tickSpacing)));
  const shownTicks = ticks
    .map((tick, index) => ({ tick, text: tickText[index] }))
    .filter((_, index) => index % tickEvery === 0);

  // ── Rows down the plot ──
  const axisRoom = showAxis ? TICK_GAP + axisSize : 0;
  const top = (yTitle ? axisSize + 12 : 0) + EDGE + (axisOnTop ? axisRoom : 0);
  // The axis title stays below the chart wherever the tick labels are.
  const bottom = Math.max(EDGE, (axisOnTop ? 0 : axisRoom) + (xTitle ? TICK_GAP + axisSize : 0) + TICK_GAP);
  const headerSize = axisSize * LINE_HEIGHT + TICK_GAP;
  const maxLines = Math.max(1, ...wrapped.labels.map((label) => label.lines.length));
  const minRow = Math.max(radius * 2 + 8, maxLines * axisSize * LINE_HEIGHT + 6);
  const available = Math.max(1, height - top - bottom - groups.length * headerSize);
  const rowSize = Math.min(MAX_ROW, Math.max(minRow, available / rows.length));
  const rowStarts = [];
  const headerStarts = [];
  let cursor = 0;
  rows.forEach((_, index) => {
    const group = groups.findIndex((item) => item.start === index);
    if (group >= 0) {
      headerStarts[group] = cursor;
      cursor += headerSize;
    }
    rowStarts.push(cursor);
    cursor += rowSize;
  });
  const plotHeight = cursor;
  const svgWidth = left + plotWidth + right;
  const svgHeight = top + plotHeight + bottom;
  const center = (index) => rowStarts[index] + rowSize / 2;

  // ── Hover ──
  const activeRow = active !== null ? rows[active] ?? null : null;
  const focusSeries = activeRow && series.length > 1 ? activeRow.seriesId : null;
  const colorOf = (row, end) =>
    focusSeries && row.seriesId !== focusSeries ? tint(ends[end].color, barStyle.hover.fadeShare) : ends[end].color;

  // One value beside its end, on the row's side for it.
  const valueSpot = (row, index, end) => {
    const point = row[end];
    if (point.value === null) return null;
    const x = valueScale(point.value);
    const side = sides(row)[end];
    const offset = markReach + rangeStyle.labelGap;
    return {
      x: side === "left" ? x - offset : x + offset,
      y: center(index),
      anchor: side === "left" ? "end" : "start",
    };
  };
  const valueLabels = rows.flatMap((row, index) =>
    focusSeries && row.seriesId !== focusSeries
      ? []
      : ENDS.flatMap((end) => {
        const point = row[end];
        const spot = point.label ? valueSpot(row, index, end) : null;
        return spot ? [{ row, end, text: point.label, ...spot }] : [];
      }),
  );
  const hoverLabels = activeRow
    ? ENDS.flatMap((end) => {
      const point = activeRow[end];
      const spot = point.label ? null : valueSpot(activeRow, active, end);
      return spot ? [{ end, text: point.text, ...spot }] : [];
    })
    : [];

  const onKeyDown = (event) => {
    const last = rows.length - 1;
    const moves = {
      ArrowDown: () => (active === null ? 0 : Math.min(last, active + 1)),
      ArrowRight: () => (active === null ? 0 : Math.min(last, active + 1)),
      ArrowUp: () => (active === null ? last : Math.max(0, active - 1)),
      ArrowLeft: () => (active === null ? last : Math.max(0, active - 1)),
      Home: () => 0,
      End: () => last,
      Escape: () => null,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive(moves[event.key]());
  };

  const describe = (row) => {
    const name = row.group ? `${row.label}, ${row.group}` : series.length > 1 ? `${row.label}, ${row.category}` : row.label;
    const value = (point) => `${point.period ?? ""}, ${point.text}`;
    return `${name}: ${value(row.start)}; ${value(row.end)}`;
  };

  /** The marks between and at a row's ends: dots and a connector, or an arrow. */
  const marks = (row, y) => {
    const [from, to] = [row.start.value, row.end.value];
    if (arrow && row.connector) {
      const x1 = valueScale(from);
      const x2 = valueScale(to);
      const direction = x2 >= x1 ? 1 : -1;
      const head = rangeStyle.arrow.head;
      const color = colorOf(row, "end");
      return (
        <g data-mark="arrow" data-direction={direction > 0 ? "right" : "left"} pointerEvents="none">
          <line
            x1={x1}
            x2={x2}
            y1={y}
            y2={y}
            stroke={color}
            strokeWidth={rangeStyle.arrow.width}
            strokeLinecap="round"
            data-mark="arrow-shaft"
          />
          <path
            d={`M ${x2 - direction * head} ${y - head} L ${x2} ${y} L ${x2 - direction * head} ${y + head}`}
            fill="none"
            stroke={color}
            strokeWidth={rangeStyle.arrow.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            data-mark="arrow-head"
          />
        </g>
      );
    }
    return (
      <>
        {row.connector ? (
          <line
            x1={valueScale(row.connector.from)}
            x2={valueScale(row.connector.to)}
            y1={y}
            y2={y}
            stroke={rangeStyle.connector.color}
            strokeWidth={rangeStyle.connector.width}
            data-mark="connector"
            pointerEvents="none"
          />
        ) : null}
        {ENDS.map((end) =>
          row[end].value !== null ? (
            <circle
              key={end}
              cx={valueScale(row[end].value)}
              cy={y}
              r={radius}
              fill={colorOf(row, end)}
              data-mark="endpoint"
              data-endpoint={end}
              pointerEvents="none"
            />
          ) : null,
        )}
      </>
    );
  };

  const tickY = axisOnTop ? -TICK_GAP : plotHeight + TICK_GAP;

  return (
    <div className="relative min-w-0" style={{ width, height: svgHeight }}>
      <svg
        role="img"
        aria-label={model.summary}
        tabIndex={0}
        width={svgWidth}
        height={svgHeight}
        className="block overflow-visible rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand"
        aria-describedby={activeRow ? tooltipId : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {yTitle ? (
          <text x={0} y={axisSize} {...axisFont} data-axis-title="y">
            {yTitle}
          </text>
        ) : null}
        <Group left={left} top={top}>
          {/* Grid: a light vertical line at each labeled tick, and a darker
              line at zero. Plain SVG text for tick labels: visx's default
              nests an <svg> per tick, which screen readers announce as images. */}
          {showAxis
            ? shownTicks.map(({ tick, text: label }) => (
              <g key={`tick-${tick}`}>
                {!(valueAxis.zero && tick === 0) ? (
                  <line
                    x1={valueScale(tick)}
                    x2={valueScale(tick)}
                    y1={0}
                    y2={plotHeight}
                    stroke={rangeStyle.grid.color}
                    strokeWidth={rangeStyle.grid.width}
                    data-grid="vertical"
                  />
                ) : null}
                <text
                  x={valueScale(tick)}
                  y={tickY}
                  textAnchor="middle"
                  dominantBaseline={axisOnTop ? "auto" : "hanging"}
                  {...axisFont}
                  data-mark="axis-tick-label"
                >
                  {label}
                </text>
              </g>
            ))
            : null}
          {valueAxis.zero ? (
            <line
              x1={valueScale(0)}
              x2={valueScale(0)}
              y1={0}
              y2={plotHeight}
              stroke={rangeStyle.zeroLine.color}
              strokeWidth={rangeStyle.zeroLine.width}
              data-mark="zero-line"
            />
          ) : null}

          {groups.map((group, index) => (
            <text
              key={`group-${index}`}
              x={anchorX(groupAlignment, columnWidth) - left}
              y={headerStarts[index] + headerSize / 2}
              textAnchor={ANCHORS[groupAlignment]}
              dominantBaseline="central"
              {...axisFont}
              fill={text.key.color}
              fontWeight={700}
              data-mark="group-label"
            >
              {group.label}
            </text>
          ))}

          {rows.map((row, index) => {
            const y = center(index);
            const label = wrapped.labels[index];
            const labelX = anchorX(variableAlignment, columnWidth) - left;
            const emphasis = index === active ? { fill: barStyle.hover.category, fontWeight: 700 } : {};
            return (
              <g key={row.key} data-key={row.key} data-series={row.seriesId}>
                {/* The whole row answers the pointer, label included. */}
                <rect
                  x={-left}
                  y={rowStarts[index]}
                  width={svgWidth}
                  height={rowSize}
                  fill="transparent"
                  data-mark="row-hit"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                />
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={y}
                  y2={y}
                  stroke={rangeStyle.rowLine.color}
                  strokeWidth={rangeStyle.rowLine.width}
                  strokeDasharray={rangeStyle.rowLine.dash}
                  data-mark="row-line"
                  pointerEvents="none"
                />
                <text
                  x={labelX}
                  y={y - ((label.lines.length - 1) * axisSize * LINE_HEIGHT) / 2}
                  textAnchor={label.textAnchor}
                  dominantBaseline="central"
                  {...axisFont}
                  {...emphasis}
                  data-mark="row-label"
                  pointerEvents="none"
                >
                  {label.lines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={labelX} dy={lineIndex ? axisSize * LINE_HEIGHT : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
                {marks(row, y)}
              </g>
            );
          })}

          {valueLabels.map((label) => (
            <text
              key={`value-${label.row.key}-${label.end}`}
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              dominantBaseline="central"
              {...labelFont}
              fill={readableTextColor(ends[label.end].color)}
              data-mark="value-label"
              data-key={label.row.key}
              data-endpoint={label.end}
              pointerEvents="none"
            >
              {label.text}
            </text>
          ))}

          {hoverLabels.map((label) => (
            <text
              key={`hover-${label.end}`}
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              dominantBaseline="central"
              {...labelFont}
              fontWeight={700}
              fill={readableTextColor(ends[label.end].color)}
              data-mark="hover-label"
              data-endpoint={label.end}
              pointerEvents="none"
            >
              {label.text}
            </text>
          ))}

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
        </Group>
      </svg>

      {activeRow ? (
        <div id={tooltipId} role="tooltip" className="sr-only">
          {describe(activeRow)}
        </div>
      ) : null}
    </div>
  );
}
