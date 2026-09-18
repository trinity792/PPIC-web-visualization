/**
 * inlineQuestion.js — v3 authoring helpers for bring-your-own-data.
 *
 * A pasted table has no module behind it, so its v3 question carries the table
 * itself and a role→column mapping inside `question.dataset`:
 *
 *   dataset: { kind: "inline", inline: <typed table>, bindings: { y: "Rate", … } }
 *
 * The roles are the chart registry's own (`requiredRoles`, `optionalRoles`,
 * `roleConstraints`) — the model the standalone tool already used — and
 * `autoMapInlineBindings` still guesses them. What this module adds is the
 * bridge from those bindings to the v3 question: which column is the outcome,
 * which column's distinct values become the comparisons, and which column is
 * the time axis. Everything derived here is recomputed whenever the table,
 * chart type, or a binding changes, so the reader edits the mapping and the
 * question follows.
 *
 * CLIENT-SAFE (no node:fs). `lib/tabular/toObservations.js` reads the same
 * role resolution when it turns the table into observations.
 */

import { getChartType } from "./chartRegistry";
import { FIELD_KINDS } from "./fieldTypes";
import { autoMapInlineBindings, inlineColumnKind } from "./inlineMapping";

/** The typed inline table behind a config, whichever spec version holds it. */
export function inlineTableOf(config) {
  return config?.question?.dataset?.inline ?? config?.data?.inline ?? null;
}

export function isInlineQuestion(spec) {
  return spec?.version === 3 && spec?.question?.dataset?.kind === "inline";
}

/**
 * Which bound column plays which observation part, per chart family.
 *
 *   value       the measure that becomes each observation's `value`
 *   comparison  the column whose distinct values become the comparisons
 *   period      the time axis (`period` on the observation)
 *   category    the categorical axis (`categoryLabel`)
 *   xValue      a second measure plotted on x (scatter, bubble)
 *   size        a measure carried as `sizeValue` (bubble; forest weight)
 *   interval    { start, end, point } measures that expand to several rows
 *               per category (range endpoints; forest bounds and estimate)
 */
export function resolveInlineRoles(chartType, bindings = {}) {
  const b = bindings || {};
  switch (chartType) {
    case "line":
      return { period: b.x, value: b.y, comparison: b.series || b.color };
    case "bar":
      return { category: b.category, value: b.y, comparison: b.group || b.color };
    case "pie":
      return { category: b.category, value: b.y };
    case "heatmap":
      return { period: b.x, category: b.y, value: b.color };
    case "dotPlot":
      return { category: b.y, comparison: b.x, value: b.color };
    case "dumbbell":
    case "forest":
      return {
        category: b.category,
        comparison: b.group,
        // A forest plot needs a centre to hang its whisker from, so without an
        // estimate column the midpoint stands in; a range is only its two ends.
        interval: {
          start: b.start,
          end: b.end,
          point: b.point,
          midpointEstimate: chartType === "forest",
        },
        size: b.size,
      };
    case "scatter":
      return { category: b.unit, comparison: b.color, xValue: b.x, value: b.y };
    case "bubble":
      return { category: b.unit, comparison: b.color, xValue: b.x, value: b.y, size: b.size };
    case "choroplethMap":
      return { geography: b.geography, value: b.color, period: b.period };
    case "symbolMap":
      return { geography: b.geography, value: b.size };
    default:
      // No chart named: accept the observation parts by their own names as
      // well as the common axis roles.
      return {
        period: b.period || b.x,
        value: b.value || b.y || b.color || b.point,
        comparison: b.comparison || b.series || b.group || b.unit,
        category: b.category,
        geography: b.geography || b.location,
      };
  }
}

/** The column that is the question's outcome for this chart, or null. */
export function inlineMeasureColumn(chartType, bindings) {
  const roles = resolveInlineRoles(chartType, bindings);
  return roles.value || roles.interval?.point || roles.interval?.start || null;
}

function columnIndex(table, name) {
  const index = (table?.columns || []).findIndex((column) => column.name === name);
  return index >= 0 ? index : null;
}

/**
 * A period token from a cell. Four-digit years and numeric cells become
 * numbers so the range slider can do arithmetic; anything else ("2020-01",
 * "Q3 2024") stays a string, which the v3 time engine sorts numerically-aware.
 * Truncating to a year here would silently collapse monthly data.
 */
export function periodToken(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (/^\d{4}$/.test(text)) return Number(text);
  return text;
}

