import {
  ISSUE_LEVELS,
  OBSERVATION_STATUS,
  VALUE_KINDS,
  createIssue,
} from "@/lib/visualization/observationContract";
import { getChartCapabilities } from "@/lib/visualization/chartRegistry";
import { aggregateObservations } from "./aggregateObservations";
import { rankObservations } from "./rankObservations";

export const CALCULATION_IDS = Object.freeze([
  "actual",
  "sum",
  "weightedMean",
  "averageSelectedYears",
  "numericChange",
  "percentChange",
  "percentagePointChange",
  "indexed",
  "benchmarkDifference",
  "ranking",
]);

const DESCRIPTORS = Object.freeze(
  Object.fromEntries(
    [
      ["actual", "Actual value", "oneOrMore", []],
      ["sum", "Sum", "oneOrMore", ["count", "people", "number"]],
      ["weightedMean", "Weighted mean", "oneOrMore", ["ratePerThousand", "percent", "rate"]],
      ["averageSelectedYears", "Average selected years", 2, []],
      ["numericChange", "Numeric change", 2, ["count", "people", "number"]],
      ["percentChange", "Percent change", 2, ["count", "people", "number"]],
      [
        "percentagePointChange",
        "Percentage-point change",
        2,
        ["ratePerThousand", "percent", "percentage", "rate"],
      ],
      ["indexed", "Index to 100", "base", ["count", "people", "number"]],
      ["benchmarkDifference", "Difference from benchmark", "aligned", []],
      ["ranking", "Ranking", "oneOrMore", []],
    ].map(([id, label, requiredPeriods, units]) => [id, { id, label, requiredPeriods, units }]),
  ),
);

export function getCalculation(id) {
  return DESCRIPTORS[id];
}

function declaredCalculations(measure) {
  return measure?.calculations || measure?.transforms || ["actual"];
}

export function isCalculationAllowed(id, measure) {
  if (!getCalculation(id)) return false;
  if (id === "actual") return true;
  const declared = declaredCalculations(measure);
  if (!declared.includes(id)) return false;
  const unit = measure?.unit;
  if (id === "percentChange" && /percent|rate/i.test(unit || "")) return false;
  if (id === "percentagePointChange" && !/percent|rate/i.test(unit || "")) return false;
  if (id === "sum" && measure?.aggregation !== "sum") return false;
  if (id === "weightedMean" && measure?.aggregation !== "weightedMean") return false;
  return true;
}

export function calculationOptionsFor(measure, { chartType } = {}) {
  let options = CALCULATION_IDS.filter((id) => isCalculationAllowed(id, measure));
  const chartCalculations = chartType ? getChartCapabilities(chartType)?.calculations : null;
  if (chartCalculations) options = options.filter((id) => chartCalculations.includes(id));
  return options;
}

function unavailableStatus(rows) {
  if (rows.some((row) => row?.status === OBSERVATION_STATUS.SUPPRESSED)) {
    return OBSERVATION_STATUS.SUPPRESSED;
  }
  return OBSERVATION_STATUS.MISSING;
}

function derivedRow(base, {
  id,
  params,
  value,
  status = OBSERVATION_STATUS.AVAILABLE,
  period,
  includedPeriods,
  unit,
  extras = {},
}) {
  return {
    ...base,
    period: period ?? base?.period ?? null,
    value: status === OBSERVATION_STATUS.AVAILABLE ? value : null,
    status,
    valueKind: VALUE_KINDS.DERIVED,
    calculation: { id, params: params || {} },
    includedPeriods,
    ...(unit ? { unit } : {}),
    ...extras,
  };
}

function comparisonIssue(code, comparisonId, message) {
  return createIssue({
    code,
    level: ISSUE_LEVELS.COMPARISON,
    comparisonId,
    message,
  });
}

function selectPeriod(observations, period) {
  return observations.find((row) => row.period === period);
}

export function calculateChangeValue(start, end, id) {
  if (start == null || end == null) return null;
  if (id === "percentChange") return start === 0 ? null : ((end - start) / start) * 100;
  return end - start;
}

function changeCalculation(id, context) {
  const { observations, params = {}, comparisonId } = context;
  const { startYear, endYear } = params;
  if (startYear == null || endYear == null || startYear === endYear || startYear > endYear) {
    return {
      rows: [],
      issues: [
        comparisonIssue(
          "distinctPeriodsRequired",
          comparisonId,
          "Select two different periods in chronological order.",
        ),
      ],
    };
  }
  const start = selectPeriod(observations, startYear);
  const end = selectPeriod(observations, endYear);
  const base = end || start || observations[0] || {};
  const includedPeriods = [startYear, endYear];
  if (!start || !end || start.status !== "available" || end.status !== "available") {
    return {
      rows: [
        derivedRow(base, {
          id,
          params,
          status: unavailableStatus([start, end]),
          period: endYear,
          includedPeriods,
        }),
      ],
      issues: [],
    };
  }
  if (id === "percentChange" && start.value === 0) {
    return {
      rows: [
        derivedRow(base, {
          id,
          params,
          status: OBSERVATION_STATUS.MISSING,
          period: endYear,
          includedPeriods,
        }),
      ],
      issues: [
        comparisonIssue(
          "zeroBaseValue",
          comparisonId,
          "Percent change needs a start value that is not zero.",
        ),
      ],
    };
  }
  const value = calculateChangeValue(start.value, end.value, id);
  const unit =
    id === "percentChange"
      ? "percent"
      : id === "percentagePointChange"
        ? "percentagePoints"
        : base.unit;
  return {
    rows: [derivedRow(base, { id, params, value, period: endYear, includedPeriods, unit })],
    issues: [],
  };
}

