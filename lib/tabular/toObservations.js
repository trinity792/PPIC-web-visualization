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
 *   - Scatter and bubble carry a second measure as `xValue` and, for bubble
 *     and forest weights, a third as `sizeValue`.
 */

import { OBSERVATION_STATUS, VALUE_KINDS } from "@/lib/visualization/observationContract";
import {
  CALCULATION_IDS,
  applyCalculation,
  isCalculationAllowed,
} from "@/lib/data/visualization/calculationRegistry";
import { calculationParamsFor } from "@/lib/data/visualization/executeQuestion";
import { rankObservations } from "@/lib/data/visualization/rankObservations";
import { periodToken, resolveInlineRoles } from "@/lib/visualization/inlineQuestion";

function numericValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const columns = (table?.columns || []).map((column) => column.name);
  const index = Object.fromEntries(columns.map((name, position) => [name, position]));
  const at = (cells, name) => (name != null && name in index ? cells[index[name]] : undefined);
  const roles = resolveInlineRoles(chartType, bindings);
  const comparisonIds = new Map();

  const base = (cells, label) => {
    const geography = at(cells, roles.geography) ?? label;
    const category = at(cells, roles.category) ?? null;
    return {
      comparisonId: comparisonIds.get(label),
      comparisonLabel: label,
      measureId: measure.id,
      measureLabel: measure.label || measure.id,
      unit: measure.unit || "number",
      period: periodToken(at(cells, roles.period)),
      geographyId: String(geography),
      geographyLabel: String(geography),
      categoryId: text(category),
      categoryLabel: text(category),
      valueKind: VALUE_KINDS.OBSERVED,
      calculation: { id: "actual", params: {} },
      includedPeriods: null,
      source,
    };
  };
  const withValue = (row, value) => ({
    ...row,
    value,
    status: value === null ? OBSERVATION_STATUS.MISSING : OBSERVATION_STATUS.AVAILABLE,
  });

  const observations = [];
  for (const cells of table?.rows || []) {
    const label = String(at(cells, roles.comparison) ?? "Data");
    if (!comparisonIds.has(label)) {
      const declared =
        comparisons.find(
          (comparison) => comparison.customLabel === label || comparison.label === label,
        ) || comparisons[comparisonIds.size];
      comparisonIds.set(label, declared?.id || `cmp_inline_${comparisonIds.size + 1}`);
    }
    const row = base(cells, label);
    const sizeValue = roles.size ? numericValue(at(cells, roles.size)) : undefined;
    const extras = {
      ...(roles.xValue ? { xValue: numericValue(at(cells, roles.xValue)) } : {}),
      ...(sizeValue !== undefined ? { sizeValue } : {}),
    };

    if (roles.interval) {
      // One table row is a span: its endpoints (and a forest plot's estimate)
      // become sibling observations the adapter reassembles per category. The
      // endpoint's own column name stands in for a period so the table and
      // export can still say which number is which.
      const lower = roles.interval.start ? numericValue(at(cells, roles.interval.start)) : null;
      const upper = roles.interval.end ? numericValue(at(cells, roles.interval.end)) : null;
      // No estimate column: the whisker still needs a centre to hang from, so
      // the midpoint stands in (a symmetric interval's own point estimate).
      const estimate = roles.interval.point
        ? numericValue(at(cells, roles.interval.point))
        : roles.interval.midpointEstimate && lower !== null && upper !== null
          ? (lower + upper) / 2
          : null;
      const parts = [
        ["estimate", roles.interval.point || "estimate", estimate, Boolean(roles.interval.point) || estimate !== null],
        ["lowerBound", roles.interval.start, lower, Boolean(roles.interval.start)],
        ["upperBound", roles.interval.end, upper, Boolean(roles.interval.end)],
      ];
      for (const [measureRole, column, value, bound] of parts) {
        if (!bound) continue;
        observations.push({
          ...withValue(row, value),
          period: row.period ?? column,
          measureRole,
          ...extras,
        });
      }
      continue;
    }

    observations.push({ ...withValue(row, numericValue(at(cells, roles.value))), ...extras });
  }
  return observations;
}

function comparePeriods(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function requestedPeriods(time, available) {
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
    question.outcome?.measureId || roles.value || roles.interval?.point || roles.interval?.start;
  if (!table || !measureId) {
    return blocked(
      "inlineQuestionIncomplete",
      "Import data and select an outcome before you build the chart.",
    );
  }
  const measure = {
    id: measureId,
    label: question.outcome?.measureLabel || measureId,
    unit: question.outcome?.unit || "number",
    aggregation: question.outcome?.aggregation || "notAllowed",
    calculations: question.outcome?.calculations || CALCULATION_IDS,
  };
  const calculationId = question.calculation?.id || "actual";
  if (!isCalculationAllowed(calculationId, measure)) {
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
  const hasPeriods = base.some((row) => row.period != null) && Boolean(roles.period);
  const periods = hasPeriods
    ? requestedPeriods(question.time, base.map((row) => row.period))
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
    const result = applyCalculation(calculationId, {
      observations: rows,
      measure,
      params,
      comparisonId: id,
      timeContract,
    });
    let returned = result.rows.map((row) => ({ ...row, comparisonLabel: label }));
    const ranking = params.ranking;
    if (ranking) {
      returned = rankObservations(returned, {
        ...ranking,
        labelKey: roles.category ? "categoryLabel" : "geographyLabel",
      }).rows;
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
