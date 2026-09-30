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

const chosenPlaces = new Map();

function fixedPlaces(decimalPlaces, currency = false) {
  const key = `${decimalPlaces}:${currency}`;
  if (!chosenPlaces.has(key)) {
    chosenPlaces.set(
      key,
      new Intl.NumberFormat("en-US", {
        ...(currency ? { style: "currency", currency: "USD" } : {}),
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      }),
    );
  }
  return chosenPlaces.get(key);
}

/**
 * Format a number with a chart's chosen number type and decimal places:
 * "usd" → "$1,235", "percent" → "12.35%" (the value is already in percent
 * units), "number" → "1,234.5". "raw" leaves the number as it is ("40000"),
 * which is how charts show whole-number counts when no type is chosen.
 */
export function formatNumber(value, { type = "number", decimalPlaces = 0 } = {}) {
  if (isMissing(value)) return MISSING;
  if (type === "raw") return String(value);
  if (type === "usd") return fixedPlaces(decimalPlaces, true).format(value);
  const text = fixedPlaces(decimalPlaces).format(value);
  return type === "percent" ? `${text}%` : text;
}

const tableNumber = new Intl.NumberFormat("en-US");

/**
 * A number as the View Data table shows it ("50,000", up to three decimals).
 * Chart tooltips use the same text, so hovering a point and reading the table
 * never disagree.
 */
export function formatTableNumber(value) {
  return isMissing(value) || !Number.isFinite(Number(value))
    ? MISSING
    : tableNumber.format(Number(value));
}

/** The words the View Data table shows in place of a value it does not have. */
export function unavailableValueText(status) {
  return status === "suppressed" ? "Suppressed" : "Not available";
}

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
