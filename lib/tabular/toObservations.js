/**
 * toObservations.js — turn a typed bring-your-own-data table into the same
 * status-aware observations the module adapters return, and execute an inline
 * v3 question locally with the shared calculation registry.
 *
 * Bring-your-own-data has no server dataset, so the execution location differs
 * from a module route but nothing else does: the formula, the status rules,
 * and the response shape are the ones in `lib/data/visualization/`. This file
 * must not grow a second formula implementation.
 *
 * Which column plays which part is decided per chart family by
 * `resolveInlineRoles` (lib/visualization/inlineQuestion.js). Most charts map
 * one column each to value, comparison, period, and category. Three families
 * need more, and the v3 adapters already read it:
 *
 *   - Range and forest plots expand one table row into several observations
 *     per category, tagged with `measureRole` (a range's two endpoints; a
 *     forest plot's estimate, lower bound, and upper bound).
 *   - Scatter and bubble emit one row per role, with independent statuses.
 *     Forest weights retain `sizeValue`.
 */

import {
  cellToken,
  chartableTable,
  columnParseOptions,
  parseDateToken,
  parseNumber,
} from "@/lib/tabular/columnTypes";
import { outcomeFor } from "@/lib/visualization/questionSpec";
import {
  ISSUE_LEVELS,
  OBSERVATION_STATUS,
  VALUE_KINDS,
  createIssue,
} from "@/lib/visualization/observationContract";
import {
  CALCULATION_IDS,
  applyCalculation,
  getCalculation,
  isCalculationAllowed,
} from "@/lib/data/visualization/calculationRegistry";
import { calculationParamsFor } from "@/lib/data/visualization/executeQuestion";
import { rankObservations, rankOutcomeObservations } from "@/lib/data/visualization/rankObservations";
import {
  bindingColumns,
  inlineValueColumns,
  periodToken,
  resolveInlineRoles,
} from "@/lib/visualization/inlineQuestion";

/**
 * One cell read as a value: its number under the column's own separator
 * convention, and a status that tells a withheld value ("(D)", "*") from a
 * missing one ("n/a", blank). Text that is not a number is missing.
 */
function readCell(raw, column) {
  if (typeof raw === "number") {
    return Number.isFinite(raw)
      ? { value: raw, status: OBSERVATION_STATUS.AVAILABLE }
      : { value: null, status: OBSERVATION_STATUS.MISSING };
  }
  const token = cellToken(raw);
  if (token) {
    return {
      value: null,
      status: token === "suppressed" ? OBSERVATION_STATUS.SUPPRESSED : OBSERVATION_STATUS.MISSING,
    };
  }
  const value = parseNumber(raw, columnParseOptions(column).locale);
  return value === null
    ? { value: null, status: OBSERVATION_STATUS.MISSING }
    : { value, status: OBSERVATION_STATUS.AVAILABLE };
}

/** A period cell's place on a decimal-year scale, or null when it has none. */
function periodPositionOf(raw, column) {
  const token = periodToken(raw);
  if (typeof token === "number") return token;
  if (token == null) return null;
  return parseDateToken(token, columnParseOptions(column))?.position ?? null;
}

/**
 * The number format a pasted value column asks for (dataset-range plan,
 * workstream 3). Only pasted rows carry it, so topic charts' axes never change.
 */
function columnFormatOf(column) {
  return column?.type === "number" && column.unit
    ? { unit: column.unit, decimals: Number.isFinite(column.decimals) ? column.decimals : 0 }
    : null;
}

function text(value) {
  return value === null || value === undefined ? null : String(value);
}

/**
 * Convert a typed inline table to the same base observations module adapters
 * return. `bindings` are role → column name; pass `chartType` so the chart's
 * own roles (x/y/category/start/end/…) resolve, or use the observation-part
 * names directly (period/value/comparison/category) for a chart-agnostic call.
 */
