export const OBSERVATION_STATUS = Object.freeze({
  AVAILABLE: "available",
  MISSING: "missing",
  SUPPRESSED: "suppressed",
});

export const VALUE_KINDS = Object.freeze({
  OBSERVED: "observed",
  PROJECTED: "projected",
  DERIVED: "derived",
});

export const ISSUE_LEVELS = Object.freeze({
  BLOCKING: "blocking",
  COMPARISON: "comparison",
  INFORMATION: "information",
});

export function createIssue({ code, level, message, comparisonId = null, ...details }) {
  if (!Object.values(ISSUE_LEVELS).includes(level)) throw new Error(`Unknown issue level: ${level}`);
  if (level === ISSUE_LEVELS.COMPARISON && !comparisonId) {
    throw new Error("A comparison-level issue requires comparisonId.");
  }
  return { code, level, message, comparisonId, ...details };
}

const REQUIRED_FIELDS = [
  "comparisonId",
  "comparisonLabel",
  "measureId",
  "measureLabel",
  "unit",
  "period",
  "value",
  "status",
  "valueKind",
  "calculation",
  "source",
];

export function validateObservation(row) {
  const errors = [];
  if (!row || typeof row !== "object") return { valid: false, errors: ["Observation must be an object."] };
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(row, field) || row[field] === undefined) errors.push(`${field} is required.`);
  }
  if (!Object.values(OBSERVATION_STATUS).includes(row.status)) errors.push("status is invalid.");
  if (!Object.values(VALUE_KINDS).includes(row.valueKind)) errors.push("valueKind is invalid.");
  if (row.status === OBSERVATION_STATUS.AVAILABLE) {
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
      errors.push("value must be a finite number when status is available.");
    }
  } else if (Object.values(OBSERVATION_STATUS).includes(row.status) && row.value !== null) {
    errors.push("value must be null when status is missing or suppressed.");
  }
  if (row.valueKind === VALUE_KINDS.DERIVED) {
    if (!Array.isArray(row.includedPeriods) || row.includedPeriods.length === 0) {
      errors.push("includedPeriods is required for a derived observation.");
    }
  } else if (row.includedPeriods != null) {
    errors.push("includedPeriods is only valid for a derived observation.");
  }
  if (!row.calculation || typeof row.calculation.id !== "string") {
    errors.push("calculation.id is required.");
  }
  return { valid: errors.length === 0, errors };
}

export function validateResponse(response) {
  const errors = [];
  if (!response || typeof response !== "object") return { valid: false, errors: ["Response must be an object."] };
  for (const field of ["observations", "comparisons", "periods", "issues"]) {
    if (!Array.isArray(response[field])) errors.push(`${field} must be an array.`);
  }
  if (errors.length) return { valid: false, errors };
  const ids = new Set();
  for (const comparison of response.comparisons) {
    if (!comparison?.id || !comparison?.label || !comparison?.status) {
      errors.push("Every comparison summary requires id, label, and status.");
      continue;
    }
    ids.add(comparison.id);
    if (
      comparison.status === "invalid" &&
      !response.issues.some(
        (issue) => issue.level === ISSUE_LEVELS.COMPARISON && issue.comparisonId === comparison.id,
      )
    ) {
      errors.push(`Invalid comparison ${comparison.id} requires an attributed issue.`);
    }
  }
  for (const row of response.observations) {
    const result = validateObservation(row);
    errors.push(...result.errors.map((error) => `${row?.comparisonId || "observation"}: ${error}`));
    if (!ids.has(row?.comparisonId)) errors.push(`Observation belongs to unlisted comparison ${row?.comparisonId}.`);
  }
  for (const issue of response.issues) {
    if (issue?.level === ISSUE_LEVELS.COMPARISON && !issue.comparisonId) {
      errors.push("A comparison issue requires comparisonId.");
    }
  }
  return { valid: errors.length === 0, errors };
}

function comparable(value) {
  return value === null || value === undefined ? "" : String(value);
}

export function orderObservations(rows) {
  return [...rows].sort((a, b) => {
    for (const key of ["comparisonId", "period", "geographyId", "categoryId"]) {
      const difference = comparable(a[key]).localeCompare(comparable(b[key]), undefined, {
        numeric: true,
      });
      if (difference) return difference;
    }
    return 0;
  });
}
