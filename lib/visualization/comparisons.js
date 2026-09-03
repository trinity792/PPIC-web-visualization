import { nanoid } from "nanoid";

export const MAX_COMPARISONS = 10;
export const COMPARISON_LIMIT_MESSAGE = "This chart has the maximum of 10 comparisons.";

/**
 * Whether this module exposes population dimensions that create independent
 * comparison questions. Modules such as Components of Change use the shared
 * geography selection as their rendered series instead, so their internal
 * execution comparison must not become an editor control.
 */
export function hasComparisonDimensions(schema = {}) {
  return Boolean(
    schema.comparisonDimensions?.length ||
      Object.values(schema.fields || {}).some((field) => field.comparisonDimension),
  );
}

const limitIssue = () => ({
  code: "comparisonLimit",
  level: "comparison",
  message: COMPARISON_LIMIT_MESSAGE,
});

export function createComparison(input = {}) {
  return {
    id: input.id || `cmp_${nanoid(10)}`,
    dimensions: { ...(input.dimensions || {}) },
    ...Object.fromEntries(
      Object.entries(input).filter(([key]) => !["id", "dimensions"].includes(key)),
    ),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

export function canonicalSignature(comparison) {
  const signature = {
    dimensions: comparison?.dimensions || {},
    geography: comparison?.geography ?? null,
    time: comparison?.time ?? null,
    source: comparison?.source ?? null,
  };
  return JSON.stringify(canonical(signature));
}

export function addComparison(comparisons, comparison) {
  if (comparisons.length >= MAX_COMPARISONS) {
    return { comparisons, issues: [limitIssue()] };
  }
  return { comparisons: [...comparisons, createComparison(comparison)], issues: [] };
}

export function updateComparison(comparisons, id, patch) {
  return {
    comparisons: comparisons.map((comparison) =>
      comparison.id === id
        ? createComparison({ ...comparison, ...patch, id: comparison.id })
        : comparison,
    ),
    issues: [],
  };
}

function product(entries, index = 0, values = {}, output = []) {
  if (index === entries.length) {
    output.push(values);
    return output;
  }
  const [dimension, choices] = entries[index];
  for (const value of choices) {
    product(entries, index + 1, { ...values, [dimension]: value }, output);
  }
  return output;
}

export function expandCrossProduct(selections, { existing = [], fixed = {} } = {}) {
  const combinations = product(Object.entries(selections || {})).map((dimensions) => ({
    ...fixed,
    ...dimensions,
  }));
  if (combinations.length > MAX_COMPARISONS) {
    return { comparisons: [], issues: [limitIssue()] };
  }
  const bySignature = new Map(existing.map((entry) => [canonicalSignature(entry), entry]));
  return {
    comparisons: combinations.map((dimensions) => {
      const candidate = { dimensions };
      return bySignature.get(canonicalSignature(candidate)) || createComparison(candidate);
    }),
    issues: [],
  };
}

function containsComparison(container, child, dimensionRoles) {
  let broader = false;
  for (const [dimension, childValue] of Object.entries(child.dimensions || {})) {
    const containerValue = container.dimensions?.[dimension];
    if (containerValue === childValue) continue;
    const roles = dimensionRoles?.[dimension] || {};
    if (roles[containerValue] === "aggregate" && roles[childValue] === "component") {
      broader = true;
      continue;
    }
    return false;
  }
  return broader;
}

export function overlapMetadata(comparisons, { dimensionRoles = {} } = {}) {
  const result = [];
  for (const comparison of comparisons) {
    const containedBy = comparisons
      .filter((candidate) => candidate.id !== comparison.id)
      .filter((candidate) => containsComparison(candidate, comparison, dimensionRoles))
      .map((candidate) => candidate.id);
    if (containedBy.length) result.push({ comparisonId: comparison.id, containedBy });
  }
  return result;
}

function labelForValue(dimension, value, comparison, labelMeta) {
  const mapped = labelMeta.valueLabels?.[dimension]?.[value];
  if (mapped && typeof mapped === "object") {
    const sex = comparison.dimensions?.Sex;
    return mapped.bySex?.[sex] || mapped.default || value;
  }
  if (typeof mapped === "string") return mapped;
  if (dimension === "Age Group") return `Ages ${value}`;
  return String(value);
}

function deriveLabel(comparison, labelMeta) {
  const parts = [];
  for (const dimension of labelMeta.dimensionOrder || Object.keys(comparison.dimensions || {})) {
    const value = dimension === "geography" ? comparison.geography : comparison.dimensions?.[dimension];
    if (value === undefined || value === null || value === "") continue;
    if (labelMeta.omitValues?.[dimension]?.includes(value)) continue;
    parts.push(labelForValue(dimension, value, comparison, labelMeta));
  }
  return parts.join(" ") || comparison.id;
}

export function resolveLabels(comparisons, { labelMeta = {} } = {}) {
  const derived = comparisons.map((comparison) => deriveLabel(comparison, labelMeta));
  const counts = derived.reduce((map, label) => map.set(label, (map.get(label) || 0) + 1), new Map());
  return comparisons.map((comparison, index) => {
    const derivedLabel = derived[index];
    let resolved = derivedLabel;
    if (counts.get(derivedLabel) > 1) {
      const colliding = comparisons.filter((_, otherIndex) => derived[otherIndex] === derivedLabel);
      for (const key of labelMeta.disambiguateBy || []) {
        const valueOf = (entry) =>
          key === "geography"
            ? entry.geography
            : key === "time"
              ? entry.time
              : key === "Source"
                ? entry.source || entry.dimensions?.Source
                : entry.dimensions?.[key];
        const value = valueOf(comparison);
        const distinct = new Set(colliding.map(valueOf).map((entry) => JSON.stringify(entry)));
        if (distinct.size < 2) continue;
        if (value !== undefined && value !== null && value !== "") {
          resolved = `${derivedLabel} (${Array.isArray(value) ? value.join("–") : value})`;
          break;
        }
      }
    }
    return { ...comparison, derivedLabel, label: comparison.customLabel || resolved };
  });
}
