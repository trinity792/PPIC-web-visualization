import { applyCalculation, isCalculationAllowed } from "./calculationRegistry";
import { rankObservations } from "./rankObservations";
import {
  ISSUE_LEVELS,
  OBSERVATION_STATUS,
  VALUE_KINDS,
  createIssue,
  orderObservations,
} from "@/lib/visualization/observationContract";

const blockingIssue = (code, message) =>
  createIssue({ code, level: ISSUE_LEVELS.BLOCKING, message });

function comparePeriods(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function blocked(issues, comparisons = []) {
  return { status: "blocked", observations: [], comparisons, periods: [], issues };
}

function periodsFor(time, availablePeriods, defaultReportingPeriod) {
  const available = [...new Set(availablePeriods)].sort(comparePeriods);
  if (!time || !time.contract) return { error: "Select time to show this chart." };
  if (time.contract === "none") return { periods: [null] };
  if (time.contract === "snapshot") {
    const year = time.year ?? defaultReportingPeriod;
    return available.includes(year)
      ? { periods: [year] }
      : { error: `Period ${year} is not available.` };
  }
  if (time.contract === "range" || time.contract === "orderedSequence") {
    const start = time.startYear ?? available[0];
    const end = time.endYear ?? available.at(-1);
    const periods = available.filter(
      (period) => comparePeriods(period, start) >= 0 && comparePeriods(period, end) <= 0,
    );
    return periods.length ? { periods } : { error: "The selected period is not available." };
  }
  if (time.contract === "selectedSnapshots") {
    const requested = time.years || time.periods || [];
    if (!requested.length || requested.some((period) => !available.includes(period))) {
      return { error: "One or more selected periods are not available." };
    }
    return { periods: [...new Set(requested)].sort(comparePeriods) };
  }
  if (time.contract === "twoPeriods") {
    const periods = [time.startYear, time.endYear];
    if (
      periods.some((period) => !available.includes(period)) ||
      comparePeriods(periods[0], periods[1]) >= 0
    ) {
      return { error: "Select two available periods in chronological order." };
    }
    return { periods };
  }
  return { error: `Unknown time contract: ${time.contract}.` };
}

function comparisonLabel(comparison, question, adapter) {
  return (
    comparison.customLabel ||
    comparison.label ||
    adapter.comparisonLabel?.(question, comparison) ||
    comparison.derivedLabel ||
    comparison.id
  );
}

function requestedGeographies(question, comparison, selected) {
  const requested = (comparison.geography || question.geography)?.locations || [];
  if (requested.length) {
    return requested.map((location) => {
      const found = selected.find(
        (row) => row.geographyId === location || row.geographyLabel === location,
      );
      return {
        id: found?.geographyId || location,
        label: found?.geographyLabel || location,
      };
    });
  }
  const seen = new Map();
  for (const row of selected) {
    const id = row.geographyId ?? row.geographyLabel;
    if (!seen.has(id)) seen.set(id, { id, label: row.geographyLabel || String(id) });
  }
  return [...seen.values()];
}

function materialize({ selected, periods, geographies, comparison, label, measure, question, adapter }) {
  const rows = [];
  for (const geography of geographies) {
    const geographyRows = selected.filter(
      (row) => row.geographyId === geography.id || row.geographyLabel === geography.label,
    );
    const categoryMap = new Map();
    for (const row of geographyRows) {
      if (row.categoryId == null && row.categoryLabel == null) continue;
      const key = row.categoryId ?? row.categoryLabel;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { id: row.categoryId ?? null, label: row.categoryLabel ?? null });
      }
    }
    const categories = categoryMap.size ? [...categoryMap.values()] : [{ id: null, label: null }];
    for (const category of categories) {
      for (const period of periods) {
        const found = geographyRows.find(
          (row) =>
            row.period === period &&
            (category.id == null
              ? row.categoryId == null && row.categoryLabel == null
              : row.categoryId === category.id || row.categoryLabel === category.label),
        );
        const status = found?.status || OBSERVATION_STATUS.MISSING;
        rows.push({
          comparisonId: comparison.id,
          comparisonLabel: label,
          measureId: measure.id,
          measureLabel: measure.label || measure.id,
          unit: measure.unit || "number",
          period,
          geographyId: found?.geographyId || geography.id,
          geographyLabel: found?.geographyLabel || geography.label,
          categoryId: found?.categoryId ?? category.id,
          categoryLabel: found?.categoryLabel ?? category.label,
          value: status === OBSERVATION_STATUS.AVAILABLE ? found.value : null,
          status,
          valueKind:
            found?.valueKind ||
            adapter.valueKindForPeriod?.(period, question) ||
            VALUE_KINDS.OBSERVED,
          calculation: { id: "actual", params: {} },
          includedPeriods: null,
          source: found?.source || comparison.source || question.source,
        });
      }
    }
  }
  return rows;
}

