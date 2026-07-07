/**
 * toRCode.js — generate a ggplot2 script from a chart spec.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   toRCode(spec, table) → { code, warnings }
 *   (a `schema` argument is not needed: `spec.bindings` already stores the
 *   canonical field names generation backticks directly)
 *
 * Data sources:
 *   - none (pure function over a chart spec + optional display table)
 */

import { R_GEOM_FOR_CHART, SUPPORTED_CHART_TYPES, featureCoverage } from "./grammar";

function backtick(name) {
  return `\`${name}\``;
}

function rString(value) {
  return JSON.stringify(String(value));
}

function csvFilename(spec, table) {
  if (table?.filename) return table.filename;
  const module = spec.module || "data";
  return `${module}-${spec.chartType}.csv`;
}

function labsArgs(labels = {}) {
  const parts = [];
  if (labels.title) parts.push(`title = ${rString(labels.title)}`);
  if (labels.subtitle) parts.push(`subtitle = ${rString(labels.subtitle)}`);
  if (labels.xAxis) parts.push(`x = ${rString(labels.xAxis)}`);
  if (labels.yAxis) parts.push(`y = ${rString(labels.yAxis)}`);
  return parts;
}

function aesArgsFor(spec) {
  const bindings = spec.bindings || {};
  const parts = [];
  switch (spec.chartType) {
    case "line":
      parts.push(`x = ${backtick(bindings.x)}`);
      parts.push(`y = ${backtick(bindings.y)}`);
      if (bindings.series) parts.push(`color = ${backtick(bindings.series)}`);
      break;
    case "bar":
      parts.push(`x = ${backtick(bindings.category)}`);
      parts.push(`y = ${backtick(bindings.y)}`);
      break;
    case "scatter":
    case "bubble":
      parts.push(`x = ${backtick(bindings.x)}`);
      parts.push(`y = ${backtick(bindings.y)}`);
      if (spec.chartType === "bubble" && bindings.size) {
        parts.push(`size = ${backtick(bindings.size)}`);
      }
      if (bindings.color) parts.push(`color = ${backtick(bindings.color)}`);
      break;
    case "heatmap":
      parts.push(`x = ${backtick(bindings.x)}`);
      parts.push(`y = ${backtick(bindings.y)}`);
      parts.push(`fill = ${backtick(bindings.color)}`);
      break;
    default:
      break;
  }
  return parts;
}

/**
 * Generate a ggplot2 script for the given spec. `table` (the display-table
 * module) may be null — the CSV filename then falls back to
 * `<module or "data">-<chartType>.csv`. Returns `{ code: "", warnings }` for
 * chart types R codegen doesn't support (see `SUPPORTED_CHART_TYPES.r`).
 */
export function toRCode(spec, table) {
  const warnings = featureCoverage(spec, "r");
  if (!SUPPORTED_CHART_TYPES.r.includes(spec.chartType)) {
    return { code: "", warnings };
  }

  const filename = csvFilename(spec, table);
  const lines = [];
  lines.push("library(tidyverse)");
  lines.push("");
  lines.push(`data <- read_csv(${rString(filename)})`);
  lines.push("");

  const pipeline = [
    `ggplot(data, aes(${aesArgsFor(spec).join(", ")}))`,
    `${R_GEOM_FOR_CHART[spec.chartType]}()`,
  ];

  const labs = labsArgs(spec.labels);
  if (labs.length) pipeline.push(`labs(${labs.join(", ")})`);

  if (spec.chartType === "bar" && spec.appearance?.orientation === "horizontal") {
    pipeline.push("coord_flip()");
  }

  lines.push(pipeline.join(" +\n  "));

  return { code: `${lines.join("\n").replace(/\n+$/, "")}\n`, warnings };
}
