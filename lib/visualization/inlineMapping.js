/**
 * inlineMapping.js — turn a bring-your-own-data table's columns into bindable
 * fields and auto-guess role bindings for them.
 *
 * Only the standalone Visualization Tool (the `byod` schema, `inlineOnly`) uses
 * this: its schema has no field catalog, so the pasted/uploaded columns ARE the
 * fields. Registered modules keep their own curated catalog and never route
 * through here (their pipeline data is the source of truth).
 *
 * CLIENT-SAFE (no node:fs).
 */

import { getChartType } from "./chartRegistry";
import { FIELD_KINDS } from "./fieldTypes";
import { COLUMN_TYPES, parseDateToken } from "../tabular/columnTypes";

const { TEMPORAL, DIMENSION, MEASURE } = FIELD_KINDS;

// Plain-language noun for each field kind, for user-facing "needs a ___ column"
// messages (the internal kind words — "temporal"/"measure" — mean nothing to a
// researcher pasting a table).
const KIND_NOUN = Object.freeze({
  [TEMPORAL]: "date",
  [MEASURE]: "number",
  [DIMENSION]: "category",
});

/** Inline column type (from tableChecker) → schema field kind. */
export function inlineColumnKind(type) {
  if (type === "number") return MEASURE;
  if (type === "date") return TEMPORAL;
  return DIMENSION;
}

/**
 * A schema-style `fields` map built from an inline table's columns, so the
 * encoding UI, auto-map, and label derivation can treat pasted columns exactly
 * like a module's catalog fields. The column name is both the key and label.
 */
export function inlineFields(table) {
  const entries = (table?.columns || []).map((column) => [
    column.name,
    { kind: inlineColumnKind(column.type), label: column.name },
  ]);
  return Object.fromEntries(entries);
}

// Normalized-name synonyms per role. Column names are lowercased and stripped of
// non-alphanumerics before matching, so "Lower Bound", "lower_bound", and
// "ci_low" all collapse toward the same tokens. Tuned for the R / Stata / Excel
// exports researchers usually paste.
const ROLE_SYNONYMS = {
  x: ["x", "year", "date", "time", "period", "month", "quarter", "day", "wave"],
  y: [
    "y", "value", "estimate", "pointestimate", "mean", "median", "average", "avg",
    "amount", "total", "count", "score", "rate", "percent", "pct", "share",
  ],
  category: [
    "category", "cat", "group", "name", "label", "type", "class", "segment",
    "occupation", "sector", "industry", "region", "location", "area", "state", "county",
    "study", "author", "trial", "cohort",
  ],
  group: ["group", "series", "class", "type", "cohort", "sex", "gender", "race", "age", "arm"],
  series: ["series", "group", "name", "label", "cohort", "sex", "gender", "race", "line"],
  color: ["color", "colour", "group", "series", "class", "fill"],
  start: [
    "start", "lower", "lowerbound", "low", "min", "cilow", "cilower", "l95",
    "lcl", "from", "begin", "before", "baseline",
  ],
  end: [
    "end", "upper", "upperbound", "high", "max", "cihigh", "ciupper", "u95",
    "ucl", "to", "finish", "after", "current",
  ],
  point: [
    "point", "pointestimate", "estimate", "mean", "median", "mid", "middle",
    "central", "center", "value",
  ],
  size: ["size", "weight", "magnitude", "count", "population", "pop", "volume", "n"],
  geography: [
    "geography", "geo", "state", "county", "region", "fips", "geoid",
    "location", "area", "place", "zip", "tract",
  ],
  unit: ["unit", "id", "name", "observation", "obs", "entity"],
  period: ["period", "year", "date", "time", "month", "quarter", "wave"],
};

/**
 * A sensible default chart type for a freshly imported table, from its column
 * mix. Lets the standalone tool land on something renderable instead of always
 * defaulting to a line chart that most pasted tables can't satisfy.
 */
export function suggestChartType(table) {
  const columns = table?.columns || [];
  const kinds = columns.map((column) => inlineColumnKind(column.type));
  const measures = kinds.filter((k) => k === MEASURE).length;
  const temporal = kinds.filter((k) => k === TEMPORAL).length;
  const dimensions = kinds.filter((k) => k === DIMENSION).length;

  if (temporal >= 1 && measures >= 1) return "line";
  if (dimensions >= 2 && measures >= 1) return "dotPlot";
  if (dimensions >= 1 && measures >= 2) return "dumbbell"; // range (e.g. low/high)
  if (dimensions >= 1 && measures >= 1) return "bar";
  if (measures >= 2) return "scatter";
  return "bar";
}