export function tableToObservations(
  table,
  { bindings = {}, measure, source = "Inline data", comparisons = [], chartType } = {},
) {
  // Ignored columns and marked rows stay in the grid, not on the chart.
  table = chartableTable(table);
  const columns = (table?.columns || []).map((column) => column.name);
  const index = Object.fromEntries(columns.map((name, position) => [name, position]));
  const columnByName = new Map((table?.columns || []).map((column) => [column.name, column]));
  const at = (cells, name) => (name != null && name in index ? cells[index[name]] : undefined);
  const read = (cells, name) => readCell(at(cells, name), columnByName.get(name));
  const roles = resolveInlineRoles(chartType, bindings);
  const comparisonIds = new Map();
  // A source line found under the pasted table is cited in its place.
  const rowSource = table?.meta?.source || source;
  const valueColumn = columnByName.get(roles.value);
  const valueFormat = columnFormatOf(valueColumn);

  const base = (cells, label) => {
    const geography = at(cells, roles.geography) ?? label;
    const category = at(cells, roles.category) ?? null;
    const periodPosition = roles.period
      ? periodPositionOf(at(cells, roles.period), columnByName.get(roles.period))
      : null;
    return {
      comparisonId: comparisonIds.get(label),
      comparisonLabel: label,
      measureId: measure.id,
      measureLabel: measure.label || measure.id,
      unit: valueFormat?.unit || measure.unit || "number",
      period: periodToken(at(cells, roles.period)),
      ...(Number.isFinite(periodPosition) ? { periodPosition } : {}),
      ...(valueFormat ? { columnFormat: valueFormat } : {}),
      geographyId: String(geography),
      geographyLabel: String(geography),
      categoryId: text(category),
      categoryLabel: text(category),
      valueKind: VALUE_KINDS.OBSERVED,
      calculation: { id: "actual", params: {} },
      includedPeriods: null,
      source: rowSource,
    };
  };
  const withValue = (row, reading) => ({ ...row, value: reading.value, status: reading.status });
  const available = (value) => ({
    value,
    status: value === null ? OBSERVATION_STATUS.MISSING : OBSERVATION_STATUS.AVAILABLE,
  });

  const ensureComparison = (label) => {
    if (comparisonIds.has(label)) return;
    const declared =
      comparisons.find(
        (comparison) => comparison.customLabel === label || comparison.label === label,
      ) || comparisons[comparisonIds.size];
    comparisonIds.set(label, declared?.id || `cmp_inline_${comparisonIds.size + 1}`);
  };
  // One value column (the dataset-range plan, workstream 4): the column's own
  // row, read from the column it names.
  const ownColumn = (row, column) => {
    const format = columnFormatOf(columnByName.get(column));
    const own = { ...row, measureId: column, measureLabel: column, unit: format?.unit || "number" };
    delete own.columnFormat;
    return format ? { ...own, columnFormat: format } : own;
  };
  const valueColumns = inlineValueColumns(roles);
  // With no comparison column, the lone series is named after what it shows.
  const loneLabel = valueColumns.length === 1 ? valueColumns[0] : "Data";

  const observations = [];
  for (const cells of table?.rows || []) {
    const comparisonCell = at(cells, roles.comparison);

    // Years across the top: each value column is a period of one series per
    // comparison value, not a series of its own.
    if (roles.valuesArePeriods) {
      const label = String(comparisonCell ?? "Data");
      ensureComparison(label);
      for (const column of valueColumns) {
        const position = periodPositionOf(column, {});
        const row = { ...ownColumn(base(cells, label), column), measureId: "Value", measureLabel: "Value" };
        delete row.periodPosition;
        observations.push(withValue({
          ...row,
          period: periodToken(column),
          ...(Number.isFinite(position) ? { periodPosition: position } : {}),
        }, read(cells, column)));
      }
      continue;
    }
    // Several value columns: each is its own series, paired with the
    // comparison value when a comparison column is mapped too.
    if (valueColumns.length > 1) {
      for (const column of valueColumns) {
        const label = comparisonCell != null && String(comparisonCell).trim() !== ""
          ? `${comparisonCell} - ${column}`
          : column;
        ensureComparison(label);
        observations.push(withValue(ownColumn(base(cells, label), column), read(cells, column)));
      }
      continue;
    }

    const label = String(comparisonCell ?? loneLabel);
    ensureComparison(label);
    const row = base(cells, label);
    if (["scatter", "bubble"].includes(chartType)) {
      for (const [role, column] of [["y", roles.value], ["x", roles.xValue], ["size", roles.size]]) {
        if (!column) continue;
        const format = columnFormatOf(columnByName.get(column));
        // Each role's rows carry that role's own column format, not the y column's.
        const shared = { ...row };
        delete shared.columnFormat;
        observations.push(withValue({ ...shared, measureId: column, measureLabel: column,
          ...(format ? { columnFormat: format } : {}),
          ...(role !== "y" ? { measureRole: role, unit: format?.unit || "number" } : {}),
        }, read(cells, column)));
      }
      continue;
    }
    const sizeValue = roles.size ? read(cells, roles.size).value : undefined;
    const extras = {
      ...(roles.xValue ? { xValue: read(cells, roles.xValue).value } : {}),
      ...(sizeValue !== undefined ? { sizeValue } : {}),
    };

    if (roles.interval) {
      // One table row is a span: its endpoints (and a forest plot's estimate)
      // become sibling observations the adapter reassembles per category. The
      // endpoint's own column name stands in for a period so the table and
      // export can still say which number is which.
      const missing = available(null);
      const lower = roles.interval.start ? read(cells, roles.interval.start) : missing;
      const upper = roles.interval.end ? read(cells, roles.interval.end) : missing;
      // No estimate column: the whisker still needs a centre to hang from, so
      // the midpoint stands in (a symmetric interval's own point estimate).
      const estimate = roles.interval.point
        ? read(cells, roles.interval.point)
        : roles.interval.midpointEstimate && lower.value !== null && upper.value !== null
          ? available((lower.value + upper.value) / 2)
          : missing;
      const parts = [
        ["estimate", roles.interval.point || "estimate", estimate, Boolean(roles.interval.point) || estimate.value !== null],
        ["lowerBound", roles.interval.start, lower, Boolean(roles.interval.start)],
        ["upperBound", roles.interval.end, upper, Boolean(roles.interval.end)],
      ];
      for (const [measureRole, column, reading, bound] of parts) {
        if (!bound) continue;
        observations.push({
          ...withValue(row, reading),
          period: row.period ?? column,
          measureRole,
          ...extras,
        });
      }
      continue;
    }

    observations.push({ ...withValue(row, read(cells, roles.value)), ...extras });
  }
  return observations;
}

