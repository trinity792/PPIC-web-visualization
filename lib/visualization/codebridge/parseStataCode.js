/**
 * parseStataCode.js — static, non-executing parser for the recognized
 * twoway/graph subset produced by `toStataCode.js`. Never runs any code,
 * never throws.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   parseStataCode(text, { schema, baseSpec }) → { spec, warnings, errors }
 *     spec is null whenever any error-level finding exists.
 *
 * Data sources:
 *   - none (pure text parsing over the live schema + config passed in)
 */

import { fieldForSlug } from "./grammar";
import { PRESET_ORDER, PRESETS } from "@/lib/visualization/presetRegistry";

function err(code, message, line) {
  return { level: "error", code, message, ...(line != null ? { line } : {}) };
}

function warnFinding(code, message, line) {
  return { level: "warn", code, message, ...(line != null ? { line } : {}) };
}

function presetForChartType(chartType) {
  const id = PRESET_ORDER.find((presetId) => PRESETS[presetId].chartType === chartType);
  return id ? PRESETS[id] : null;
}

function parenBalance(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return depth;
}

const LINE_RE = /twoway\s*\(?\s*line\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)\)?/i;
const SCATTER_RE = /twoway\s+scatter\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)/i;
const BAR_RE = /graph\s+(bar|hbar)\s*(?:\(asis\))?\s+([A-Za-z0-9_]+)\s*,\s*over\(([A-Za-z0-9_]+)\)/i;
const OPTION_RE = /(title|subtitle|ytitle|xtitle)\(\s*"([^"]*)"\s*\)/g;
const MAPPING_COMMENT_RE = /^\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"\s*$/;

/**
 * Parse a Stata script into a spec, overlaying recognized structure onto
 * `baseSpec` (the live config). Recognizes `use`/`import delimited` (data
 * ref, unchecked here), `twoway (line y x)` / `twoway line y x`,
 * `twoway scatter y x`, `graph bar (asis) y, over(cat)`, `graph hbar ...`,
 * and the `title()`/`subtitle()`/`ytitle()`/`xtitle()` option calls. Variable
 * slugs resolve via the generator's `* slug = "Column"` mapping comments when
 * present, falling back to `grammar.fieldForSlug`. Any other command line is
 * a CODE_UNSUPPORTED warning; unbalanced parentheses or an unresolvable field
 * slug are CODE_PARSE_ERROR / UNKNOWN_FIELD errors, and `spec` is null
 * whenever any error exists.
 */
export function parseStataCode(text, { schema, baseSpec } = {}) {
  try {
    if (typeof text !== "string" || !text.trim()) {
      return { spec: null, warnings: [], errors: [err("CODE_PARSE_ERROR", "No code to parse.")] };
    }

    const rawLines = text.split("\n");
    const slugMap = {};
    const bodyLines = [];
    rawLines.forEach((rawLine, index) => {
      const mapMatch = MAPPING_COMMENT_RE.exec(rawLine);
      if (mapMatch) {
        slugMap[mapMatch[1]] = mapMatch[2];
        return;
      }
      if (/^\s*\*/.test(rawLine)) return; // full-line comment
      const withoutInline = rawLine.split("//")[0];
      bodyLines.push({ text: withoutInline, line: index + 1 });
    });

    const body = bodyLines.map((entry) => entry.text).join("\n");

    if (parenBalance(body) !== 0) {
      return {
        spec: null,
        warnings: [],
        errors: [err("CODE_PARSE_ERROR", "Unbalanced parentheses.", rawLines.length)],
      };
    }

    function resolveField(slug) {
      return slugMap[slug] || fieldForSlug(slug, schema);
    }

    function lineFor(pattern) {
      const found = bodyLines.find((entry) => pattern.test(entry.text));
      return found?.line;
    }

    const errors = [];
    const warnings = [];

    function fieldOrError(slug, atLine) {
      const field = resolveField(slug);
      if (!field || !schema?.fields?.[field]) {
        errors.push(err("UNKNOWN_FIELD", `"${slug}" does not resolve to a field in this module.`, atLine));
        return null;
      }
      return field;
    }

    let chartType = null;
    let bindings = { ...(baseSpec?.bindings || {}) };
    let appearance = { ...(baseSpec?.appearance || {}) };

    const lineMatch = LINE_RE.exec(body);
    const scatterMatch = !lineMatch && SCATTER_RE.exec(body);
    const barMatch = !lineMatch && !scatterMatch && BAR_RE.exec(body);

    if (lineMatch) {
      chartType = "line";
      const atLine = lineFor(LINE_RE);
      const yField = fieldOrError(lineMatch[1], atLine);
      const xField = fieldOrError(lineMatch[2], atLine);
      if (yField) bindings.y = yField;
      if (xField) bindings.x = xField;
    } else if (scatterMatch) {
      chartType = "scatter";
      const atLine = lineFor(SCATTER_RE);
      const yField = fieldOrError(scatterMatch[1], atLine);
      const xField = fieldOrError(scatterMatch[2], atLine);
      if (yField) bindings.y = yField;
      if (xField) bindings.x = xField;
    } else if (barMatch) {
      chartType = "bar";
      appearance = {
        ...appearance,
        orientation: barMatch[1].toLowerCase() === "hbar" ? "horizontal" : "vertical",
      };
      const atLine = lineFor(BAR_RE);
      const yField = fieldOrError(barMatch[2], atLine);
      const catField = fieldOrError(barMatch[3], atLine);
      if (yField) bindings.y = yField;
      if (catField) bindings.category = catField;
    } else {
      chartType = baseSpec?.chartType;
    }

    // Unrecognized command lines → CODE_UNSUPPORTED warnings.
    for (const entry of bodyLines) {
      const trimmed = entry.text.trim();
      if (!trimmed) continue;
      if (/^(import delimited|use)\b/i.test(trimmed)) continue;
      if ([LINE_RE, SCATTER_RE, BAR_RE].some((re) => re.test(trimmed))) continue;
      if (/^(title|subtitle|ytitle|xtitle)\(/i.test(trimmed)) continue;
      warnings.push(warnFinding("CODE_UNSUPPORTED", `Unrecognized line: "${trimmed}"`, entry.line));
    }

    // Labels from title()/subtitle()/ytitle()/xtitle() option calls.
    const labels = { ...(baseSpec?.labels || {}) };
    let optMatch;
    OPTION_RE.lastIndex = 0;
    while ((optMatch = OPTION_RE.exec(body))) {
      const [, key, value] = optMatch;
      if (key === "title") labels.title = value;
      else if (key === "subtitle") labels.subtitle = value;
      else if (key === "ytitle") labels.yAxis = value;
      else if (key === "xtitle") labels.xAxis = value;
    }

    if (errors.length) {
      return { spec: null, warnings, errors };
    }

    const preset = chartType ? presetForChartType(chartType) : null;
    const spec = {
      ...baseSpec,
      chartType,
      bindings,
      labels,
      appearance,
      preset: preset ? preset.id : baseSpec?.preset,
    };

    return { spec, warnings, errors };
  } catch (cause) {
    return {
      spec: null,
      warnings: [],
      errors: [err("CODE_PARSE_ERROR", `Unexpected parse failure: ${cause.message}`)],
    };
  }
}