function byGeography(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.geographyId ?? ""}|${row.categoryId ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

const CHANGE_CALCULATIONS = new Set([
  "numericChange",
  "percentChange",
  "percentagePointChange",
]);

function calculationParamsFor(calculation = {}, activePeriods = []) {
  const params = { ...(calculation.params || {}) };
  if (CHANGE_CALCULATIONS.has(calculation.id)) {
    if (params.startYear == null) params.startYear = activePeriods[0];
    if (params.endYear == null) params.endYear = activePeriods.at(-1);
  }
  if (calculation.id === "indexed" && params.baseYear == null) {
    params.baseYear = activePeriods[0];
  }
  if (calculation.id === "averageSelectedYears" && !params.years?.length) {
    params.years = [...activePeriods];
  }
  return params;
}

export async function executeQuestion(spec, { adapter } = {}) {
  if (!spec || spec.version !== 3) {
    return blocked([blockingIssue("unsupportedVersion", "This request uses an unsupported version.")]);
  }
  const question = spec.question;
  if (!question || !adapter) {
    return blocked([blockingIssue("invalidQuestion", "The data question is incomplete.")]);
  }
  const moduleId = question.dataset?.moduleId;
  const datasetIds = adapter.datasetIds || [adapter.id];
  if (question.dataset?.kind !== "module" || !datasetIds.includes(moduleId)) {
    return blocked([
      blockingIssue("datasetMismatch", "This route cannot answer the selected dataset."),
    ]);
  }
  if (!Array.isArray(question.comparisons) || !question.comparisons.length) {
    return blocked([blockingIssue("noComparisons", "Add at least one comparison.")]);
  }
  if (question.comparisons.length > 10) {
    return blocked([
      blockingIssue("comparisonLimit", "This chart has the maximum of 10 comparisons."),
    ]);
  }
  const comparisonIds = question.comparisons.map((comparison) => comparison?.id);
  if (
    comparisonIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(comparisonIds).size !== comparisonIds.length
  ) {
    return blocked([
      blockingIssue("invalidComparisonIds", "Each comparison needs a unique stable id."),
    ]);
  }
  const sharedIssues = await adapter.validateQuestion?.(question);
  if (sharedIssues?.length) return blocked(sharedIssues);
  const measure = await adapter.measure(question.outcome?.measureId);
  if (!measure) {
    return blocked([blockingIssue("unknownOutcome", "Select a valid outcome to show this chart.")]);
  }
  if (!isCalculationAllowed(question.calculation?.id || "actual", measure)) {
    return blocked([
      blockingIssue(
        "calculationNotAllowedForUnit",
        "This calculation is not available for the selected outcome.",
      ),
    ]);
  }
  const availablePeriods = await adapter.availablePeriods(question);
  const resolvedTime = periodsFor(
    question.time,
    availablePeriods,
    await adapter.defaultReportingPeriod(question),
  );
  if (resolvedTime.error) {
    return blocked([blockingIssue("periodNotAvailable", resolvedTime.error)]);
  }
  const periods = resolvedTime.periods;
  const requestedComparisons = question.comparisons;

  const observations = [];
  const summaries = [];
  const issues = [];
  const returnedPeriods = new Set();
  for (const comparison of requestedComparisons) {
    const label = comparisonLabel(comparison, question, adapter);
    const comparisonIssues = await adapter.validateComparison?.({ question, comparison, measure });
    if (comparisonIssues?.length) {
      issues.push(...comparisonIssues);
      summaries.push({ id: comparison.id, label, status: "invalid" });
      continue;
    }
    const comparisonTime = comparison.time
      ? periodsFor(comparison.time, availablePeriods, await adapter.defaultReportingPeriod(question))
      : { periods };
    if (comparisonTime.error) {
      issues.push(
        createIssue({
          code: "periodNotAvailable",
          level: ISSUE_LEVELS.COMPARISON,
          comparisonId: comparison.id,
          message: comparisonTime.error,
        }),
      );
      summaries.push({ id: comparison.id, label, status: "invalid" });
      continue;
    }
    const activePeriods = comparisonTime.periods;
    activePeriods.forEach((period) => returnedPeriods.add(period));
    const selected = await adapter.select({
      question,
      comparison,
      measure,
      periods: activePeriods,
    });
    const geographies = requestedGeographies(question, comparison, selected);
    const cells = materialize({
      selected,
      periods: activePeriods,
      geographies,
      comparison,
      label,
      measure,
      question,
      adapter,
    });

    const calculated = [];
    const calculationIssues = [];
    const calculation = question.calculation || { id: "actual", params: {} };
    const calculationParams = calculationParamsFor(calculation, activePeriods);
    for (const group of byGeography(cells)) {
      const result = applyCalculation(calculation.id || "actual", {
        observations: group,
        measure,
        params: calculationParams,
        comparisonId: comparison.id,
      });
      calculated.push(...result.rows);
      calculationIssues.push(...result.issues);
    }
    issues.push(...calculationIssues);
    if (calculationIssues.length && !calculated.some((row) => row.status === "available")) {
      summaries.push({ id: comparison.id, label, status: "invalid" });
      continue;
    }
    let returned = calculated;
    const ranking = question.calculation?.params?.ranking;
    if (ranking) {
      returned = rankObservations(calculated, {
        ...ranking,
        labelKey: "geographyLabel",
      }).rows;
    }
    observations.push(...returned);
    summaries.push({
      id: comparison.id,
      label,
      status: returned.some((row) => row.status === OBSERVATION_STATUS.AVAILABLE) ? "ok" : "noData",
    });
  }

  const valid = summaries.filter((summary) => summary.status !== "invalid");
  if (!valid.length) {
    return {
      status: "blocked",
      observations: [],
      comparisons: summaries,
      periods: [...returnedPeriods].sort(comparePeriods),
      issues: [...issues, blockingIssue("noValidComparisons", "No comparison can be shown.")],
    };
  }
  return {
    status: "ok",
    observations: observations.some((row) => Number.isFinite(row.rank))
      ? [...observations].sort(
          (a, b) =>
            String(a.comparisonId).localeCompare(String(b.comparisonId)) ||
            (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY),
        )
      : orderObservations(observations),
    comparisons: summaries,
    periods: [...returnedPeriods].sort(comparePeriods),
    issues,
  };
}
