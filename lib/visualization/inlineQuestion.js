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

import { normalizeQuestion } from "./questionSpec";
import { getChartType } from "./chartRegistry";
import { FIELD_KINDS } from "./fieldTypes";
import {
  autoMapInlineBindings,
  bindingColumns,
  inlineColumnKind,
  isInlineRoleBound,
} from "./inlineMapping";

export { bindingColumns, isInlineRoleBound };
import { chartableTable, columnParseOptions, parseDateToken } from "../tabular/columnTypes";

/** The typed inline table behind a config, whichever spec version holds it. */
export function inlineTableOf(config) {
  return config?.question?.dataset?.inline ?? config?.data?.inline ?? null;
}

export function isInlineQuestion(spec) {
  return spec?.version === 3 && spec?.question?.dataset?.kind === "inline";
}

/** The first column a binding names, or undefined. */
const firstColumn = (value) => bindingColumns(value)[0];

/**
 * Which bound column plays which observation part, per chart family.
 *
 *   value       the measure that becomes each observation's `value` (the first
 *               of `values` when the chart's value role holds a list)
 *   values      every value column of a value-list role, in mapped order
 *   valuesArePeriods  the value columns are periods, not series (a line chart
 *               of a table with years across the top)
 *   comparison  the column whose distinct values become the comparisons
 *   period      the time axis (`period` on the observation)
 *   category    the categorical axis (`categoryLabel`)
 *   xValue      a second measure plotted on x (scatter, bubble)
 *   size        a bubble size measure (forest weights retain `sizeValue`)
 *   interval    { start, end, point } measures that expand to several rows
 *               per category (range endpoints; forest bounds and estimate)
 */
export function resolveInlineRoles(chartType, bindings = {}) {
  const b = bindings || {};
  const one = (role) => firstColumn(b[role]);
  const listed = (role) => {
    const values = bindingColumns(b[role]);
    return { value: values[0], values };
  };
  switch (chartType) {
    case "line":
      return {
        period: b.valuesArePeriods ? undefined : one("x"),
        ...listed("y"),
        ...(b.valuesArePeriods ? { valuesArePeriods: true } : {}),
        comparison: one("series") || one("color"),
      };
    case "bar":
      return { category: one("category"), ...listed("y"), comparison: one("group") || one("color") };
    case "pie":
      return { category: one("category"), value: one("y") };
    case "heatmap":
      return { period: one("x"), category: one("y"), value: one("color") };
    case "dotPlot":
      return { category: one("y"), comparison: one("x"), ...listed("color") };
    case "dumbbell":
    case "forest":
      return {
        category: one("category"),
        comparison: one("group"),
        // A forest plot needs a centre to hang its whisker from, so without an
        // estimate column the midpoint stands in; a range is only its two ends.
        interval: {
          start: one("start"),
          end: one("end"),
          point: one("point"),
          midpointEstimate: chartType === "forest",
        },
        size: one("size"),
      };
    case "scatter":
      return { category: one("unit"), comparison: one("color"), xValue: one("x"), value: one("y") };
    case "bubble":
      return { category: one("unit"), comparison: one("color"), xValue: one("x"), value: one("y"), size: one("size") };
    case "choroplethMap":
      return { geography: one("geography"), value: one("color"), period: one("period") };
    case "symbolMap":
      return { geography: one("geography"), value: one("size") };
    default:
      // No chart named: accept the observation parts by their own names as
      // well as the common axis roles.
      return {
        period: one("period") || one("x"),
        value: one("value") || one("y") || one("color") || one("point"),
        comparison: one("comparison") || one("series") || one("group") || one("unit"),
        category: one("category"),
        geography: one("geography") || one("location"),
      };
  }
}

