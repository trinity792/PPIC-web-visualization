/**
 * Field-descriptor vocabulary for the shared visualization layer.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any server-only
 * module, so both `"use client"` components and the server-side `lib/data/*`
 * access modules can consume it. It defines *what a field is* (kind, unit,
 * comparison group, allowed transforms, allowed chart roles) and small pure
 * helpers for reasoning about fields. The actual per-module catalogs live in
 * `lib/visualization/moduleSchemas/*`.
 *
 * Mirrors the "Shared field catalog" section of
 * `docs/PPIC Summer 2026/trinitys_notes/main.md`.
 */

/** The three kinds a field can take. */
export const FIELD_KINDS = Object.freeze({
  TEMPORAL: "temporal", // ordered time axis, e.g. Year
  DIMENSION: "dimension", // categorical, e.g. Location, Geographic Level
  MEASURE: "measure", // numeric metric, e.g. Total Population
});

/**
 * Units drive formatting and same-axis compatibility. A unit is a coarse type;
 * `comparisonGroup` (below) is the finer-grained "may these share an axis?" key.
 */
export const UNITS = Object.freeze({
  PEOPLE: "people",
  HOUSING_UNITS: "housingUnits",
  PERCENT: "percent",
  RATIO: "ratio", // e.g. persons per household
  COUNT: "count", // e.g. births, deaths
  RATE_PER_THOUSAND: "ratePerThousand", // e.g. crude birth rate
});

/**
 * Chart roles a measure may legitimately fill. Used by the chart registry +
 * validation to decide which encodings a field can be bound to.
 */
export const CHART_ROLES = Object.freeze({
  X_MEASURE: "xMeasure",
  Y_MEASURE: "yMeasure",
  SIZE: "size",
  COLOR: "color",
});

/** A unit is a percentage/rate that must use percentage-point change, not %-change. */
const RATE_UNITS = new Set([UNITS.PERCENT, UNITS.RATE_PER_THOUSAND]);

/** @param {object} field @returns {boolean} */
export function isMeasure(field) {
  return Boolean(field) && field.kind === FIELD_KINDS.MEASURE;
}

/** @param {object} field @returns {boolean} */
export function isDimension(field) {
  return Boolean(field) && field.kind === FIELD_KINDS.DIMENSION;
}

/** @param {object} field @returns {boolean} */
export function isTemporal(field) {
  return Boolean(field) && field.kind === FIELD_KINDS.TEMPORAL;
}

/** A rate/percentage measure (vacancy rate, crude rates, percent change). */
export function isRate(field) {
  return isMeasure(field) && RATE_UNITS.has(field.unit);
}

/**
 * Two measures may share an axis only when they belong to the same
 * `comparisonGroup`. Implements guardrail "a numeric field is not automatically
 * comparable to every other numeric field" (main.md §"Shared field catalog").
 *
 * @returns {boolean} false unless both are measures with a defined, equal group.
 */
export function areComparable(a, b) {
  if (!isMeasure(a) || !isMeasure(b)) return false;
  if (!a.comparisonGroup || !b.comparisonGroup) return false;
  return a.comparisonGroup === b.comparisonGroup;
}

/**
 * Transforms a field is allowed to use. Falls back to ["actual"] when a field
 * declares none, so callers never receive undefined.
 * @returns {string[]}
 */
export function allowedTransforms(field) {
  if (!field || !Array.isArray(field.transforms) || field.transforms.length === 0) {
    return ["actual"];
  }
  return field.transforms;
}

/** Whether a field may be bound to a given chart role (e.g. "size"). */
export function supportsRole(field, role) {
  return isMeasure(field) && Array.isArray(field.chartRoles) && field.chartRoles.includes(role);
}
