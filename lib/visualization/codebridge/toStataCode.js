/**
 * toStataCode.js — generate a Stata twoway/graph script from a chart spec.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   toStataCode(spec, table) → { code, warnings }
 *   (a `schema` argument is not needed: `spec.bindings` already stores the
 *   canonical field names generation slugs directly)
 *
 * Data sources:
 *   - none (pure function over a chart spec + optional display table)
 */

import { SUPPORTED_CHART_TYPES, featureCoverage, slugForField } from "./grammar";

function quote(value) {
  return JSON.stringify(String(value));
}

function csvFilename(spec, table) {
  if (table?.filename) return table.filename;
  const module = spec.module || "data";
  return `${module}-${spec.chartType}.csv`;
}

function optionArgs(labels = {}) {
  const parts = [];
  if (labels.title) parts.push(`title(${quote(labels.title)})`);
  if (labels.subtitle) parts.push(`subtitle(${quote(labels.subtitle)})`);
  if (labels.yAxis) parts.push(`ytitle(${quote(labels.yAxis)})`);
  if (labels.xAxis) parts.push(`xtitle(${quote(labels.xAxis)})`);
  return parts;
}

// Fields involved for a chart type, in a fixed, deterministic order.
function fieldOrderFor(spec) {
  const bindings = spec.bindings || {};
  if (spec.chartType === "line") return [bindings.y, bindings.x].filter(Boolean);
  if (spec.chartType === "bar") return [bindings.y, bindings.category].filter(Boolean);
  if (spec.chartType === "scatter") return [bindings.y, bindings.x].filter(Boolean);
  return [];
}

/**
 * Generate a Stata script for the given spec. `table` (the display-table
 * module) may be null — the CSV filename then falls back to
 * `<module or "data">-<chartType>.csv`. Returns `{ code: "", warnings }` for
 * chart types Stata codegen doesn't support (see `SUPPORTED_CHART_TYPES.stata`).
 * Multi-series line charts (a `series` binding) generate a warning and a
 * single-series command for the bound y variable only — Stata needs the data
 * reshaped to plot several series, which v1 codegen does not attempt.
 */
export function toStataCode(spec, table) {
  const warnings = featureCoverage(spec, "stata");
  if (!SUPPORTED_CHART_TYPES.stata.includes(spec.chartType)) {
    return { code: "", warnings };
  }

  const bindings = spec.bindings || {};
  const filename = csvFilename(spec, table);
  const lines = [];
  lines.push(`import delimited ${quote(filename)}, clear`);
  lines.push("");

  const slugFor = {};
  for (const field of fieldOrderFor(spec)) {
    if (slugFor[field]) continue;
    slugFor[field] = slugForField(field);
    lines.push(`* ${slugFor[field]} = ${quote(field)}`);
  }
  lines.push("");

  const options = optionArgs(spec.labels);

  if (spec.chartType === "line") {
    if (bindings.series) {
      warnings.push({
        code: "CODEGEN_UNSUPPORTED",
        feature: "series grouping in Stata",
        message:
          "Multi-series line charts require reshaping the data in Stata; generating the single-series command for the bound y variable only.",
      });
    }
    const suffix = options.length ? `, ${options.join(" ")}` : "";
    lines.push(`twoway (line ${slugFor[bindings.y]} ${slugFor[bindings.x]})${suffix}`);
  } else if (spec.chartType === "scatter") {
    const suffix = options.length ? `, ${options.join(" ")}` : "";
    lines.push(`twoway scatter ${slugFor[bindings.y]} ${slugFor[bindings.x]}${suffix}`);
  } else if (spec.chartType === "bar") {
    const horizontal = spec.appearance?.orientation === "horizontal";
    const command = horizontal ? "graph hbar" : "graph bar";
    const suffix = options.length ? ` ${options.join(" ")}` : "";
    lines.push(
      `${command} (asis) ${slugFor[bindings.y]}, over(${slugFor[bindings.category]})${suffix}`,
    );
  }

  return { code: `${lines.join("\n").replace(/\n+$/, "")}\n`, warnings };
}
