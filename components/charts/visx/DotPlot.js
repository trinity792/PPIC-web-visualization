"use client";

/**
 * DotPlot.js — the visx dot plot, drawn from a dot plot model at an exact size.
 *
 * Drawn as PPIC's published business-regulation plots are (mockups/range
 * chart reference/; renderer plan G), on the range chart's row layout:
 *   - One row per category (or period), labeled at the left from
 *     `rowLabels.js`, left-aligned by default, with a dotted guide line along
 *     the row. Groups of rows get a bold header row.
 *   - Each row's dots on one shared value axis, in their series' colors, over
 *     a light band from the row's lowest dot to its highest. A dot that
 *     overlaps an earlier dot in its row gets a white outline, so both stay
 *     visible. Missing values draw no dot.
 *   - The key naming the dots is drawn by ChartFrame, above the chart by
 *     default. The drawing is only as tall as its rows (the model's
 *     `fitContent`), so the source box follows it directly.
 *   - The value axis sits at the bottom, with a light vertical grid line at
 *     each labeled tick and a darker line at zero whenever the axis reaches
 *     it. Labels thin out when they would touch. Hide X-Axis leaves out the
 *     labels and grid lines but keeps the zero line.
 *
 * Point values sit above their dots in the dot's color; where two would touch,
 * the later one drops below its dot, and one that fits neither way is left out
 * (hover still shows it). Rows grow to keep room for them.
 *
 * Hover starts only with the pointer over a dot (its circle plus a few px),
 * not over the row label, band, or empty row (owner, 2026-10-05). Then, as the
 * range chart does it, that dot's row label turns bold and dark, and every dot
 * in the row shows its value in bold, placed the same way. A
 * screen-reader-only role="tooltip" names the row and every series' value,
 * missing ones included.
 *
 * Keyboard: the chart takes focus; the arrow keys step through the rows, Home
 * and End jump to the first and last, and Escape clears the hover. New data
 * clears it too.
 *
 * Props:
 *   model  {Object} — from buildDotPlotModel (lib/visualization/models/dotPlotModel.js)
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

import { readableTextColor } from "@/lib/visualization/chartLayout/contrast";
import { plotClipRect, svgSafeId } from "@/lib/visualization/chartLayout/plotClip";
import { rowLabels } from "@/lib/visualization/chartLayout/rowLabels";
import { textWidth } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { text, range: rangeStyle, bar: barStyle, dot: dotStyle } = CHART_STYLE;
const EDGE = 12; // breathing room at the plot edges
const TICK_GAP = 8;
const LABEL_GAP = 12; // between the row label column and the plot
const LINE_HEIGHT = 1.2;
const MAX_ROW = 40; // a short list keeps rows close, not spread down the frame
const HIT_SLOP = 3; // px beyond a dot's edge that still counts as over it

// ── Helpers ──────────────────────────────────────────────────────────

/** x of a label anchored left, center, or right in a column `width` wide. */
function anchorX(alignment, width) {
  if (alignment === "center") return width / 2;
  if (alignment === "right") return width;
  return 0;
}

const ANCHORS = Object.freeze({ left: "start", center: "middle", right: "end" });

/**
 * Where each value goes: above its dot, else below, else nowhere, so no two
 * touch. `items` are [{ x, text }] in one row; returns "above" | "below" |
 * null for each, in the same order.
 */
function valueSides(items, fontSize) {
  const taken = { above: [], below: [] };
  const order = items.map((_, index) => index).sort((a, b) => items[a].x - items[b].x);
  const sides = items.map(() => null);
  for (const index of order) {
    const halfWidth = textWidth(items[index].text, fontSize) / 2 + 2;
    const span = [items[index].x - halfWidth, items[index].x + halfWidth];
    for (const side of ["above", "below"]) {
      if (taken[side].some(([from, to]) => span[0] < to && from < span[1])) continue;
      taken[side].push(span);
      sides[index] = side;
      break;
    }
  }
  return sides;
}

// ── Component ────────────────────────────────────────────────────────

