/**
 * Named value formatters for axis labels, tooltips, and value labels.
 *
 * CLIENT-SAFE (no node:fs). Each formatter is `(value, opts?) => string` and is
 * null-safe: a null/undefined/NaN value renders as an em dash so missing data is
 * never shown as "0" (guardrail: preserve missing as missing).
 *
 * A field selects its formatter via `field.formatter` (explicit) or, failing
 * that, its `field.unit`. Resolve with `formatterFor(field)`.
 */

const MISSING = "—"; // em dash

function isMissing(value) {
  return value === null || value === undefined || (typeof value === "number" && Number.isNaN(value));
}

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const twoDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Registry of formatters keyed by id. Ids cover both explicit `field.formatter`
 * values and `field.unit` values so either can resolve here.
 */
export const FORMATTERS = Object.freeze({
  /** Plain year, no thousands separator. */
  year: (value) => (isMissing(value) ? MISSING : String(Math.trunc(value))),
  /** Whole-people counts: 1,234,567. */
  people: (value) => (isMissing(value) ? MISSING : integer.format(value)),
  /** Whole housing-unit counts. */
  housingUnits: (value) => (isMissing(value) ? MISSING : integer.format(value)),
  /** Generic whole-number count (births, deaths, migration). */
  count: (value) => (isMissing(value) ? MISSING : integer.format(value)),
  /** Percentage: one decimal + sign, e.g. "4.2%". */
  percent: (value) => (isMissing(value) ? MISSING : `${oneDecimal.format(value)}%`),
  /** Percentage-point delta, e.g. "+1.3 pp". */
  percentagePoint: (value) =>
    isMissing(value) ? MISSING : `${value >= 0 ? "+" : ""}${oneDecimal.format(value)} pp`,
  /** Rate per 1,000 population, e.g. "12.4 /1k". */
  ratePerThousand: (value) => (isMissing(value) ? MISSING : `${oneDecimal.format(value)} /1k`),
  /** Ratio such as persons per household, e.g. "2.85". */
  ratio: (value) => (isMissing(value) ? MISSING : twoDecimal.format(value)),
  /** Fallback numeric formatter. */
  number: (value) => (isMissing(value) ? MISSING : integer.format(value)),
});

/** Resolve a formatter function for a field, falling back to `number`. */
export function formatterFor(field) {
  if (!field) return FORMATTERS.number;
  const key = field.formatter || field.unit;
  return FORMATTERS[key] || FORMATTERS.number;
}

/** Convenience: format a value using a field's resolved formatter. */
export function formatValue(field, value, opts) {
  return formatterFor(field)(value, opts);
}