/** Every value column a chart draws: the value list, or its one value column. */
export function inlineValueColumns(roles) {
  if (roles.values?.length) return roles.values;
  return roles.value ? [roles.value] : [];
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

/** A period's decimal-year position under its column's reading, or null. */
function periodPosition(token, column) {
  if (typeof token === "number") return token;
  return parseDateToken(token, columnParseOptions(column))?.position ?? null;
}

/** Time order: by position where both have one ("Jan 2020" before "Feb 2020"). */
function comparePeriodsIn(column) {
  return (a, b) => {
    const left = periodPosition(a, column);
    const right = periodPosition(b, column);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  };
}

/** Distinct values of one column, in first-seen order. */
export function distinctColumnValues(input, name) {
  const table = chartableTable(input);
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
export function inlinePeriods(input, chartType, bindings) {
  const table = chartableTable(input);
  const roles = resolveInlineRoles(chartType, bindings);
  // Years across the top: the value columns' headers are the periods.
  if (roles.valuesArePeriods) {
    const headers = roles.values.map((name) => periodToken(name)).filter((token) => token != null);
    return [...new Set(headers)].sort(comparePeriodsIn({}));
  }
  if (!roles.period) return [];
  const index = columnIndex(table, roles.period);
  if (index == null) return [];
  const periods = new Set();
  for (const row of table.rows || []) {
    const token = periodToken(row?.[index]);
    if (token != null) periods.add(token);
  }
  return [...periods].sort(comparePeriodsIn(table.columns[index]));
}

/**
 * The comparisons a table implies (each one series on the chart):
 *
 *   - one per distinct value of the comparison column;
 *   - with several value columns and no comparison column, one per value
 *     column, labelled by the column (it records `valueColumn`);
 *   - with both, one per pair ("Britain - I typically tip");
 *   - with neither, a single comparison named after the value column.
 *
 * When the value columns are periods (years across the top), they never make
 * series: the comparison column alone does. Ids and reader edits (custom
 * label, colour) survive re-derivation by matching on the derived label; a
 * new comparison takes the first `cmp_inline_n` id no kept comparison holds.
 */
export function deriveInlineComparisons(table, chartType, bindings, previous = []) {
  const roles = resolveInlineRoles(chartType, bindings);
  const labels = roles.comparison ? distinctColumnValues(table, roles.comparison) : [];
  const values = roles.valuesArePeriods ? [] : inlineValueColumns(roles);
  let entries;
  if (values.length > 1) {
    entries = labels.length
      ? labels.flatMap((label) => values.map((column) => ({ label: `${label} - ${column}`, valueColumn: column })))
      : values.map((column) => ({ label: column, valueColumn: column }));
  } else {
    const names = labels.length ? labels : [values[0] || roles.value || "Data"];
    entries = names.map((label) => ({ label }));
  }

  const priors = entries.map((entry) => previous.find((prior) => prior.label === entry.label));
  const used = new Set(priors.filter(Boolean).map((prior) => prior.id));
  const freshId = (index) => {
    let n = index + 1;
    while (used.has(`cmp_inline_${n}`)) n += 1;
    used.add(`cmp_inline_${n}`);
    return `cmp_inline_${n}`;
  };
  return entries.map((entry, index) => {
    const prior = priors[index];
    return {
      id: prior?.id || freshId(index),
      label: entry.label,
      ...(entry.valueColumn ? { valueColumn: entry.valueColumn } : {}),
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
  const names = new Set((table?.columns || []).filter((column) => !column.ignored).map((column) => column.name));
  return (chart.requiredRoles || []).filter(
    (role) => !isInlineRoleBound(role, bindings, names, chartType),
  );
}

/** Column names of the given field kind, in table order. */
export function columnsOfKind(table, kind) {
  return (table?.columns || [])
    .filter((column) => !column.ignored && inlineColumnKind(column.type) === kind)
    .map((column) => column.name);
}

/**
 * A pasted column's unit from its profile ("percent", "usd", or "number").
 * A pasted column has no unit catalog, so its profile is what admits or
 * blocks a calculation (a percent cannot be indexed).
 */
function columnUnit(table, name) {
  const column = (table?.columns || []).find((entry) => entry.name === name);
  return column?.unit || "number";
}

/**
 * Rebuild the derived parts of an inline v3 question from its table, chart type,
 * and bindings: `dataset.bindings`, the outcome, and the comparisons. Time is
 * left to the caller, which knows the chart's accepted contracts.
 */
export function withInlineBindings(spec, table, chartType, bindings) {
  const question = normalizeQuestion(spec).question;
  const measureColumn = inlineMeasureColumn(chartType, bindings);
  return {
    ...spec,
    question: {
      ...question,
      dataset: { kind: "inline", inline: table, bindings: { ...bindings } },
      outcomes: [
        ...(measureColumn ? [{ role: "y", measureId: measureColumn, measureLabel: measureColumn, unit: columnUnit(table, measureColumn) }] : []),
        ...(["scatter", "bubble"].includes(chartType) && bindings.x ? [{ role: "x", measureId: bindings.x, unit: columnUnit(table, bindings.x) }] : []),
        ...(chartType === "bubble" && bindings.size ? [{ role: "size", measureId: bindings.size, unit: columnUnit(table, bindings.size) }] : []),
      ],
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
  // A value list survives only on a chart whose value role takes one, and only
  // the columns this table still has. Elsewhere a list's first column is the
  // previous choice, so switching from a wide bar to a pie keeps its measure.
  const listRole = chart?.multiValueRole;
  const names = new Set((table?.columns || []).map((column) => column.name));
  const previousList = listRole ? bindingColumns(previous[listRole]).filter((name) => names.has(name)) : [];
  const single = Object.fromEntries(
    Object.entries(previous || {})
      .filter(([role]) => role !== "valuesArePeriods")
      .map(([role, value]) => [role, Array.isArray(value) ? firstColumn(value) : value]),
  );
  if (listRole && previousList.length > 1) delete single[listRole];
  const bindings = autoMapInlineBindings(chartType, table, single);
  if (listRole && previousList.length > 1) {
    for (const [role, column] of Object.entries(bindings)) {
      if (previousList.includes(column)) delete bindings[role];
    }
    bindings[listRole] = previousList;
  } else if (listRole && Array.isArray(previous?.[listRole]) && bindings[listRole]) {
    bindings[listRole] = [bindings[listRole]];
  }
  if (chartType === "line" && previous?.valuesArePeriods && Array.isArray(bindings.y)) {
    bindings.valuesArePeriods = true;
    delete bindings.x;
  }
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
    const used = new Set(Object.values(bindings).flatMap(bindingColumns));
    const free = columnsOfKind(table, FIELD_KINDS.DIMENSION).filter((name) => !used.has(name));
    if (free.length === 1) bindings[comparisonRole] = free[0];
  }
  // A wide line table (no column left to split series by) draws every number
  // column as its own line.
  if (chartType === "line" && !bindings.series && !bindings.color && !Array.isArray(bindings.y)) {
    const used = new Set(Object.entries(bindings).filter(([role]) => role !== "y").flatMap(([, value]) => bindingColumns(value)));
    const numbers = columnsOfKind(table, FIELD_KINDS.MEASURE).filter((name) => !used.has(name));
    if (numbers.length) bindings.y = numbers;
  }
  return bindings;
}
