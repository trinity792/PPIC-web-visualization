/**
 * parseRCode.js — static, non-executing parser for the recognized ggplot2
 * subset produced by `toRCode.js`. Never runs any code, never throws.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   parseRCode(text, { schema, baseSpec }) → { spec, warnings, errors }
 *     spec is null whenever any error-level finding exists.
 *
 * Data sources:
 *   - none (pure text parsing over the live schema + config passed in)
 */

import { CHART_FOR_R_GEOM, roleForAes } from "./grammar";
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

function lineOf(text, index) {
  if (index == null || index < 0) return undefined;
  return text.slice(0, index).split("\n").length;
}

// Strips a trailing `#` comment from each line (naive: the first `#` outside
// a double-quoted string). Blank/`library(...)` lines pass through untouched
// here; `library(...)` is dropped by `stripLibraryLines`.
function stripComments(text) {
  return text
    .split("\n")
    .map((line) => {
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inString = !inString;
        else if (ch === "#" && !inString) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function stripLibraryLines(text) {
  return text
    .split("\n")
    .filter((line) => !/^\s*library\(/.test(line))
    .join("\n");
}

// Splits `text` on a top-level separator character (one not nested inside
// parentheses) — used both for the `+`-chained ggplot pipeline and for
// comma-separated call arguments.
function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parenBalance(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return depth;
}

function findCallEnd(text, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function unquote(value) {
  const trimmed = value.trim();
  const backticked = trimmed.match(/^`(.*)`$/);
  if (backticked) return backticked[1];
  const quoted = trimmed.match(/^"(.*)"$/);
  return quoted ? quoted[1] : trimmed;
}

function parseArgs(argsText) {
  return splitTopLevel(argsText, ",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return [null, part.trim()];
      return [part.slice(0, eq).trim(), part.slice(eq + 1).trim()];
    });
}

/**
 * Parse a ggplot2 script into a spec, overlaying recognized structure onto
 * `baseSpec` (the live config). Recognizes `ggplot(data, aes(...))`, the
 * geoms in the grammar (plus `geom_bar`/`geom_area`), `labs(...)`,
 * `coord_flip()`, and any `theme*(...)` call (accepted, ignored silently).
 * Any other `+`-chained call is a CODE_UNSUPPORTED warning; unparseable
 * syntax (unbalanced parens, no ggplot(...) call, a malformed chunk) is a
 * CODE_PARSE_ERROR error. An aes value naming a field the schema doesn't
 * have is an UNKNOWN_FIELD error. `spec` is null whenever any error exists.
 */
export function parseRCode(text, { schema, baseSpec } = {}) {
  try {
    if (typeof text !== "string" || !text.trim()) {
      return { spec: null, warnings: [], errors: [err("CODE_PARSE_ERROR", "No code to parse.")] };
    }

    const cleaned = stripLibraryLines(stripComments(text));

    if (parenBalance(cleaned) !== 0) {
      return {
        spec: null,
        warnings: [],
        errors: [err("CODE_PARSE_ERROR", "Unbalanced parentheses.", cleaned.split("\n").length)],
      };
    }

    const ggplotMatch = /ggplot\s*\(/.exec(cleaned);
    if (!ggplotMatch) {
      return {
        spec: null,
        warnings: [],
        errors: [err("CODE_PARSE_ERROR", "No ggplot(...) call found.")],
      };
    }

    const chainText = cleaned.slice(ggplotMatch.index);
    const chunks = splitTopLevel(chainText, "+")
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    const warnings = [];
    const errors = [];

    // Pass 1: determine the chart type from the first recognized geom.
    let chartType = null;
    let appearanceArea = false;
    for (const chunk of chunks) {
      const nameMatch = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\(/.exec(chunk);
      if (!nameMatch || nameMatch[1] === "ggplot") continue;
      const name = nameMatch[1];
      if (CHART_FOR_R_GEOM[name] && chartType == null) {
        chartType = CHART_FOR_R_GEOM[name];
        if (name === "geom_area") appearanceArea = true;
      }
    }
    if (chartType == null) chartType = baseSpec?.chartType;

    // Pass 2: the ggplot(...) chunk's aes(...) mapping.
    let bindings = { ...(baseSpec?.bindings || {}) };
    const ggplotChunk = chunks[0] || "";
    const aesMatch = /aes\s*\(/.exec(ggplotChunk);
    if (aesMatch) {
      const parenStart = ggplotChunk.indexOf("(", aesMatch.index);
      const parenEnd = findCallEnd(ggplotChunk, parenStart);
      const aesArgsText = parenEnd === -1 ? "" : ggplotChunk.slice(parenStart + 1, parenEnd);
      const parsedRoles = {};
      for (const [key, rawValue] of parseArgs(aesArgsText)) {
        if (!key) continue;
        const role = roleForAes(key, chartType);
        if (!role) {
          warnings.push(
            warnFinding("CODE_UNSUPPORTED", `Unrecognized aesthetic "${key}" was ignored.`),
          );
          continue;
        }
        const fieldName = unquote(rawValue);
        if (!schema?.fields?.[fieldName]) {
          errors.push(err("UNKNOWN_FIELD", `"${fieldName}" is not a field in this module.`));
          continue;
        }
        parsedRoles[role] = fieldName;
      }
      // geom_point + a size aes is a bubble chart, not a plain scatter.
      if (chartType === "scatter" && parsedRoles.size) chartType = "bubble";
      bindings = { ...bindings, ...parsedRoles };
    }

    // Pass 3: labs(...), coord_flip(), theme*(...), and unrecognized calls.
    let labels = { ...(baseSpec?.labels || {}) };
    let appearance = { ...(baseSpec?.appearance || {}) };
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];
      const callMatch = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\(([\s\S]*)\)$/.exec(chunk);
      if (!callMatch) {
        errors.push(err("CODE_PARSE_ERROR", `Could not parse "${chunk}".`, lineOf(text, text.indexOf(chunk))));
        continue;
      }
      const [, name, argsText] = callMatch;
      if (CHART_FOR_R_GEOM[name]) continue; // handled in pass 1
      if (name === "labs") {
        for (const [key, rawValue] of parseArgs(argsText)) {
          const value = unquote(rawValue);
          if (key === "title") labels.title = value;
          else if (key === "subtitle") labels.subtitle = value;
          else if (key === "x") labels.xAxis = value;
          else if (key === "y") labels.yAxis = value;
        }
      } else if (name === "coord_flip") {
        appearance.orientation = "horizontal";
      } else if (/^theme/.test(name)) {
        // theme_minimal() and friends — accepted, ignored silently.
      } else {
        warnings.push(
          warnFinding(
            "CODE_UNSUPPORTED",
            `Unrecognized call "${name}(...)" was ignored.`,
            lineOf(text, text.indexOf(chunk)),
          ),
        );
      }
    }

    if (appearanceArea) {
      appearance = { ...appearance, area: true };
      warnings.push(
        warnFinding(
          "CODE_UNSUPPORTED",
          "geom_area() is treated as a line-chart appearance variant (area fill), not a distinct chart type.",
          lineOf(text, text.indexOf("geom_area")),
        ),
      );
    }

    // Data-reference filename check (informational only).
    const csvMatch = /read_csv\(\s*["']([^"']+)["']\s*\)/.exec(text);
    if (csvMatch && chartType) {
      const expected = `${baseSpec?.module || "data"}-${chartType}.csv`;
      if (csvMatch[1] !== expected) {
        warnings.push(
          warnFinding(
            "CODE_DATA_REF_MISMATCH",
            `The data file "${csvMatch[1]}" does not match the expected file "${expected}".`,
          ),
        );
      }
    }

    if (errors.length) {
      return { spec: null, warnings, errors };
    }

    const preset = presetForChartType(chartType);
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