function indexCalculation({ observations, params = {}, comparisonId }) {
  const base = selectPeriod(observations, params.baseYear);
  if (!base || base.status !== OBSERVATION_STATUS.AVAILABLE || base.value === 0) {
    return {
      rows: observations.map((row) =>
        derivedRow(row, {
          id: "indexed",
          params,
          status: unavailableStatus([base]),
          includedPeriods: [params.baseYear, row.period].filter((value) => value != null),
          unit: "index",
        }),
      ),
      issues: [
        comparisonIssue(
          "baseValueUnavailable",
          comparisonId,
          "The index base period needs an available value that is not zero.",
        ),
      ],
    };
  }
  return {
    rows: observations.map((row) =>
      derivedRow(row, {
        id: "indexed",
        params,
        value: row.status === "available" ? (row.value / base.value) * 100 : null,
        status: row.status,
        includedPeriods: [params.baseYear, row.period],
        unit: "index",
      }),
    ),
    issues: [],
  };
}

function benchmarkCalculation({ observations, params = {} }) {
  const benchmark = params.benchmark || {};
  const benchmarkRows = benchmark.observations || [];
  return {
    rows: observations.map((row) => {
      const aligned = benchmarkRows.find(
        (candidate) =>
          candidate.period === row.period &&
          (!benchmark.geographyId || candidate.geographyId === benchmark.geographyId),
      );
      const status =
        row.status === "available" && aligned?.status === "available"
          ? OBSERVATION_STATUS.AVAILABLE
          : unavailableStatus([row, aligned]);
      return derivedRow(row, {
        id: "benchmarkDifference",
        params,
        value: status === "available" ? row.value - aligned.value : null,
        status,
        includedPeriods: [row.period],
      });
    }),
    issues: [],
  };
}

function averageCalculation({ observations, params = {}, comparisonId }) {
  const years = [...new Set(params.years || [])].sort((a, b) => a - b);
  if (years.length < 2) {
    return {
      rows: [],
      issues: [
        comparisonIssue(
          "twoYearsRequiredForAverage",
          comparisonId,
          "Select at least two years to calculate an average.",
        ),
      ],
    };
  }
  const selected = years.map((year) => selectPeriod(observations, year));
  const available = selected.filter((row) => row?.status === "available");
  const unavailablePeriods = years.filter((year, index) => selected[index]?.status !== "available");
  const status = unavailablePeriods.length ? unavailableStatus(selected) : OBSERVATION_STATUS.AVAILABLE;
  const base = selected.at(-1) || observations[0] || {};
  return {
    rows: [
      derivedRow(base, {
        id: "averageSelectedYears",
        params,
        value: status === "available"
          ? available.reduce((sum, row) => sum + row.value, 0) / available.length
          : null,
        status,
        period: years.at(-1),
        includedPeriods: available.map((row) => row.period),
        extras: unavailablePeriods.length ? { unavailablePeriods } : {},
      }),
    ],
    issues: [],
  };
}

export function applyCalculation(id, context) {
  const observations = (context.observations || []).map((row) => ({ ...row }));
  const next = { ...context, observations };
  if (id === "actual") {
    return {
      rows: observations.map((row) => ({
        ...row,
        calculation: { id: "actual", params: context.params || {} },
      })),
      issues: [],
    };
  }
  if (["numericChange", "percentChange", "percentagePointChange"].includes(id)) {
    return changeCalculation(id, next);
  }
  if (id === "indexed") return indexCalculation(next);
  if (id === "benchmarkDifference") return benchmarkCalculation(next);
  if (id === "averageSelectedYears") return averageCalculation(next);
  if (id === "sum" || id === "weightedMean") {
    return aggregateObservations(observations, {
      measure: { ...context.measure, aggregation: id },
      groupBy: context.params?.groupBy,
      dimensionRoles: context.params?.dimensionRoles,
      weights: context.params?.weights,
      comparisonId: context.comparisonId,
    });
  }
  if (id === "ranking") {
    return {
      rows: rankObservations(observations, context.params || {}).rows,
      issues: [],
    };
  }
  return {
    rows: [],
    issues: [
      comparisonIssue("calculationNotImplemented", context.comparisonId, `Calculation ${id} is not available.`),
    ],
  };
}