/**
 * Periods in time order: by their decimal-year position where the rows have
 * one ("Jan 2020" before "Feb 2020"), else numerically, else as text.
 */
function periodComparer(positions = new Map()) {
  return (a, b) => {
    const left = positions.get(String(a));
    const right = positions.get(String(b));
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  };
}

function requestedPeriods(time, available, comparePeriods) {
  const ordered = [...new Set(available)].sort(comparePeriods);
  if (!time || time.contract === "none") return time?.contract === "none" ? [null] : ordered;
  if (time.contract === "snapshot") return [time.year ?? ordered.at(-1)];
  if (time.contract === "selectedSnapshots") return time.years || time.periods || [];
  if (time.contract === "twoPeriods") return [time.startYear, time.endYear];
  if (time.contract === "range" || time.contract === "orderedSequence") {
    const start = time.startYear ?? ordered[0];
    const end = time.endYear ?? ordered.at(-1);
    return ordered.filter(
      (period) => comparePeriods(period, start) >= 0 && comparePeriods(period, end) <= 0,
    );
  }
  return ordered;
}

/**
 * The calculations a pasted column's unit allows. A pasted column has no
 * catalog entry to declare them, so its unit decides: a percent cannot be
 * indexed or turned into a percent change, while a count or dollar amount can
 * (the registry's own unit lists). Only pasted data is gated this way.
 */
function calculationsForUnit(unit) {
  const percentLike = /percent|rate/i.test(unit || "");
  return CALCULATION_IDS.filter((id) => {
    const units = getCalculation(id)?.units || [];
    if (!units.length) return true;
    return percentLike ? units.some((entry) => /percent|rate/i.test(entry)) : units.includes("number");
  });
}

const UNIT_WORDS = Object.freeze({ percent: "a percent", usd: "dollars", number: "a plain number" });
// Above this many series, one chart is hard to read; tabs show them a few at a time.
const MANY_SERIES = 12;
// What one place on each chart is called, for the shared-rows warning.
const PLACE_NOUNS = Object.freeze({
  line: ["point", "points"],
  bar: ["bar", "bars"],
  pie: ["slice", "slices"],
  heatmap: ["cell", "cells"],
  dotPlot: ["dot", "dots"],
  dumbbell: ["range", "ranges"],
  forest: ["estimate", "estimates"],
});

