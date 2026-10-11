"use client";

/**
 * ForestPlot.js — the visx forest plot, drawn from a forest model at an exact
 * size.
 *
 * A range-family chart (renderer plan H), so it shares the range chart's row
 * layout:
 *   - One row per study (category, or comparison), labeled at the left from
 *     `rowLabels.js`, left-aligned by default, with a dotted guide line along
 *     the row. Groups of rows get a bold header row.
 *   - A thin gray interval line from the lower to the upper bound, a mark at
 *     each end (vertical bars, dots, open diamonds, or none), and one estimate
 *     marker (square, diamond, dot, or none). Every estimate marker is the
 *     same size, whatever the study's weight. A row missing either bound draws
 *     no interval line, only the end it has; a row missing its estimate draws
 *     no estimate marker.
 *   - A dashed line of no effect at the chosen value, drawn behind the marks
 *     and left out when no value is set (0 is a real value).
 *   - The value axis sits at the bottom, with a light vertical grid line at
 *     each labeled tick and a darker line at zero whenever the axis reaches it
 *     (the line of no effect covers it when it sits there). Labels thin out
 *     when they would touch. Hide X-Axis leaves out the labels and grid lines
 *     but keeps the zero line.
 *   - The key, when the interval ends are colored, is drawn by ChartFrame. The
 *     drawing is only as tall as its rows (the model's `fitContent`), so the
 *     source box follows it directly.
 *
 * Point values: when Show point values is on, each estimate's value sits above
 * its marker in the marker's (readable) color.
 *
 * Hover, in the manner of the range chart: the information goes on the chart,
 * not in a floating box. The hovered row's label turns bold and dark, and its
 * estimate and both bounds appear in bold beside their marks. A
 * screen-reader-only role="tooltip" names the row, the estimate, and the
 * interval, with missing values read as unavailable.
 *
 * Keyboard: the chart takes focus; the arrow keys step through the rows, Home
 * and End jump to the first and last, and Escape clears the hover. New data
 * clears it too.
 *
 * Props:
 *   model  {Object} — from buildForestModel (lib/visualization/models/forestModel.js)
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
import { rowLabels } from "@/lib/visualization/chartLayout/rowLabels";
import { textWidth } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { text, range: rangeStyle, bar: barStyle, forest: forestStyle } = CHART_STYLE;
const EDGE = 12; // breathing room at the plot edges
const TICK_GAP = 8;
const LABEL_GAP = 12; // between the row label column and the plot
const LINE_HEIGHT = 1.2;
const MAX_ROW = 40; // a short list keeps rows close, not spread down the frame
const ENDS = Object.freeze(["lower", "upper"]);

// ── Helpers ──────────────────────────────────────────────────────────

/** x of a label anchored left, center, or right in a column `width` wide. */
function anchorX(alignment, width) {
  if (alignment === "center") return width / 2;
  if (alignment === "right") return width;
  return 0;
}

const ANCHORS = Object.freeze({ left: "start", center: "middle", right: "end" });

/** A diamond `size` wide, centered on (x, y), as an SVG path. */
function diamondPath(x, y, size) {
  const half = size / 2;
  return `M ${x - half} ${y} L ${x} ${y - half} L ${x + half} ${y} L ${x} ${y + half} Z`;
}

/**
 * Which side of the row each bound's hover value goes on: left of the lower
 * of the two and right of the higher. A row with one bound puts it on the right.
 */
function sides(row) {
  if (row.lower === null || row.upper === null) return { lower: "right", upper: "right" };
  return row.lower <= row.upper ? { lower: "left", upper: "right" } : { lower: "right", upper: "left" };
}

// ── Component ────────────────────────────────────────────────────────