export default function DotPlot({ model, width, height }) {
  // The hover belongs to one model; a new model (new data) starts closed.
  const [hovered, setHovered] = React.useState(null);
  const active = hovered?.model === model ? hovered.index : null;
  const setActive = (index) => setHovered(index === null || index === undefined ? null : { model, index });
  const tooltipId = React.useId();
  const clipId = svgSafeId("plot-clip", React.useId());

  const rows = model.rows || [];
  const groups = model.groups || [];
  const series = model.series || [];
  const points = model.points || [];
  const axisSize = model.typography?.axis ?? text.axis.fontSize;
  const labelSize = model.typography?.dataLabel ?? text.dataLabel.fontSize;
  const axisFont = { fontFamily: text.axis.fontFamily, fontSize: axisSize, fill: text.axis.color };
  const labelFont = { fontFamily: text.dataLabel.fontFamily, fontSize: labelSize };
  const valueAxis = model.valueAxis || {};
  const showAxis = valueAxis.visible !== false;
  const domain = valueAxis.domain || [0, 1];
  const ticks = valueAxis.ticks || [];
  const tickText = valueAxis.tickText || [];
  const yTitle = model.labels?.yAxis;
  const xTitle = showAxis ? model.labels?.xAxis : null;
  const radius = model.radius ?? dotStyle.markerSize / 2;
  const groupAlignment = model.rowLabels?.groupAlignment || "left";
  const variableAlignment = model.rowLabels?.variableAlignment || "left";
  const showValues = Boolean(model.pointLabels?.show);

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

  // ── Plot width: values sit above or below their dots, so only the ends need room. ──
  const lastTickHalf = showAxis ? Math.ceil(textWidth(tickText.at(-1) || "", axisSize) / 2) : 0;
  const widestValue = Math.max(0, ...points.map((point) => textWidth(point.text, labelSize)));
  const edgeRoom = Math.max(radius + 2, Math.ceil(widestValue / 2));
  const right = Math.max(EDGE, lastTickHalf);
  const plotWidth = Math.max(1, width - left - right);
  const valueScale = scaleLinear({
    domain,
    range: [Math.min(edgeRoom, plotWidth / 4), Math.max(plotWidth / 2, plotWidth - Math.min(edgeRoom, plotWidth / 4))],
  });

  const tickRoom = Math.max(0, ...tickText.map((label) => textWidth(label, axisSize))) + TICK_GAP;
  const tickSpacing = ticks.length > 1 ? Math.abs(valueScale(ticks[1]) - valueScale(ticks[0])) : Infinity;
  const tickEvery = Math.max(1, Math.ceil(tickRoom / Math.max(1, tickSpacing)));
  const shownTicks = ticks
    .map((tick, index) => ({ tick, text: tickText[index] }))
    .filter((_, index) => index % tickEvery === 0);

  // ── Rows down the plot ──
  const axisRoom = showAxis ? TICK_GAP + axisSize : 0;
  const top = (yTitle ? axisSize + 12 : 0) + EDGE;
  // The drawing ends at its lowest text's descent, so the frame's gap below it
  // (to the key or the source box) is measured from the text, as PPIC
  // publishes it (owner, 2026-10-12).
  const descent = Math.ceil(axisSize * CHART_STYLE.fontMetrics.descent);
  const bottom = Math.max(EDGE, axisRoom + (xTitle ? TICK_GAP + axisSize : 0) + descent);
  const headerSize = axisSize * LINE_HEIGHT + TICK_GAP;
  const maxLines = Math.max(1, ...wrapped.labels.map((label) => label.lines.length));
  // A row keeps room for a value above and below its dots when values show,
  // and for them on hover otherwise.
  const valueRoom = 2 * (labelSize + dotStyle.labelGap);
  const minRow = Math.max(radius * 2 + valueRoom, maxLines * axisSize * LINE_HEIGHT + 6);
  const available = Math.max(1, height - top - bottom - groups.length * headerSize);
  const rowSize = Math.min(Math.max(MAX_ROW, minRow), Math.max(minRow, available / rows.length));
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

  // ── Dots, row by row, with the outline rule for overlaps ──
  const byRow = rows.map(() => []);
  for (const point of points) byRow[point.row]?.push(point);
  const outlined = new Set();
  for (const rowPoints of byRow) {
    rowPoints.forEach((point, index) => {
      const x = valueScale(point.value);
      const overlapsEarlier = rowPoints
        .slice(0, index)
        .some((earlier) => Math.abs(valueScale(earlier.value) - x) < earlier.radius + point.radius);
      if (overlapsEarlier) outlined.add(point.key);
    });
  }

  // ── Values: the chosen ones always, and the hovered row's in bold ──
  const valueLabels = (rowPoints, field) => {
    const items = rowPoints
      .filter((point) => point[field])
      .map((point) => ({ point, x: valueScale(point.value), text: point[field] }));
    const sides = valueSides(items, labelSize);
    return items.flatMap((item, index) => (sides[index] ? [{ ...item, side: sides[index] }] : []));
  };
  const shownValues = showValues
    ? byRow.flatMap((rowPoints, index) => (index === active ? [] : valueLabels(rowPoints, "label")))
    : [];
  const hoverValues = active !== null ? valueLabels(byRow[active] || [], "text") : [];
  const valueY = (point, side) => {
    const offset = point.radius + dotStyle.labelGap + labelSize / 2;
    return center(point.row) + (side === "above" ? -offset : offset);
  };

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

  const activeRow = active !== null ? rows[active] ?? null : null;
  const describe = (row) => {
    const name = row.group ? `${row.label}, ${row.group}` : row.label;
    const values = row.values.map((entry) => {
      const label = series.find((item) => item.id === entry.seriesId)?.label ?? entry.seriesId;
      return `${label}, ${entry.text}`;
    });
    return `${name}: ${values.join("; ")}`;
  };

  // A reader's axis range may cut through the dots; one on the range's end stays whole.
  const clipRect = plotClipRect({ width: plotWidth, height: plotHeight, clipX: valueAxis.clip, bleed: radius });

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
          {clipRect ? (
            <defs>
              <clipPath id={clipId}>
                <rect {...clipRect} />
              </clipPath>
            </defs>
          ) : null}
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
                  y={plotHeight + TICK_GAP}
                  textAnchor="middle"
                  dominantBaseline="hanging"
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
              <g key={row.key} data-key={row.key}>
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
                <g clipPath={clipRect ? `url(#${clipId})` : undefined} data-plot-clip={clipRect ? "" : undefined}>
                {row.band ? (
                  <line
                    x1={valueScale(row.band.from)}
                    x2={valueScale(row.band.to)}
                    y1={y}
                    y2={y}
                    stroke={dotStyle.band.color}
                    strokeWidth={dotStyle.band.width}
                    strokeLinecap="round"
                    data-mark="band"
                    pointerEvents="none"
                  />
                ) : null}
                {byRow[index].map((point) => (
                  <circle
                    key={point.key}
                    cx={valueScale(point.value)}
                    cy={y}
                    r={point.radius}
                    fill={point.color}
                    {...(outlined.has(point.key)
                      ? { stroke: dotStyle.outline.color, strokeWidth: dotStyle.outline.width }
                      : {})}
                    data-mark="point"
                    data-series={point.seriesId}
                    pointerEvents="none"
                  />
                ))}
                {/* Only the dots answer the pointer, each a few px beyond its
                    edge so a small dot is easy to reach; the row label, band,
                    and empty row do not. */}
                {byRow[index].map((point) => (
                  <circle
                    key={`hit-${point.key}`}
                    cx={valueScale(point.value)}
                    cy={y}
                    r={point.radius + HIT_SLOP}
                    fill="transparent"
                    data-mark="point-hit"
                    data-key={point.key}
                    onPointerEnter={() => setActive(index)}
                    onPointerLeave={() => setActive(null)}
                  />
                ))}
                </g>
              </g>
            );
          })}

          {shownValues.map(({ point, x, text: value, side }) => (
            <text
              key={`value-${point.key}`}
              x={x}
              y={valueY(point, side)}
              textAnchor="middle"
              dominantBaseline="central"
              {...labelFont}
              fill={readableTextColor(point.color)}
              data-mark="value-label"
              data-key={point.key}
              pointerEvents="none"
            >
              {value}
            </text>
          ))}

          {hoverValues.map(({ point, x, text: value, side }) => (
            <text
              key={`hover-${point.key}`}
              x={x}
              y={valueY(point, side)}
              textAnchor="middle"
              dominantBaseline="central"
              {...labelFont}
              fontWeight={700}
              fill={readableTextColor(point.color)}
              data-mark="hover-label"
              data-key={point.key}
              pointerEvents="none"
            >
              {value}
            </text>
          ))}

          {xTitle ? (
            <text
              x={plotWidth / 2}
              y={plotHeight + bottom - descent}
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