function quoteNames(names) {
  const quoted = names.map((name) => `“${name}”`);
  if (quoted.length <= 1) return quoted.join("");
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted.at(-1)}`;
}

/**
 * Rows of a pasted table that land on the same place of the chart, because
 * they share every mapped column (dataset-range plan, workstream 6). Warn
 * only: the chart still draws every row, and the warning names the label
 * columns the mapping leaves out that tell those rows apart.
 */
function sharedPlaceIssue(table, chartType, roles, bindings) {
  const nouns = PLACE_NOUNS[chartType];
  if (!nouns || !table?.rows?.length) return null;
  const index = new Map((table.columns || []).map((column, position) => [column.name, position]));
  const keyColumns = [roles.comparison, roles.category, roles.geography, roles.period]
    .filter((name) => name && index.has(name));
  const groups = new Map();
  table.rows.forEach((row, position) => {
    const key = JSON.stringify(keyColumns.map((name) => String(row?.[index.get(name)] ?? "").trim()));
    groups.set(key, [...(groups.get(key) || []), position]);
  });
  const shared = [...groups.values()].filter((rows) => rows.length > 1);
  if (!shared.length) return null;

  const mapped = new Set(
    Object.entries(bindings || {})
      .filter(([role]) => role !== "valuesArePeriods")
      .flatMap(([, value]) => bindingColumns(value)),
  );
  const unmapped = (table.columns || [])
    .filter((column) => !mapped.has(column.name) && ["text", "group", "date"].includes(column.type))
    .filter((column) =>
      shared.some((rows) => new Set(rows.map((row) => table.rows[row]?.[index.get(column.name)])).size > 1),
    )
    .map((column) => column.name);
  const rowCount = shared.reduce((total, rows) => total + rows.length, 0);
  const noun = shared.length === 1 ? nouns[0] : nouns[1];
  const lead = `${rowCount} rows share ${shared.length} ${noun}`;
  const message = unmapped.length
    ? `${lead} because ${quoteNames(unmapped)} ${unmapped.length === 1 ? "is" : "are"} not mapped. ` +
      `Map ${unmapped.length === 1 ? "it" : "them"} to a role, or remove rows in the table so each one has a single row.`
    : `${lead}. Map another column to a role, or remove rows in the table so each one has a single row.`;
  // "warning" is the pasted-data tool's own level, beside the contract's three
  // (blocking, comparison, information): the chart draws, but probably not as
  // the reader meant. The preview exposes this diagnostic in Advanced Mode.
  return { code: "inlineRowsShareMapping", level: "warning", message, comparisonId: null, columns: unmapped };
}

/** Notices about the value columns themselves: mixed units, and too many series. */
function valueColumnNotices(table, roles, base) {
  const columns = roles.valuesArePeriods ? [] : inlineValueColumns(roles);
  if (columns.length < 2) return [];
  const unitOf = (name) => (table.columns || []).find((column) => column.name === name)?.unit || "number";
  const notices = [];
  const firstUnit = unitOf(columns[0]);
  const others = columns.slice(1).filter((name) => unitOf(name) !== firstUnit);
  if (others.length) {
    notices.push(createIssue({
      code: "inlineMixedUnits",
      level: ISSUE_LEVELS.INFORMATION,
      columns: others,
      message: `The value axis is formatted as ${UNIT_WORDS[firstUnit] || firstUnit}, like “${columns[0]}”; ` +
        `${others.map((name) => `“${name}” is ${UNIT_WORDS[unitOf(name)] || unitOf(name)}`).join(", ")}.`,
    }));
  }
  const series = new Set(base.map((row) => row.comparisonId)).size;
  if (series > MANY_SERIES) {
    notices.push(createIssue({
      code: "inlineManySeries",
      level: ISSUE_LEVELS.INFORMATION,
      message: `This chart draws ${series} series, which is hard to read at once. Show them as tabs to see a few at a time.`,
    }));
  }
  return notices;
}

const blocked = (code, message) => ({
  status: "blocked",
  observations: [],
  comparisons: [],
  periods: [],
  issues: [{ code, level: "blocking", comparisonId: null, message }],
});

/** Execute an inline v3 question with the same calculation functions as module routes. */
export function executeInlineQuestion(spec) {
  const question = spec?.question || {};
  const table = question.dataset?.inline;
  const chartType = spec?.presentation?.chartType;
  const bindings = question.dataset?.bindings || spec?.presentation?.bindings || {};
  const roles = resolveInlineRoles(chartType, bindings);
  const measureId =
    outcomeFor(question)?.measureId || roles.value || roles.interval?.point || roles.interval?.start;
  if (!table || !measureId) {
    return blocked(
      "inlineQuestionIncomplete",
      "Import data and select an outcome before you build the chart.",
    );
  }
  const measure = {
    id: measureId,
    label: outcomeFor(question)?.measureLabel || measureId,
    unit: outcomeFor(question)?.unit || "number",
    aggregation: outcomeFor(question)?.aggregation || "notAllowed",
    calculations: outcomeFor(question)?.calculations || calculationsForUnit(outcomeFor(question)?.unit),
  };
  const calculationId = question.calculation?.id || "actual";
  // Every value column's unit must allow the calculation, not only the first's.
  const valueUnits = inlineValueColumns(roles).map(
    (name) => (table.columns || []).find((column) => column.name === name)?.unit || "number",
  );
  const unitsAllow = valueUnits.every((unit) =>
    isCalculationAllowed(calculationId, { ...measure, unit, calculations: calculationsForUnit(unit) }),
  );
  if (!isCalculationAllowed(calculationId, measure) || !unitsAllow) {
    return blocked(
      "calculationNotAllowedForUnit",
      "This calculation is not available for the selected outcome.",
    );
  }
  const base = tableToObservations(table, {
    bindings,
    measure,
    chartType,
    comparisons: question.comparisons || [],
  });
  // Charts with no time axis (a bar of categories, a range) read every row;
  // only a bound period column is filtered by the time contract.
  const hasPeriods = base.some((row) => row.period != null) && Boolean(roles.period || roles.valuesArePeriods);
  const comparePeriods = periodComparer(
    new Map(base.filter((row) => Number.isFinite(row.periodPosition)).map((row) => [String(row.period), row.periodPosition])),
  );
  const periods = hasPeriods
    ? requestedPeriods(question.time, base.map((row) => row.period), comparePeriods)
    : [null];
  const filtered = hasPeriods
    ? base.filter((row) => periods.includes(row.period))
    : base;
  const ids = [
    ...new Set([
      ...(question.comparisons || []).map((comparison) => comparison.id),
      ...filtered.map((row) => row.comparisonId),
    ]),
  ];
  const observations = [];
  const issues = [];
  const summaries = [];
  const calculation = question.calculation || { id: "actual", params: {} };
  const timeContract = question.time?.contract;
  const params = calculationParamsFor(
    calculation,
    hasPeriods ? periods : [],
    timeContract,
  );
  for (const id of ids) {
    const rows = filtered.filter((row) => row.comparisonId === id);
    const declared = (question.comparisons || []).find((comparison) => comparison.id === id);
    const label = declared?.customLabel || declared?.label || rows[0]?.comparisonLabel || id;
    const measureGroups = ["scatter", "bubble"].includes(chartType)
      ? [...new Set(rows.map((row) => row.measureId))].map((id) => rows.filter((row) => row.measureId === id))
      : [rows];
    const result = { rows: [], issues: [] };
    for (const group of measureGroups) {
      const selectedMeasure = { ...measure, id: group[0]?.measureId || measure.id, unit: group[0]?.unit || measure.unit };
      if (!isCalculationAllowed(calculationId, selectedMeasure)) {
        return blocked("calculationNotAllowedForUnit", "This calculation is not available for the selected outcome.");
      }
      const calculated = applyCalculation(calculationId, {
        observations: group, measure: selectedMeasure, params, comparisonId: id, timeContract,
      });
      result.rows.push(...calculated.rows);
      result.issues.push(...calculated.issues);
    }
    let returned = result.rows.map((row) => ({ ...row, comparisonLabel: label }));
    const ranking = params.ranking;
    if (ranking) {
      const options = { labelKey: roles.category ? "categoryLabel" : "geographyLabel" };
      returned = ["scatter", "bubble"].includes(chartType)
        ? rankOutcomeObservations(returned, ranking, options)
        : rankObservations(returned, { ...ranking, ...options }).rows;
    }
    observations.push(...returned);
    issues.push(...result.issues);
    summaries.push({
      id,
      label,
      status: returned.some((row) => row.status === OBSERVATION_STATUS.AVAILABLE)
        ? "ok"
        : result.issues.length
          ? "invalid"
          : "noData",
    });
  }
  // Notices that never change what is drawn: mixed units, many series, and
  // rows that share every mapped column.
  issues.push(...valueColumnNotices(table, roles, base));
  const sharedPlaces = sharedPlaceIssue(chartableTable(table), chartType, roles, bindings);
  if (sharedPlaces) issues.push(sharedPlaces);
  const returnedPeriods = [
    ...new Set(observations.map((row) => row.period).filter((period) => period != null)),
  ].sort(comparePeriods);
  return {
    status: "ok",
    observations,
    comparisons: summaries,
    periods: returnedPeriods,
    issues,
  };
}