export default function ForestPlot({ model, width, height }) {
  // The hover belongs to one model; a new model (new data) starts closed.
  const [hovered, setHovered] = React.useState(null);
  const active = hovered?.model === model ? hovered.index : null;
  const setActive = (index) => setHovered(index === null || index === undefined ? null : { model, index });
  const tooltipId = React.useId();

  const rows = model.rows || [];
  const groups = model.groups || [];
  const colors = model.colors || {};
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
  const groupAlignment = model.rowLabels?.groupAlignment || "left";
  const variableAlignment = model.rowLabels?.variableAlignment || "left";
  const showValues = Boolean(model.pointLabels?.show);
  const endpointStyle = model.endpointStyle || "caps";
  const pointStyle = model.pointStyle || "square";
  // Every estimate marker is this size, and every end mark of a kind is its own.
  const markerSize = forestStyle.marker.size;
  const markReach = Math.max(
    markerSize / 2,
    endpointStyle === "dots" || endpointStyle === "diamonds" ? forestStyle.endpoint.size / 2 : 0,
    endpointStyle === "caps" ? forestStyle.cap.width / 2 : 0,
  );

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

  // ── Plot width: keep room beside the bounds for their hover values, and
  // beyond the estimates for their labels (centered above their markers). ──
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
      if (row[end] === null) continue;
      reserve(rough(row[end]), side[end], textWidth(row.text[end], labelSize) + forestStyle.labelGap + markReach);
    }
    if (row.estimate !== null) {
      const half = Math.ceil(textWidth(row.text.estimate, labelSize) / 2);
      reserve(rough(row.estimate), "left", half);
      reserve(rough(row.estimate), "right", half);
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
  const top = (yTitle ? axisSize + 12 : 0) + EDGE;
  const bottom = Math.max(EDGE, axisRoom + (xTitle ? TICK_GAP + axisSize : 0) + TICK_GAP);
  const headerSize = axisSize * LINE_HEIGHT + TICK_GAP;
  const maxLines = Math.max(1, ...wrapped.labels.map((label) => label.lines.length));
  // A row keeps room for an estimate's value above its marker (and the same
  // below, so the row stays centered).
  const valueRoom = 2 * (labelSize + forestStyle.labelGap);
  const minRow = Math.max(markerSize + valueRoom, maxLines * axisSize * LINE_HEIGHT + 6);
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

  // ── Values: the chosen estimates always, and the hovered row's in bold ──
  const estimateY = (index) => center(index) - markerSize / 2 - forestStyle.labelGap - labelSize / 2;
  const shownValues = showValues
    ? rows.flatMap((row, index) =>
      index === active || row.pointLabel === null
        ? []
        : [{ row, index, x: valueScale(row.estimate), y: estimateY(index), text: row.pointLabel, color: colors.estimate }],
    )
    : [];
  const activeRow = active !== null ? rows[active] ?? null : null;
  const hoverValues = activeRow
    ? [
      ...(activeRow.estimate !== null
        ? [{
          key: "estimate",
          x: valueScale(activeRow.estimate),
          y: estimateY(active),
          anchor: "middle",
          text: activeRow.text.estimate,
          color: colors.estimate,
        }]
        : []),
      ...ENDS.flatMap((end) => {
        if (activeRow[end] === null) return [];
        const side = sides(activeRow)[end];
        const offset = markReach + forestStyle.labelGap;
        return [{
          key: end,
          x: valueScale(activeRow[end]) + (side === "left" ? -offset : offset),
          y: center(active),
          anchor: side === "left" ? "end" : "start",
          text: activeRow.text[end],
          color: colors[end],
        }];
      }),
    ]
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
    const name = row.group ? `${row.label}, ${row.group}` : row.label;
    return `${name}: estimate ${row.text.estimate}; interval ${row.text.lower} to ${row.text.upper}`;
  };

  /** One end of an interval, in the chosen style. */
  const endMark = (row, end, y) => {
    if (row[end] === null || endpointStyle === "none") return null;
    const x = valueScale(row[end]);
    const common = { "data-mark": "interval-end", "data-endpoint": end, pointerEvents: "none" };
    const color = colors[end];
    if (endpointStyle === "dots") {
      return <circle key={end} cx={x} cy={y} r={forestStyle.endpoint.size / 2} fill={color} stroke={color} strokeWidth={forestStyle.endpoint.width} {...common} />;
    }
    if (endpointStyle === "diamonds") {
      // Open diamonds, as the Plotly forest plot draws them.
      return (
        <path
          key={end}
          d={diamondPath(x, y, forestStyle.endpoint.size)}
          fill={CHART_STYLE.forest.marker.outline.color}
          stroke={color}
          strokeWidth={forestStyle.endpoint.width}
          {...common}
        />
      );
    }
    return (
      <line
        key={end}
        x1={x}
        x2={x}
        y1={y - forestStyle.cap.height / 2}
        y2={y + forestStyle.cap.height / 2}
        stroke={color}
        strokeWidth={forestStyle.cap.width}
        {...common}
      />
    );
  };

  /** The estimate marker: one size for every row. */
  const estimateMark = (row, y) => {
    if (row.estimate === null || pointStyle === "none") return null;
    const x = valueScale(row.estimate);
    const common = {
      fill: colors.estimate,
      stroke: forestStyle.marker.outline.color,
      strokeWidth: forestStyle.marker.outline.width,
      "data-mark": "estimate",
      pointerEvents: "none",
    };
    if (pointStyle === "dot") return <circle cx={x} cy={y} r={markerSize / 2} {...common} />;
    if (pointStyle === "diamond") return <path d={diamondPath(x, y, markerSize * 1.4)} {...common} />;
    return <rect x={x - markerSize / 2} y={y - markerSize / 2} width={markerSize} height={markerSize} {...common} />;
  };

  const referenceLine = model.referenceLine;
  const referenceVisible = referenceLine && referenceLine.value >= Math.min(...domain) && referenceLine.value <= Math.max(...domain);

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
          {referenceVisible ? (
            <line
              x1={valueScale(referenceLine.value)}
              x2={valueScale(referenceLine.value)}
              y1={0}
              y2={plotHeight}
              stroke={forestStyle.noEffect.color}
              strokeWidth={forestStyle.noEffect.width}
              strokeDasharray={forestStyle.noEffect.dash}
              data-mark="no-effect-line"
              pointerEvents="none"
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
                {row.interval ? (
                  <line
                    x1={valueScale(row.interval.from)}
                    x2={valueScale(row.interval.to)}
                    y1={y}
                    y2={y}
                    stroke={colors.interval}
                    strokeWidth={forestStyle.interval.width}
                    data-mark="interval"
                    pointerEvents="none"
                  />
                ) : null}
                {ENDS.map((end) => endMark(row, end, y))}
                {estimateMark(row, y)}
              </g>
            );
          })}

          {shownValues.map(({ row, x, y, text: value, color }) => (
            <text
              key={`value-${row.key}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              {...labelFont}
              fill={readableTextColor(color)}
              data-mark="value-label"
              data-key={row.key}
              pointerEvents="none"
            >
              {value}
            </text>
          ))}

          {hoverValues.map(({ key, x, y, anchor, text: value, color }) => (
            <text
              key={`hover-${key}`}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="central"
              {...labelFont}
              fontWeight={700}
              fill={readableTextColor(color)}
              data-mark="hover-label"
              data-part={key}
              pointerEvents="none"
            >
              {value}
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
