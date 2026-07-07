/**
 * columnTypes.js — column type detection and coercion for inline tables:
 * text | number | date, with locale-aware thousands/decimal handling.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   COLUMN_TYPES                — { TEXT:"text", NUMBER:"number", DATE:"date" }
 *   inferColumnType(values)      — majority-vote inference with confidence;
 *                                  ties resolve to text (never guess numeric)
 *   coerceColumn(values, type, {locale}) — returns { values, failures } where
 *                                  failures carry row indexes for red-grading
 *   parseNumber(text, locale)    — "1,234.5" / "1.234,5" / "45%" / "$1,200"
 *   parseDateToken(text)         — years, YYYY-MM, quarters, ISO dates
 *
 * Data sources:
 *   - none (pure functions)
 */

export const COLUMN_TYPES = Object.freeze({
  TEXT: "text",
  NUMBER: "number",
  DATE: "date",
});

const CURRENCY_SYMBOLS = /[$€£¥]/g;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{1,2})$/;
const YEAR_RE = /^(\d{4})$/;
const QUARTER_YEAR_FIRST_RE = /^(\d{4})[\s,-]*[Qq]([1-4])$/;
const QUARTER_Q_FIRST_RE = /^[Qq]([1-4])[\s,-]*(\d{4})$/;

function isBlank(raw) {
  return raw == null || String(raw).trim() === "";
}

/** Strip currency symbols and surrounding whitespace before numeric parsing. */
function stripDecoration(text) {
  return String(text).trim().replace(CURRENCY_SYMBOLS, "").trim();
}

/**
 * Parse a numeric-looking string under a locale's separator convention.
 * "en" (default): thousands="," decimal="."; "eu": thousands="." decimal=",".
 * Currency symbols ("$1,200") and a trailing percent sign ("45%") are
 * stripped — the returned value is the cell's numeric magnitude, not a
 * fraction (percent formatting, if any, belongs on the column, not the
 * value). Accounting-style negatives ("(12.5)") are supported. Returns null
 * (never NaN/Infinity) when the text doesn't parse as a number.
 */
export function parseNumber(text, locale = "en") {
  if (isBlank(text)) return null;
  let trimmed = stripDecoration(text);
  if (trimmed.endsWith("%")) trimmed = trimmed.slice(0, -1).trim();
  if (trimmed === "") return null;

  let negative = false;
  let core = trimmed;
  if (/^\(.*\)$/.test(core)) {
    negative = true;
    core = core.slice(1, -1).trim();
  }
  if (core.startsWith("-")) {
    negative = true;
    core = core.slice(1);
  } else if (core.startsWith("+")) {
    core = core.slice(1);
  }
  if (core === "" || !/^[0-9.,]+$/.test(core)) return null;

  const normalized =
    locale === "eu" ? core.replace(/\./g, "").replace(",", ".") : core.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Parse a date-shaped token: a bare 4-digit year, "YYYY-MM", a quarter
 * ("2020 Q1" / "Q1 2020", with or without a separating dash/comma), or an
 * ISO calendar date ("YYYY-MM-DD", optionally with a time part). Returns
 * null when the text matches none of these. `value` is a sortable numeric
 * key (a fractional year for month/quarter granularity, epoch ms for ISO
 * dates); `label` is a normalized display string.
 */
export function parseDateToken(text) {
  if (isBlank(text)) return null;
  const trimmed = String(text).trim();

  let match = ISO_DATE_RE.exec(trimmed);
  if (match) {
    const [, y, m, d] = match;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    return {
      kind: "iso",
      year,
      month,
      day,
      value: Date.UTC(year, month - 1, day),
      label: `${y}-${m}-${d}`,
    };
  }

  match = YEAR_MONTH_RE.exec(trimmed);
  if (match) {
    const [, y, m] = match;
    const year = Number(y);
    const month = Number(m);
    if (month < 1 || month > 12) return null;
    return {
      kind: "yearMonth",
      year,
      month,
      value: year + (month - 1) / 12,
      label: `${y}-${String(month).padStart(2, "0")}`,
    };
  }

  match = QUARTER_YEAR_FIRST_RE.exec(trimmed) || QUARTER_Q_FIRST_RE.exec(trimmed);
  if (match) {
    const isYearFirst = QUARTER_YEAR_FIRST_RE.test(trimmed);
    const year = Number(isYearFirst ? match[1] : match[2]);
    const quarter = Number(isYearFirst ? match[2] : match[1]);
    return {
      kind: "quarter",
      year,
      quarter,
      value: year + (quarter - 1) / 4,
      label: `${year} Q${quarter}`,
    };
  }

  match = YEAR_RE.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    return { kind: "year", year, value: year, label: String(year) };
  }

  return null;
}

/**
 * Majority-vote type inference across a column's non-blank values. Each
 * value is tested independently against both `parseNumber` and
 * `parseDateToken` (a bare year like "2020" legitimately parses as both), so
 * a column whose values are ambiguous between two types produces a tie —
 * ties resolve to TEXT, never NUMBER, so an ambiguous column is never
 * silently mis-typed as numeric.
 */
export function inferColumnType(values = []) {
  const nonEmpty = values.filter((value) => !isBlank(value));
  if (!nonEmpty.length) return { type: COLUMN_TYPES.TEXT, confidence: 0 };

  let numberCount = 0;
  let dateCount = 0;
  for (const raw of nonEmpty) {
    if (parseNumber(raw) !== null) numberCount += 1;
    if (parseDateToken(raw) !== null) dateCount += 1;
  }
  const textCount = nonEmpty.filter(
    (raw) => parseNumber(raw) === null && parseDateToken(raw) === null,
  ).length;

  const counts = [
    { type: COLUMN_TYPES.NUMBER, count: numberCount },
    { type: COLUMN_TYPES.DATE, count: dateCount },
    { type: COLUMN_TYPES.TEXT, count: textCount },
  ];
  const max = Math.max(...counts.map((entry) => entry.count));
  const winners = counts.filter((entry) => entry.count === max);
  const type = winners.length > 1 ? COLUMN_TYPES.TEXT : winners[0].type;
  return { type, confidence: max / nonEmpty.length };
}

/**
 * Coerce a column's raw cell strings to a declared type. Blank cells coerce
 * to null without being counted as failures (they grade EMPTY, not
 * MALFORMED — see tableChecker.js). A "date" cell coerces to its
 * `parseDateToken(...).value` (a sortable number); a "number" cell to
 * `parseNumber(...)`; a "text" cell to a trimmed string (text never fails).
 * `failures` lists the row indexes whose non-blank cell could not coerce.
 */
export function coerceColumn(values = [], type = COLUMN_TYPES.TEXT, { locale = "en" } = {}) {
  const failures = [];
  const coerced = values.map((raw, index) => {
    if (isBlank(raw)) return null;
    if (type === COLUMN_TYPES.NUMBER) {
      const value = parseNumber(raw, locale);
      if (value === null) failures.push(index);
      return value;
    }
    if (type === COLUMN_TYPES.DATE) {
      const token = parseDateToken(raw);
      if (!token) {
        failures.push(index);
        return null;
      }
      return token.value;
    }
    return String(raw).trim();
  });
  return { values: coerced, failures };
}