/** "col a", "col a and col b", or "col a, col b, and col c" — Oxford-comma join. */
function joinNames(names) {
  const quoted = names.map((name) => `“${name}”`);
  if (quoted.length <= 1) return quoted.join("");
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted[quoted.length - 1]}`;
}

/** "year (date), Coal (number), region (category)" — columns and their kinds. */
function describeColumns(columns) {
  return columns
    .map((column) => `“${column.name}” (${KIND_NOUN[inlineColumnKind(column.type)]})`)
    .join(", ");
}

/**
 * Columns that AREN'T typed as dates but whose values overwhelmingly parse as
 * dates — the likeliest "you meant this to be the time axis" fix when a chart
 * needs a temporal column but has none. A column of bare 4-digit years is the
 * classic case: every value parses as both a number and a date, so
 * inferColumnType's tie resolves to text (never guess numeric), and the column
 * arrives here as text rather than date. Returns the column names, so the
 * render-block message can name the fix precisely.
 */
function temporalCandidates(table) {
  const rows = table?.rows || [];
  return (table?.columns || [])
    .map((column, index) => ({ column, index }))
    .filter(({ column, index }) => {
      if (column.type === COLUMN_TYPES.DATE) return false;
      const values = rows
        .map((row) => row?.[index])
        .filter((value) => value != null && String(value).trim() !== "");
      if (!values.length) return false;
      const dateLike = values.filter((value) => parseDateToken(value) !== null).length;
      return dateLike / values.length >= 0.8;
    })
    .map(({ column }) => column.name);
}

/**
 * Why an inline chart can't render yet, or null if it can. Distinguishes
 * "just needs mapping" from "truly incompatible" (a required role has no column
 * of an acceptable kind — e.g. a line chart with no time column).
 *
 * The incompatible message names the exact shortfall: which kind of column the
 * chart needs, what columns you actually have (with detected types), and — when
 * a column looks like dates but was typed as text/number (a pasted year column
 * is the usual culprit) — the one-click fix of retyping it in the data editor.
 *
 * @returns {{ incompatible: boolean, message: string, suggestion?: string } | null}
 */
export function inlineRenderBlock(chartType, table, bindings = {}) {
  const chart = getChartType(chartType);
  if (!chart) return null;
  const columns = table?.columns || [];
  const names = new Set(columns.map((column) => column.name));
  const required = chart.requiredRoles || [];
  const unbound = required.filter((role) => !bindings[role] || !names.has(bindings[role]));
  if (!unbound.length) return null;

  const unfillable = unbound.filter((role) => {
    const accepted = chart.roleConstraints[role] || [];
    return accepted.length && !columns.some((c) => accepted.includes(inlineColumnKind(c.type)));
  });
  const quote = (roles) => roles.map((role) => `"${role}"`).join(", ");

  if (unfillable.length) {
    const kinds = [...new Set(unfillable.flatMap((role) => chart.roleConstraints[role] || []))];
    const kindLabel = kinds.map((kind) => KIND_NOUN[kind] || kind).join(" or ");
    const message =
      `A ${chart.label} chart needs a ${kindLabel} column for ${quote(unfillable)}, ` +
      `but your data has none. Your columns: ${describeColumns(columns)}.`;

    // When the shortfall is a time axis, a mistyped date column is fixable in
    // place — much better advice than "pick a different chart type."
    const candidates = kinds.includes(TEMPORAL) ? temporalCandidates(table) : [];
    if (candidates.length) {
      const plural = candidates.length > 1;
      return {
        incompatible: true,
        message,
        suggestion:
          `${joinNames(candidates)} look${plural ? "" : "s"} like dates but ${
            plural ? "are" : "is"
          } typed as text. In the data editor, set ${
            plural ? "one of their column types" : "its column type"
          } to “Date” to use it as the time axis — no need to change chart type.`,
      };
    }

    return {
      incompatible: true,
      message,
      suggestion: "Pick a different chart type, or add a column of the required kind.",
    };
  }
  return {
    incompatible: false,
    message: `To draw a ${chart.label} chart, map ${quote(
      unbound,
    )} to your columns using “Map your columns.”`,
  };
}

const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** A column matches a role by name if it equals or contains a (3+ char) synonym. */
function nameMatches(columnNorm, role) {
  const synonyms = ROLE_SYNONYMS[role] || [];
  return synonyms.some((syn) => columnNorm === syn || (syn.length >= 3 && columnNorm.includes(syn)));
}

/**
 * Best-guess bindings for a chart type over an inline table. Preserves any of
 * `previous` that still name a column of an accepted kind, then fills the rest:
 * required roles by name-synonym → first column of an accepted kind; optional
 * roles only when a name synonym matches (so we don't over-bind). Each column is
 * used at most once, so distinct roles (start/end, x/y) get distinct columns.
 *
 * @returns {Object} bindings map (role → column name)
 */
export function autoMapInlineBindings(chartType, table, previous = {}) {
  const chart = getChartType(chartType);
  if (!chart || !table?.columns?.length) return { ...previous };

  const columns = table.columns.map((column) => ({
    name: column.name,
    kind: inlineColumnKind(column.type),
    norm: norm(column.name),
  }));
  const roles = [...chart.requiredRoles, ...chart.optionalRoles];
  const bindings = {};
  const used = new Set();
  const acceptsKind = (role, kind) => {
    const accepted = chart.roleConstraints[role] || [];
    return !accepted.length || accepted.includes(kind);
  };

  // Pass 1: keep still-valid previous bindings.
  for (const role of roles) {
    const prev = previous[role];
    const col = prev && columns.find((c) => c.name === prev);
    if (col && acceptsKind(role, col.kind) && !used.has(col.name)) {
      bindings[role] = col.name;
      used.add(col.name);
    }
  }

  // Pass 2: fill the remaining roles.
  for (const role of roles) {
    if (bindings[role]) continue;
    const pool = columns.filter((c) => acceptsKind(role, c.kind) && !used.has(c.name));
    if (!pool.length) continue;
    const byName = pool.find((c) => nameMatches(c.norm, role));
    const required = chart.requiredRoles.includes(role);
    // Required roles fall back to the first fitting column; optional roles are
    // only auto-filled on a confident name match.
    const pick = byName || (required ? pool[0] : null);
    if (!pick) continue;
    bindings[role] = pick.name;
    used.add(pick.name);
  }

  return bindings;
}
