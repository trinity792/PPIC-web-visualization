import { OBSERVATION_STATUS, VALUE_KINDS } from "@/lib/visualization/observationContract";
import {
  CALCULATION_IDS,
  applyCalculation,
  isCalculationAllowed,
} from "@/lib/data/visualization/calculationRegistry";
import { rankObservations } from "@/lib/data/visualization/rankObservations";

function yearValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : value;
}

function numericValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Convert a typed inline table to the same base observations module adapters return. */
export function tableToObservations(
  table,
  { bindings = {}, measure, source = "Inline data", comparisons = [] } = {},
) {
  const columns = (table?.columns || []).map((column) => column.name);
  const index = Object.fromEntries(columns.map((name, position) => [name, position]));
  const comparisonIds = new Map();
  const comparisonColumn =
    bindings.comparison || bindings.series || bindings.group || bindings.unit;
  const valueColumn =
    bindings.value || bindings.y || bindings.color || bindings.point;
  const periodColumn = bindings.period || bindings.x;
  const categoryColumn = bindings.category;
  const geographyColumn = bindings.geography || bindings.location;
  return (table?.rows || []).map((cells) => {
    const label = String(cells[index[comparisonColumn]] ?? "Data");
    if (!comparisonIds.has(label)) {
      const declared = comparisons.find(
        (comparison) =>
          comparison.customLabel === label || comparison.label === label,
      ) || comparisons[comparisonIds.size];
      comparisonIds.set(label, declared?.id || `cmp_inline_${comparisonIds.size + 1}`);
    }
    const value = numericValue(cells[index[valueColumn]]);
    const geography = cells[index[geographyColumn]] ?? label;
    const category = cells[index[categoryColumn]] ?? null;
    return {
      comparisonId: comparisonIds.get(label),
      comparisonLabel: label,
      measureId: measure.id,
      measureLabel: measure.label || measure.id,
      unit: measure.unit || "number",
      period: yearValue(cells[index[periodColumn]]),
      geographyId: String(geography),
      geographyLabel: String(geography),
      categoryId: category == null ? null : String(category),
      categoryLabel: category == null ? null : String(category),
      value,
      status: value === null ? OBSERVATION_STATUS.MISSING : OBSERVATION_STATUS.AVAILABLE,
      valueKind: VALUE_KINDS.OBSERVED,
      calculation: { id: "actual", params: {} },
      includedPeriods: null,
      source,
    };
  });
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

/** Execute an inline v3 question with the same calculation functions as module routes. */
export function executeInlineQuestion(spec) {
  const question = spec?.question || {};
  const table = question.dataset?.inline;
  const bindings = spec?.presentation?.bindings || question.dataset?.bindings || {};
  const measureId = question.outcome?.measureId || bindings.value || bindings.y || bindings.color;
  if (!table || !measureId) {
    return {
      status: "blocked",
      observations: [],
      comparisons: [],
      periods: [],
      issues: [{
        code: "inlineQuestionIncomplete",
        level: "blocking",
        comparisonId: null,
        message: "Import data and select an outcome before you build the chart.",
      }],
    };
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
    return {
      status: "blocked",
      observations: [],
      comparisons: [],
      periods: [],
      issues: [{
        code: "calculationNotAllowedForUnit",
        level: "blocking",
        comparisonId: null,
        message: "This calculation is not available for the selected outcome.",
      }],
    };
  }
  const base = tableToObservations(table, {
    bindings,
    measure,
    comparisons: question.comparisons || [],
  });
  const periods = requestedPeriods(question.time, base.map((row) => row.period));
  const filtered = base.filter(
    (row) => periods.includes(row.period) || (periods.includes(null) && row.period == null),
  );
  const ids = [
    ...new Set([
      ...(question.comparisons || []).map((comparison) => comparison.id),
      ...filtered.map((row) => row.comparisonId),
    ]),
  ];
  const observations = [];
  const issues = [];
  const summaries = [];
  for (const id of ids) {
    const rows = filtered.filter((row) => row.comparisonId === id);
    const declared = (question.comparisons || []).find((comparison) => comparison.id === id);
    const label = declared?.customLabel || declared?.label || rows[0]?.comparisonLabel || id;
    const result = applyCalculation(calculationId, {
      observations: rows,
      measure,
      params: question.calculation?.params || {},
      comparisonId: id,
    });
    let returned = result.rows.map((row) => ({ ...row, comparisonLabel: label }));
    const ranking = question.calculation?.params?.ranking;
    if (ranking) returned = rankObservations(returned, ranking).rows;
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
  return { status: "ok", observations, comparisons: summaries, periods, issues };
}
