/**
 * heatmapModel.js — the chart model for the visx heatmap.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Turns observations into a plain description of what to draw. The rows,
 * columns, and color ramp come from `heatmapGrid`, the same function the Plotly
 * heatmap adapter uses, so a cell keeps its color when the renderer changes.
 * Each cell's color is its value's place on that ramp, between the lowest and
 * highest drawn values, as Plotly colors a heatmap.
 *
 * Honest charts: a missing or suppressed value is an empty cell (`fill: null`),
 * never the lowest color. Invert color scale (`invertScale`) reverses the ramp.
 * The Categories panel orders (`categoryOrder`) and hides (`hiddenCategories`)
 * rows. Show cell values (`showCellValues`, off by default) prints each value
 * in its cell, in white or dark gray, whichever contrasts more with the cell.
 *
 * Values are formatted in the vertical number type and decimal places when one
 * is chosen, else as the View Data table writes them. The key is the ramp as a
 * labeled bar (lowest and highest value), titled with the measure.
 *
 * Exports:
 *   buildHeatmapModel(input) — {
 *     chartType, labels, typography, key, frame, summary, emptyMessage,
 *     periods: [{ value, label }]            — the columns, oldest first
 *     categories: string[]                   — the rows, as ordered and filtered
 *     cells: [{ key, category, period, value, valueLabel, fill, textColor, status }]
 *     colorScale: [[stop, hex], ...]         — the ramp both renderers use
 *     showCellValues                         — whether each cell prints its value
 *   }
 *
 * Data sources:
 *   - adaptObservations input, via buildChartModel (models/index.js)
 */

import { contrastRatio } from "@/lib/visualization/chartLayout/contrast";
import { CHART_STYLE } from "@/lib/visualization/chartStyle";
import { continuousColor } from "@/lib/visualization/colorScale";
import { formatTableNumber, unavailableValueText } from "@/lib/visualization/formatters";
import { heatmapGrid } from "@/lib/visualization/heatmapGrid";
import { sharedSettings } from "@/lib/visualization/models/sharedSettings";

const { cellText } = CHART_STYLE.heatmap;

/** White or dark gray, whichever contrasts more with the cell. */
function textColorFor(fill) {
  return contrastRatio(cellText.light, fill) >= contrastRatio(cellText.dark, fill)
    ? cellText.light
    : cellText.dark;
}

function summaryText({ measure, categories, periods, cells }) {
  const drawn = cells.filter((cell) => cell.fill);
  if (!drawn.length) return `Heatmap of ${measure}: nothing to draw.`;
  const low = drawn.reduce((a, b) => (b.value < a.value ? b : a));
  const high = drawn.reduce((a, b) => (b.value > a.value ? b : a));
  const empty = cells.length - drawn.length;
  const emptyText = empty ? ` ${empty} ${empty === 1 ? "cell has" : "cells have"} no value.` : "";
  return (
    `Heatmap of ${measure}: ${categories.length} rows by ${periods.length} columns, ` +
    `from ${low.valueLabel} (${low.category}, ${low.period}) to ` +
    `${high.valueLabel} (${high.category}, ${high.period}).${emptyText}`
  );
}

export function buildHeatmapModel(input) {
  const { observations = [], appearance = {} } = input;
  const shared = sharedSettings({ ...input, chartType: "heatmap" });
  const grid = heatmapGrid(input);
  const valueText = (value) =>
    shared.axes.y.numberType ? shared.axes.y.format(value) : formatTableNumber(value);

  const cells = grid.cells.map((cell) => {
    const fill = grid.domain ? continuousColor(cell.value, grid.domain, grid.colorScale) : null;
    return {
      key: `${cell.category}|${cell.period}`,
      category: cell.category,
      period: cell.period,
      value: cell.value,
      status: cell.status,
      valueLabel: Number.isFinite(cell.value) ? valueText(cell.value) : unavailableValueText(cell.status),
      fill,
      textColor: fill ? textColorFor(fill) : null,
    };
  });
  const measure = observations[0]?.measureLabel || observations[0]?.measureId || "values";
  const periods = grid.periods.map((period) => ({ value: period, label: String(period) }));

  return {
    chartType: "heatmap",
    labels: shared.labels,
    typography: shared.typography,
    key: {
      position: shared.key.position,
      title: measure,
      entries: [],
      scale: grid.domain
        ? {
            stops: grid.colorScale,
            minLabel: valueText(grid.domain[0]),
            maxLabel: valueText(grid.domain[1]),
          }
        : null,
    },
    frame: shared.frame,
    summary: summaryText({ measure, categories: grid.categories, periods, cells }),
    emptyMessage: grid.domain ? null : "There are no values to draw for these selections.",
    periods,
    categories: grid.categories,
    cells,
    colorScale: grid.colorScale,
    showCellValues: appearance.showCellValues === true,
  };
}
