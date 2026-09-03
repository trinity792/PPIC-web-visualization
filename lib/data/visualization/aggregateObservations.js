import {
  ISSUE_LEVELS,
  OBSERVATION_STATUS,
  VALUE_KINDS,
  createIssue,
} from "@/lib/visualization/observationContract";

const issue = (code, comparisonId, message) =>
  createIssue({ code, level: ISSUE_LEVELS.COMPARISON, comparisonId, message });

function groupKey(row, groupBy) {
  return JSON.stringify(groupBy.map((key) => row[key] ?? null));
}

function unavailableStatus(rows) {
  return rows.some((row) => row.status === OBSERVATION_STATUS.SUPPRESSED)
    ? OBSERVATION_STATUS.SUPPRESSED
    : OBSERVATION_STATUS.MISSING;
}

function overlaps(rows, dimensionRoles) {
  for (const [dimension, roles] of Object.entries(dimensionRoles || {})) {
    const values = new Set(rows.map((row) => row.dimensions?.[dimension]).filter(Boolean));
    const hasAggregate = [...values].some((value) => roles[value] === "aggregate");
    const hasComponent = [...values].some((value) => roles[value] === "component");
    if (hasAggregate && hasComponent) return true;
  }
  return false;
}

function outputRow(rows, groupBy, calculationId, status, value, extras = {}) {
  const first = rows[0] || {};
  const includedPeriods = [...new Set(rows.map((row) => row.period).filter((value) => value != null))];
  const result = {
    ...first,
    value: status === OBSERVATION_STATUS.AVAILABLE ? value : null,
    status,
    valueKind: VALUE_KINDS.DERIVED,
    calculation: { id: calculationId, params: {} },
    includedPeriods: includedPeriods.length ? includedPeriods : [first.period],
    ...extras,
  };
  for (const field of ["period", "geographyId", "geographyLabel", "categoryId", "categoryLabel"]) {
    if (!groupBy.includes(field) && field in result && field !== "period") result[field] = null;
  }
  return result;
}

function matchingWeight(row, weights) {
  return weights.find(
    (weight) =>
      weight.period === row.period &&
      weight.geographyId === row.geographyId &&
      (weight.categoryId ?? null) === (row.categoryId ?? null),
  );
}

export function aggregateObservations(observations, {
  measure,
  groupBy = ["period"],
  dimensionRoles = {},
  weights = [],
  comparisonId,
} = {}) {
  const mode = measure?.aggregation;
  if (!["sum", "weightedMean"].includes(mode)) {
    return {
      rows: [],
      issues: [issue("aggregationNotAllowed", comparisonId, "This outcome cannot be aggregated.")],
    };
  }
  if (mode === "weightedMean" && !measure?.weightField) {
    return {
      rows: [],
      issues: [issue("weightFieldRequired", comparisonId, "This rate needs a declared weight field.")],
    };
  }
  if (overlaps(observations, dimensionRoles)) {
    return {
      rows: [],
      issues: [
        issue(
          "overlappingAggregate",
          comparisonId,
          "An aggregate cannot be added to its own component rows.",
        ),
      ],
    };
  }

  const groups = new Map();
  for (const row of observations) {
    const key = groupKey(row, groupBy);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const rows = [];
  const issues = [];
  for (const members of groups.values()) {
    if (mode === "sum") {
      const unavailable = members.filter((row) => row.status !== OBSERVATION_STATUS.AVAILABLE);
      if (unavailable.length) {
        const varyingDimensions = Object.keys(unavailable[0]?.dimensions || {}).filter(
          (dimension) => new Set(members.map((row) => row.dimensions?.[dimension])).size > 1,
        );
        rows.push(
          outputRow(members, groupBy, "sum", unavailableStatus(unavailable), null, {
            unavailableInputs: unavailable.map((row) => ({
              dimensions: Object.fromEntries(
                varyingDimensions.map((dimension) => [dimension, row.dimensions?.[dimension]]),
              ),
            })),
          }),
        );
      } else {
        rows.push(
          outputRow(
            members,
            groupBy,
            "sum",
            OBSERVATION_STATUS.AVAILABLE,
            members.reduce((sum, row) => sum + row.value, 0),
          ),
        );
      }
      continue;
    }

    const pairs = members.map((row) => ({ row, weight: matchingWeight(row, weights) }));
    const unavailable = pairs.flatMap(({ row, weight }) =>
      [row, weight].filter((entry) => !entry || entry.status !== OBSERVATION_STATUS.AVAILABLE),
    );
    if (unavailable.length) {
      rows.push(outputRow(members, groupBy, "weightedMean", unavailableStatus(unavailable), null));
      continue;
    }
    const totalWeight = pairs.reduce((sum, pair) => sum + pair.weight.value, 0);
    if (totalWeight === 0) {
      issues.push(issue("zeroTotalWeight", comparisonId, "The total weight must be greater than zero."));
      continue;
    }
    const value =
      pairs.reduce((sum, pair) => sum + pair.row.value * pair.weight.value, 0) / totalWeight;
    rows.push(outputRow(members, groupBy, "weightedMean", OBSERVATION_STATUS.AVAILABLE, value));
  }
  return { rows, issues };
}
