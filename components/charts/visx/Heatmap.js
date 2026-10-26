"use client";

/**
 * Heatmap.js — the visx heatmap, drawn from a heatmap model at an exact size.
 *
 * A grid of cells, one row per category (or place) and one column per period,
 * each filled with its value's color on the model's ramp and split by thin
 * white gaps (renderer plan I). Row names sit to the left, left-aligned as on
 * PPIC's other row charts, and the periods run along the bottom, thinned to
 * every second or third when they would crowd. A missing or suppressed value
 * is an empty, outlined cell, never the lowest color. With Show cell values
 * on, each cell prints its value in white or dark gray, whichever reads better
 * on it. The key (the ramp as a labeled bar) is drawn by ChartKey in the frame.
 *
 * Rows are as tall as the height allows, within `CHART_STYLE.heatmap`'s limits;
 * a long list of rows makes the drawing taller than it was given, and the frame
 * scrolls, as the line chart's spacing does.
 *
 * Hover, in the bar chart's style: the hovered cell takes a dark outline and
 * shows its value inside (unless values already show), and its row and period
 * names turn bold. No floating box; the hovered cell's text is carried by
 * role="tooltip" for screen readers.
 *
 * Keyboard: the chart takes focus; the arrow keys move between cells, Home and
 * End jump to the first and last, and Escape clears the hover. New data clears
 * it too.
 *
 * Props:
 *   model  {Object} — from buildHeatmapModel (lib/visualization/models/heatmapModel.js)
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

import { chartTextWidth, textWidth } from "@/lib/visualization/chartLayout/textWidth";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";

const { text, heatmap: style } = CHART_STYLE;
const EDGE = 2; // keeps the outline of an edge cell inside the svg
const TITLE_GAP = 6;
const LINE_HEIGHT = 1.2;

// ── Component ────────────────────────────────────────────────────────

export default function Heatmap({ model, width, height }) {
  // The hover belongs to one model; a new model (new data) starts closed.
  const [active, setActive, setPointerActive] = useChartHover(model);
  const tooltipId = React.useId();

  const categories = model.categories || [];
  const periods = model.periods || [];
  const cells = model.cells || [];
  if (!categories.length || !periods.length || model.emptyMessage) {
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

  const axisSize = model.typography?.axis ?? text.axis.fontSize;
  const valueSize = model.typography?.dataLabel ?? text.dataLabel.fontSize;
  const titleSize = axisSize;
  const xTitle = model.labels?.xAxis ?? null;
  const yTitle = model.labels?.yAxis ?? null;

  // ── Layout: row names on the left, periods along the bottom ──
  const widestRow = Math.max(...categories.map((name) => chartTextWidth(name, axisSize)));
  const rowColumn = Math.min(Math.ceil(widestRow), Math.floor(width * 0.35));
  const left = rowColumn + style.labelGap;
  const top = (yTitle ? titleSize * LINE_HEIGHT + TITLE_GAP : 0) + EDGE;
  const bottom = axisSize * LINE_HEIGHT + style.labelGap + (xTitle ? titleSize * LINE_HEIGHT + TITLE_GAP : 0) + EDGE;
  const plotWidth = Math.max(1, width - left - EDGE);
  const cellWidth = plotWidth / periods.length;
  const room = Math.max(1, height - top - bottom);
  const rowHeight = Math.min(style.maxRowHeight, Math.max(style.minRowHeight, room / categories.length));
  const plotHeight = rowHeight * categories.length;
  const drawHeight = Math.max(height, top + plotHeight + bottom);
  const gap = style.cellGap;

  // Thin the period labels when they would crowd each other.
  const widestPeriod = Math.max(...periods.map((period) => textWidth(period.label, axisSize)));
  const every = Math.max(1, Math.ceil((widestPeriod + 8) / cellWidth));

  const index = (row, column) => row * periods.length + column;
  const activeCell = active !== null ? cells[active] : null;
  const activeRow = active !== null ? Math.floor(active / periods.length) : null;
  const activeColumn = active !== null ? active % periods.length : null;

  // ── Interaction ──
  const onKeyDown = (event) => {
    const last = cells.length - 1;
    const row = activeRow ?? 0;
    const column = activeColumn ?? 0;
    const moves = {
      ArrowRight: () => (active === null ? 0 : index(row, Math.min(periods.length - 1, column + 1))),
      ArrowLeft: () => (active === null ? 0 : index(row, Math.max(0, column - 1))),
      ArrowDown: () => (active === null ? 0 : index(Math.min(categories.length - 1, row + 1), column)),
      ArrowUp: () => (active === null ? 0 : index(Math.max(0, row - 1), column)),
      Home: () => 0,
      End: () => last,
      Escape: () => null,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive(moves[event.key]());
  };

  const valueVisible = (cellIndex) => model.showCellValues || cellIndex === active;

  return (
    <div className="relative min-w-0" style={{ width, height: drawHeight }}>
      <svg
        role="img"
        aria-label={model.summary}
        tabIndex={0}
        width={width}
        height={drawHeight}
        className="block overflow-visible rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand"
        aria-describedby={activeCell ? tooltipId : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setPointerActive(null)}
      >
        {yTitle ? (
          <text
            x={0}
            y={EDGE}
            dominantBaseline="hanging"
            fontFamily={text.axis.fontFamily}
            fontSize={titleSize}
            fontWeight={700}
            fill={text.axis.color}
            data-axis="y-title"
          >
            {yTitle}
          </text>
        ) : null}

        {categories.map((category, row) => (
          <text
            key={category}
            x={0}
            y={top + row * rowHeight + rowHeight / 2}
            dominantBaseline="central"
            fontFamily={text.axis.fontFamily}
            fontSize={axisSize}
            fontWeight={row === activeRow ? 700 : 400}
            fill={text.axis.color}
            data-axis="row-label"
          >
            {category}
          </text>
        ))}

        {cells.map((cell, cellIndex) => {
          const row = Math.floor(cellIndex / periods.length);
          const column = cellIndex % periods.length;
          const x = left + column * cellWidth + gap / 2;
          const y = top + row * rowHeight + gap / 2;
          const w = Math.max(0, cellWidth - gap);
          const h = Math.max(0, rowHeight - gap);
          const isActive = cellIndex === active;
          return (
            <g key={cell.key}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={cell.fill ?? style.emptyCell.fill}
                stroke={
                  isActive
                    ? style.hoverOutline.color
                    : cell.fill
                      ? "none"
                      : style.emptyCell.stroke
                }
                strokeWidth={isActive ? style.hoverOutline.width : style.emptyCell.width}
                data-mark="cell"
                data-key={cell.key}
                data-missing={cell.fill ? undefined : "true"}
                onPointerEnter={() => setPointerActive(cellIndex)}
              />
              {cell.fill && valueVisible(cellIndex) ? (
                <text
                  x={x + w / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={text.dataLabel.fontFamily}
                  fontSize={valueSize}
                  fontWeight={isActive ? 700 : 400}
                  fill={cell.textColor}
                  pointerEvents="none"
                  data-mark={model.showCellValues ? "cell-value" : "hover-value"}
                >
                  {cell.valueLabel}
                </text>
              ) : null}
            </g>
          );
        })}

        {periods.map((period, column) =>
          column % every === 0 || column === activeColumn ? (
            <text
              key={period.label}
              x={left + column * cellWidth + cellWidth / 2}
              y={top + plotHeight + style.labelGap}
              textAnchor="middle"
              dominantBaseline="hanging"
              fontFamily={text.axis.fontFamily}
              fontSize={axisSize}
              fontWeight={column === activeColumn ? 700 : 400}
              fill={text.axis.color}
              data-axis="column-label"
            >
              {period.label}
            </text>
          ) : null,
        )}

        {xTitle ? (
          <text
            x={left + plotWidth / 2}
            y={top + plotHeight + style.labelGap + axisSize * LINE_HEIGHT + TITLE_GAP}
            textAnchor="middle"
            dominantBaseline="hanging"
            fontFamily={text.axis.fontFamily}
            fontSize={titleSize}
            fontWeight={700}
            fill={text.axis.color}
            data-axis="x-title"
          >
            {xTitle}
          </text>
        ) : null}
      </svg>

      {activeCell ? (
        <div id={tooltipId} role="tooltip" className="sr-only">
          {`${activeCell.category}, ${activeCell.period}: ${activeCell.valueLabel}`}
        </div>
      ) : null}
    </div>
  );
}