function comparePeriods(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Distinct values of one column, in first-seen order. */
export function distinctColumnValues(table, name) {
  const index = columnIndex(table, name);
  if (index == null) return [];
  const seen = new Set();
  for (const row of table.rows || []) {
    const value = row?.[index];
    if (value === null || value === undefined || String(value).trim() === "") continue;
    seen.add(String(value));
  }
  return [...seen];
}

/** The periods the bound time column holds, sorted, or [] when none is bound. */
export function inlinePeriods(table, chartType, bindings) {
  const roles = resolveInlineRoles(chartType, bindings);
  if (!roles.period) return [];
  const index = columnIndex(table, roles.period);
  if (index == null) return [];
  const periods = new Set();
  for (const row of table.rows || []) {
    const token = periodToken(row?.[index]);
    if (token != null) periods.add(token);
  }
  return [...periods].sort(comparePeriods);
}

/**
 * The comparisons a table implies: one per distinct value of the comparison
 * column, or a single "Data" comparison when no column is bound (the label
 * `tableToObservations` gives an unlabelled row). Ids and reader edits (custom
 * label, colour) survive re-derivation by matching on the derived label.
 */
export function deriveInlineComparisons(table, chartType, bindings, previous = []) {
  const roles = resolveInlineRoles(chartType, bindings);
  const labels = roles.comparison ? distinctColumnValues(table, roles.comparison) : [];
  const names = labels.length ? labels : ["Data"];
  return names.map((label, index) => {
    const prior = previous.find((entry) => entry.label === label);
    return {
      id: prior?.id || `cmp_inline_${index + 1}`,
      label,
      dimensions: {},
      customLabel: prior?.customLabel ?? null,
      color: prior?.color ?? null,
    };
  });
}

/** The required roles of this chart the bindings leave unbound or pointing at no column. */
export function unboundInlineRoles(chartType, table, bindings = {}) {
  const chart = getChartType(chartType);
  if (!chart) return [];
  const names = new Set((table?.columns || []).map((column) => column.name));
  return (chart.requiredRoles || []).filter(
    (role) => !bindings[role] || !names.has(bindings[role]),
  );
}

/** Column names of the given field kind, in table order. */
export function columnsOfKind(table, kind) {
  return (table?.columns || [])
    .filter((column) => inlineColumnKind(column.type) === kind)
    .map((column) => column.name);
}

/**
 * Rebuild the derived parts of an inline v3 question from its table, chart type,
 * and bindings: `dataset.bindings`, the outcome, and the comparisons. Time is
 * left to the caller, which knows the chart's accepted contracts.
 */
export function withInlineBindings(spec, table, chartType, bindings) {
  const question = spec.question || {};
  const measureColumn = inlineMeasureColumn(chartType, bindings);
  return {
    ...spec,
    question: {
      ...question,
      dataset: { kind: "inline", inline: table, bindings: { ...bindings } },
      // A pasted number column has no unit catalog; "number" admits every
      // calculation the registry allows for plain counts.
      outcome: measureColumn
        ? { measureId: measureColumn, measureLabel: measureColumn, unit: "number" }
        : {},
      comparisons: deriveInlineComparisons(table, chartType, bindings, question.comparisons || []),
    },
  };
}

/**
 * Best-guess bindings for a chart over a table, keeping any previous binding
 * that still fits. Thin wrapper so the store never imports inlineMapping for
 * the v3 path directly.
 */
export function guessInlineBindings(chartType, table, previous = {}) {
  const chart = getChartType(chartType);
  if (chart && !chart.requiredRoles.length && !chart.optionalRoles.length) {
    // A chart with no roles (the data table) still needs to know which
    // column is the number: take the first of each kind so every row lists
    // as period / comparison / value.
    const first = (kind) => columnsOfKind(table, kind)[0];
    return {
      ...(first(FIELD_KINDS.MEASURE) ? { value: first(FIELD_KINDS.MEASURE) } : {}),
      ...(first(FIELD_KINDS.TEMPORAL) ? { period: first(FIELD_KINDS.TEMPORAL) } : {}),
      ...(first(FIELD_KINDS.DIMENSION) ? { comparison: first(FIELD_KINDS.DIMENSION) } : {}),
    };
  }
  const bindings = autoMapInlineBindings(chartType, table, previous);
  // The auto-map binds an optional role only on a confident name match. For
  // the role that splits rows into comparisons that is too shy: a table with
  // one dimension column left over almost always means "one line per value",
  // and leaving it unbound folds every value into a single zig-zag series.
  const comparisonRole = ["series", "group", "color"].find(
    (role) =>
      chart?.optionalRoles?.includes(role) &&
      (chart.roleConstraints[role] || []).includes(FIELD_KINDS.DIMENSION),
  );
  if (comparisonRole && !bindings[comparisonRole]) {
    const used = new Set(Object.values(bindings));
    const free = columnsOfKind(table, FIELD_KINDS.DIMENSION).filter((name) => !used.has(name));
    if (free.length === 1) bindings[comparisonRole] = free[0];
  }
  return bindings;
}
