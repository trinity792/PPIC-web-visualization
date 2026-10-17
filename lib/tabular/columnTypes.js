/**
 * columnTypes.js — column type detection and coercion for inline tables:
 * text | group | number | date, with locale-aware thousands/decimal handling,
 * plus the per-column profile the Visualization Tool reads (dataset-range
 * plan, workstreams 1-3): a number column's unit, decimals, and separator
 * convention, and a date column's granularity and day/month order.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   COLUMN_TYPES                — { TEXT:"text", GROUP:"group", NUMBER:"number",
 *                                  DATE:"date" }
 *   cellToken(raw)              — "missing" | "suppressed" | null: placeholder
 *                                  cells ("n/a", "(D)") that hold no value
 *   inferColumnType(values, {columnName}) — header-aware majority-vote inference;
 *                                  exact Group/Category headers select group,
 *                                  temporal headers resolve date/number ties
 *                                  to dates; other ties resolve to text. Number columns
 *                                  also report { unit, decimals, locale }; date
 *                                  columns { granularity, dateOrder?, spans?,
 *                                  findings? }
 *   coerceColumn(values, type, options) — returns { values, failures, footnotes }
 *                                  where failures carry row indexes for
 *                                  red-grading and footnotes the marked cells
 *   columnParseOptions(column)  — the { locale, dateOrder, spans } a column's
 *                                  cells are read with
 *   parseNumber(text, locale)    — "1,234.5" / "1.234,5" / "45%" / "$1,200" /
 *                                  "12.3*" / "−5" / "1 234"
 *   parseDateToken(text, options) — years, YYYY-MM, quarters, ISO and slash
 *                                  dates, month names, fiscal and school years;
 *                                  each with a decimal-year `position` and a
 *                                  `granularity`
 *   rowShares(table, columns)    — whether the columns are parts of a whole
 *                                  (rows add up to 100, or to 1)
 *   profileColumns(table)        — every column typed and profiled, keeping a
 *                                  reader's forced type and Format choice
 *   chartableTable(table)        — the table without ignored columns and marked rows
 *
 * Data sources:
 *   - none (pure functions)
 */

export const COLUMN_TYPES = Object.freeze({
  TEXT: "text",
  GROUP: "group",
  NUMBER: "number",
  DATE: "date",
});

export const DATE_ORDERS = Object.freeze([
  { value: "auto", label: "Automatic (month first when unclear)" },
  { value: "mdy", label: "Month / day / year" },
  { value: "dmy", label: "Day / month / year" },
]);

const CURRENCY_SYMBOLS = /[$€£¥]/g;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
const YEAR_MONTH_RE = /^(\d{4})[-/](\d{1,2})$/;
const YEAR_RE = /^(\d{4})$/;
const TEMPORAL_HEADER_RE = /^(?:(?:calendar|fiscal|school|academic|reporting|survey|reference|observation|start|end)[\s_-]+)?(?:years?|date|time|period|quarter|month)$/;
const QUARTER_YEAR_FIRST_RE = /^(\d{4})[\s,-]*[Qq]([1-4])$/;
const QUARTER_Q_FIRST_RE = /^[Qq]([1-4])[\s,-]*(\d{4})$/;
export const SLASH_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const MONTH_YEAR_RE = /^([A-Za-z]{3,9})\.?[\s,-]+(\d{4})$/;
const YEAR_MONTH_NAME_RE = /^(\d{4})[\s,-]+([A-Za-z]{3,9})\.?$/;
// "2019-20", "2019-2020", "2019/20": a school or fiscal year when the second
// part is the year after the first.
const SPAN_RE = /^(\d{4})\s*[-/–]\s*(\d{2}|\d{4})$/;
const FISCAL_RE = /^FY\s*(\d{4})(?:\s*[-/–]\s*(\d{2}|\d{4}))?$/i;

const MONTH_NAMES = Object.freeze([
  ["jan", "january"], ["feb", "february"], ["mar", "march"], ["apr", "april"],
  ["may"], ["jun", "june"], ["jul", "july"], ["aug", "august"],
  ["sep", "sept", "september"], ["oct", "october"], ["nov", "november"], ["dec", "december"],
]);
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Finest last: a column's granularity is the finest any of its cells uses.
const GRANULARITY_ORDER = Object.freeze(["year", "span", "quarter", "month", "day"]);

// Placeholders a published table uses for "no value". Missing means there is
// nothing to report; suppressed means a value exists but is withheld (Census
// "(D)", "(X)"). Compared trimmed and lowercased.
const MISSING_TOKENS = new Set(["", "n/a", "na", "-", "–", "—", "..", "...", "null", "none"]);
const SUPPRESSED_TOKENS = new Set(["(d)", "(x)", "(s)", "*", "**", "suppressed"]);

// A trailing footnote mark after a number: "12.3*", "12.3†", "12.3 (r)".
const FOOTNOTE_RE = /\s*(\*+|†+|‡+|\([A-Za-z]{1,2}\))$/;
// Spaces used as thousands separators: plain, non-breaking, thin, narrow.
const SPACE_SEPARATOR_RE = /(\d)[ \u00a0\u2009\u202f](?=\d{3}(?:\D|$))/g;

const EN_NUMBER_RE = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const EU_NUMBER_RE = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;

function isBlank(raw) {
  return raw == null || String(raw).trim() === "";
}

/** "missing" or "suppressed" for a placeholder cell, else null. Blank is missing. */
export function cellToken(raw) {
  if (isBlank(raw)) return "missing";
  const text = String(raw).trim().toLowerCase();
  if (MISSING_TOKENS.has(text)) return "missing";
  if (SUPPRESSED_TOKENS.has(text)) return "suppressed";
  return null;
}

/**
 * A number cell's value, footnote mark, and shown decimal places, or null.
 * Currency symbols, a trailing percent sign, a footnote mark, a Unicode minus,
 * a leading plus, and space thousands separators are all decoration.
 */
function readNumber(text, locale = "en") {
  if (cellToken(text)) return null;
  let trimmed = String(text).trim();
  let mark = null;
  const footnote = FOOTNOTE_RE.exec(trimmed);
  if (footnote && footnote.index > 0) {
    mark = footnote[1];
    trimmed = trimmed.slice(0, footnote.index).trim();
  }
  trimmed = trimmed
    .replace(/−/g, "-")
    .replace(CURRENCY_SYMBOLS, "")
    .replace(SPACE_SEPARATOR_RE, "$1")
    .trim();
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
  core = core.trim();
  const pattern = locale === "eu" ? EU_NUMBER_RE : EN_NUMBER_RE;
  if (!pattern.test(core)) return null;

  const decimalMark = locale === "eu" ? "," : ".";
  const [whole, fraction = ""] = core.split(decimalMark);
  const normalized = `${whole.replace(/[.,]/g, "")}${fraction ? `.${fraction}` : ""}`;
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, mark, decimals: fraction.length };
}

/**
 * Parse a numeric-looking string under a locale's separator convention.
 * "en" (default): thousands="," decimal="."; "eu": thousands="." decimal=",".
 * Currency symbols ("$1,200") and a trailing percent sign ("45%") are
 * stripped — the returned value is the cell's numeric magnitude, not a
 * fraction (percent formatting, if any, belongs on the column, not the
 * value). Accounting-style negatives ("(12.5)") are supported, as are a
 * trailing footnote mark ("12.3*", "12.3 (r)"), a Unicode minus, a leading
 * plus, and spaces as thousands separators. Placeholder cells ("n/a", "(D)")
 * are not numbers. Returns null (never NaN/Infinity) when the text doesn't
 * parse as a number.
 */
export function parseNumber(text, locale = "en") {
  return readNumber(text, locale)?.value ?? null;
}

function monthIndex(name) {
  const lower = String(name).toLowerCase();
  const index = MONTH_NAMES.findIndex((names) => names.includes(lower));
  return index >= 0 ? index + 1 : null;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A calendar day as a decimal year: Jan 1 is the year itself. */
function dayPosition(year, month, day) {
  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000;
  return year + dayOfYear / (isLeapYear(year) ? 366 : 365);
}

function dayToken(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return {
    kind: "iso",
    year,
    month,
    day,
    value: Date.UTC(year, month - 1, day),
    label: `${year}-${mm}-${dd}`,
    position: dayPosition(year, month, day),
    granularity: "day",
  };
}

function monthToken(year, month, label) {
  if (month == null || month < 1 || month > 12) return null;
  const position = year + (month - 1) / 12;
  return {
    kind: "yearMonth",
    year,
    month,
    value: position,
    label: label ?? `${year}-${String(month).padStart(2, "0")}`,
    position,
    granularity: "month",
  };
}

/** A school or fiscal year starting in `start`, placed at July 1 of that year. */
function spanToken(start, label) {
  return {
    kind: "span",
    year: start,
    endYear: start + 1,
    value: start + 0.5,
    label,
    position: start + 0.5,
    granularity: "span",
  };
}

/** The year a two- or four-digit second part names, or null if it is not `start + 1`. */
function spanEnd(start, second) {
  const end = second.length === 2 ? Math.floor(start / 100) * 100 + Number(second) : Number(second);
  const next = start + 1;
  return end === next || (second.length === 2 && Number(second) === next % 100) ? next : null;
}

/**
 * Parse a date-shaped token. Reads a bare 4-digit year, "YYYY-MM" or
 * "YYYY/MM", a quarter ("2020 Q1" / "Q1 2020"), an ISO calendar date
 * ("YYYY-MM-DD", optionally with a time part), a slash date ("1/31/2020" or
 * "31/01/2020"), a month name with a year ("Jan 2020", "2020 January"), and a
 * school or fiscal year ("2019-20", "2019-2020", "FY2020", "FY 2019-20").
 * Returns null when the text matches none of these.
 *
 * `value` is a sortable numeric key (a fractional year for month/quarter
 * granularity, epoch ms for calendar dates); `label` is a normalized display
 * string; `position` places every kind on one decimal-year scale (a day's
 * fraction of its year, a month at (m - 1) / 12, a quarter at (q - 1) / 4, a
 * school or fiscal year at July 1 of its first year); `granularity` is year,
 * span, quarter, month, or day.
 *
 * Options, decided per column by `inferColumnType`: `dateOrder` ("mdy" or
 * "dmy") for slash dates whose parts are both 12 or less (month/day when
 * unset), and `spans` to read "2011-12" as a school year rather than a month.
 */
export function parseDateToken(text, { dateOrder, spans = false } = {}) {
  if (isBlank(text)) return null;
  const trimmed = String(text).trim();

  let match = ISO_DATE_RE.exec(trimmed);
  if (match) return dayToken(Number(match[1]), Number(match[2]), Number(match[3]));

  match = FISCAL_RE.exec(trimmed);
  if (match) {
    const first = Number(match[1]);
    if (!match[2]) return spanToken(first - 1, trimmed);
    return spanEnd(first, match[2]) ? spanToken(first, trimmed) : null;
  }

  match = SPAN_RE.exec(trimmed);
  if (match) {
    const start = Number(match[1]);
    const end = spanEnd(start, match[2]);
    const asMonth = match[2].length <= 2 && Number(match[2]) >= 1 && Number(match[2]) <= 12;
    if (end && (spans || !asMonth)) return spanToken(start, trimmed);
  }

  match = YEAR_MONTH_RE.exec(trimmed);
  if (match) return monthToken(Number(match[1]), Number(match[2]));

  match = QUARTER_YEAR_FIRST_RE.exec(trimmed) || QUARTER_Q_FIRST_RE.exec(trimmed);
  if (match) {
    const isYearFirst = QUARTER_YEAR_FIRST_RE.test(trimmed);
    const year = Number(isYearFirst ? match[1] : match[2]);
    const quarter = Number(isYearFirst ? match[2] : match[1]);
    const position = year + (quarter - 1) / 4;
    return {
      kind: "quarter",
      year,
      quarter,
      value: position,
      label: `${year} Q${quarter}`,
      position,
      granularity: "quarter",
    };
  }

  match = MONTH_YEAR_RE.exec(trimmed);
  if (match) {
    const month = monthIndex(match[1]);
    const year = Number(match[2]);
    return month ? monthToken(year, month, `${MONTH_LABELS[month - 1]} ${year}`) : null;
  }
  match = YEAR_MONTH_NAME_RE.exec(trimmed);
  if (match) {
    const month = monthIndex(match[2]);
    const year = Number(match[1]);
    return month ? monthToken(year, month, `${MONTH_LABELS[month - 1]} ${year}`) : null;
  }

  match = SLASH_DATE_RE.exec(trimmed);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const order = dateOrder || (first > 12 ? "dmy" : "mdy");
    const [month, day] = order === "dmy" ? [second, first] : [first, second];
    // Match spreadsheet date conventions: 00–29 are 2000–2029; 30–99
    // are 1930–1999. Four-digit years are kept exactly as supplied.
    const shortYear = Number(match[3]);
    const year = match[3].length === 2 ? shortYear + (shortYear < 30 ? 2000 : 1900) : shortYear;
    return dayToken(year, month, day);
  }

  match = YEAR_RE.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    return { kind: "year", year, value: year, label: String(year), position: year, granularity: "year" };
  }

  return null;
}

/** The finest granularity among parsed date tokens. */
function finestGranularity(tokens) {
  return tokens.reduce(
    (finest, token) =>
      GRANULARITY_ORDER.indexOf(token.granularity) > GRANULARITY_ORDER.indexOf(finest)
        ? token.granularity
        : finest,
    "year",
  );
}

/**
 * Slash dates are read in one order per column: day/month if any first part
 * is above 12, month/day if any second part is, else month/day as US
 * spreadsheets write them, with a finding so the Check panel can say so.
 */
function slashDateOrder(values) {
  const parts = values.map((value) => SLASH_DATE_RE.exec(String(value).trim())).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((match) => Number(match[1]) > 12)) return { dateOrder: "dmy" };
  if (parts.some((match) => Number(match[2]) > 12)) return { dateOrder: "mdy" };
  return {
    dateOrder: "mdy",
    findings: [
      {
        code: "dateOrderAmbiguous",
        message:
          "Dates like 03/04/2020 could be month/day or day/month; they are read as month/day.",
      },
    ],
  };
}

/** Every value is "YYYY-YY" with consecutive years: a column of school years. */
function isSpanColumn(values) {
  return values.length > 0 && values.every((value) => {
    const match = SPAN_RE.exec(String(value).trim());
    return Boolean(match && spanEnd(Number(match[1]), match[2]));
  });
}

/** A number column's unit: percent and dollar signs on the cells, then the header. */
function numberUnit(values, columnName) {
  const share = (pattern) => values.filter((value) => pattern.test(String(value))).length / values.length;
  if (share(/%\s*(\*+|†+|‡+|\([A-Za-z]{1,2}\))?\s*$/) >= 0.8) return "percent";
  if (share(/\$/) >= 0.8) return "usd";
  const header = String(columnName || "").toLowerCase();
  if (/%|\bpercent|\bpct\b|\bshare\b/.test(header)) return "percent";
  return "number";
}

/** The median count of decimal places the cells show. */
function medianDecimals(values, locale) {
  const counts = values
    .map((value) => readNumber(value, locale)?.decimals)
    .filter((count) => count != null)
    .sort((a, b) => a - b);
  return counts.length ? counts[Math.floor(counts.length / 2)] : 0;
}

/**
 * Majority-vote type inference across a column's filled values. Each value
 * is tested independently against both `parseNumber` and `parseDateToken` (a
 * bare year like "2020" legitimately parses as both), so a column whose
 * values are ambiguous between two types produces a tie. A temporal header
 * such as "Year" resolves a number/date tie to DATE; other ties resolve to
 * TEXT, so numeric identifiers are not silently treated as time. Placeholder
 * cells ("n/a", "(D)") never vote.
 *
 * A number column also reports its `unit` ("percent", "usd", or "number"),
 * the median `decimals` its cells show, and its separator `locale` ("en" or
 * "eu", whichever reads more cells). A date column reports its finest
 * `granularity`, and, where they apply, its slash-date `dateOrder`, `spans`
 * for a school-year column, and `findings` for the Check panel. The options
 * `locale` ("en" | "eu") and `dateOrder` ("mdy" | "dmy") fix those
 * conventions instead of inferring them (the Import settings).
 */
export function inferColumnType(values = [], { columnName, locale: forcedLocale, dateOrder: forcedOrder } = {}) {
  const normalizedName = String(columnName || "").trim().toLowerCase();
  if (normalizedName === "group" || normalizedName === "category") {
    return { type: COLUMN_TYPES.GROUP, confidence: 1 };
  }
  const filled = values.filter((value) => !cellToken(value));
  if (!filled.length) return { type: COLUMN_TYPES.TEXT, confidence: 0 };

  const enCount = filled.filter((raw) => parseNumber(raw, "en") !== null).length;
  const euCount = filled.filter((raw) => parseNumber(raw, "eu") !== null).length;
  // Import settings can fix the conventions instead of voting on them.
  const locale = forcedLocale || (euCount > enCount ? "eu" : "en");
  const slash = forcedOrder
    ? (filled.some((value) => SLASH_DATE_RE.test(String(value).trim())) ? { dateOrder: forcedOrder } : null)
    : slashDateOrder(filled);
  const dateOptions = {
    ...(slash ? { dateOrder: slash.dateOrder } : {}),
    ...(isSpanColumn(filled) ? { spans: true } : {}),
  };

  const tokens = filled.map((raw) => parseDateToken(raw, dateOptions));
  const numberCount = forcedLocale ? (forcedLocale === "eu" ? euCount : enCount) : Math.max(enCount, euCount);
  const dateCount = tokens.filter(Boolean).length;
  const textCount = filled.filter(
    (raw, index) => parseNumber(raw, locale) === null && tokens[index] === null,
  ).length;

  const counts = [
    { type: COLUMN_TYPES.NUMBER, count: numberCount },
    { type: COLUMN_TYPES.DATE, count: dateCount },
    { type: COLUMN_TYPES.TEXT, count: textCount },
  ];
  const max = Math.max(...counts.map((entry) => entry.count));
  const winners = counts.filter((entry) => entry.count === max);
  const temporalTie = winners.length > 1 && dateCount === max && dateCount > textCount && TEMPORAL_HEADER_RE.test(normalizedName);
  const type = temporalTie ? COLUMN_TYPES.DATE : winners.length > 1 ? COLUMN_TYPES.TEXT : winners[0].type;
  const result = { type, confidence: max / filled.length };

  if (type === COLUMN_TYPES.NUMBER) {
    return {
      ...result,
      unit: numberUnit(filled, columnName),
      decimals: medianDecimals(filled, locale),
      locale,
    };
  }
  if (type === COLUMN_TYPES.DATE) {
    return {
      ...result,
      granularity: finestGranularity(tokens.filter(Boolean)),
      ...dateOptions,
      ...(slash?.findings ? { findings: slash.findings } : {}),
    };
  }
  return result;
}

/** The options a column's cells are read with: its number convention and date reading. */
export function columnParseOptions(column = {}) {
  return {
    locale: column.locale || column.format?.locale || "en",
    ...(column.dateOrder ? { dateOrder: column.dateOrder } : {}),
    ...(column.spans ? { spans: true } : {}),
  };
}

/**
 * Coerce a column's raw cell strings to a declared type. Blank and
 * placeholder cells coerce to null without being counted as failures (they
 * grade EMPTY or SUPPRESSED, not MALFORMED — see tableChecker.js). A "date"
 * cell coerces to its `parseDateToken(...).value` (a sortable number); a
 * "number" cell to `parseNumber(...)`; a "text" or "group" cell to a trimmed
 * string (neither string type ever fails). Group is deliberately manual-only:
 * inference above still returns only text, number, or date.
 * `failures` lists the row indexes whose filled cell could not coerce;
 * `footnotes` lists number cells that carried a footnote mark ({ row, mark }).
 * Options are a column profile's: `locale`, `dateOrder`, `spans`.
 */
export function coerceColumn(values = [], type = COLUMN_TYPES.TEXT, options = {}) {
  const { locale = "en", dateOrder, spans } = options || {};
  const failures = [];
  const footnotes = [];
  const coerced = values.map((raw, index) => {
    if (isBlank(raw)) return null;
    if (type === COLUMN_TYPES.NUMBER) {
      if (cellToken(raw)) return null;
      const number = readNumber(raw, locale);
      if (number === null) {
        failures.push(index);
        return null;
      }
      if (number.mark) footnotes.push({ row: index, mark: number.mark });
      return number.value;
    }
    if (type === COLUMN_TYPES.DATE) {
      if (cellToken(raw)) return null;
      const token = parseDateToken(raw, { dateOrder, spans });
      if (!token) {
        failures.push(index);
        return null;
      }
      return token.value;
    }
    return String(raw).trim();
  });
  return { values: coerced, failures, footnotes };
}

/**
 * Whether the named number columns are parts of a whole: at least 90% of the
 * rows that hold any of their values add up to 100 (within 1.5) or to 1
 * (within 0.015). A blank cell counts as zero, so a series that starts late
 * still adds up. Needs at least two of the columns to exist.
 */
export function rowShares(table, columns = []) {
  const all = table?.columns || [];
  const indexes = columns
    .map((name) => all.findIndex((column) => column.name === name))
    .filter((index) => index >= 0);
  if (indexes.length < 2) return false;
  let counted = 0;
  let hundreds = 0;
  let ones = 0;
  for (const row of table?.rows || []) {
    const values = indexes.map((index) => parseNumber(row?.[index], columnParseOptions(all[index]).locale));
    if (values.every((value) => value === null)) continue;
    counted += 1;
    const sum = values.reduce((total, value) => total + (value ?? 0), 0);
    if (Math.abs(sum - 100) <= 1.5) hundreds += 1;
    if (Math.abs(sum - 1) <= 0.015) ones += 1;
  }
  return counted > 0 && (hundreds / counted >= 0.9 || ones / counted >= 0.9);
}

// Fields a column profile sets; anything else on a column (its name, a
// reader's forced type, a hidden flag) is carried through untouched.
const PROFILE_FIELDS = Object.freeze(["unit", "decimals", "locale", "granularity", "dateOrder", "spans"]);

/**
 * Type and profile every column of a table from its cells. A type the reader
 * forced (`forced: true`) and a Format the reader chose (`unitForced: true`)
 * are kept; everything else is inferred again. When the number columns are
 * parts of a whole (`rowShares`), the plain-number ones are marked percent.
 *
 * @returns {Array} the table's columns, profiled
 */
export function profileColumns(table, { locale, dateOrder } = {}) {
  const rows = table?.rows || [];
  const options = table?.meta?.importOptions || {};
  locale = locale || (["en", "eu"].includes(options.locale) ? options.locale : undefined);
  dateOrder = dateOrder || (["mdy", "dmy"].includes(options.dateOrder) ? options.dateOrder : undefined);
  const columns = (table?.columns || []).map((column, index) => {
    const values = rows.map((row) => row?.[index] ?? "");
    const kept = Object.fromEntries(
      Object.entries(column).filter(([key]) => !PROFILE_FIELDS.includes(key) && key !== "type"),
    );
    const inferred = inferColumnType(values, { columnName: column.name, locale, dateOrder });
    const type = column.forced ? column.type : inferred.type;
    // A forced type is profiled as if it had been inferred, so a column the
    // reader retyped as a number still gets a unit and decimals.
    const profile = type === inferred.type
      ? inferred
      : type === COLUMN_TYPES.NUMBER
        ? numberProfileFor(values, column.name, locale)
        : {};
    const fields = Object.fromEntries(
      PROFILE_FIELDS.filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]]),
    );
    if (column.unitForced && type === COLUMN_TYPES.NUMBER) fields.unit = column.unit;
    if (type === COLUMN_TYPES.DATE && dateOrder) fields.dateOrder = dateOrder;
    return { ...kept, type, ...fields };
  });

  // Parts of a whole are judged on what a chart reads: ignored columns and
  // marked rows (a total, say) are left out.
  const shareable = columns
    .filter((column) => column.type === COLUMN_TYPES.NUMBER && ["number", "percent"].includes(column.unit) && !column.ignored)
    .map((column) => column.name);
  if (shareable.length >= 2 && rowShares(chartableTable({ columns, rows, rowMarks: table?.rowMarks }), shareable)) {
    return columns.map((column) =>
      shareable.includes(column.name) && column.unit === "number" && !column.unitForced
        ? { ...column, unit: "percent" }
        : column,
    );
  }
  return columns;
}

/** A number profile for cells read as numbers whatever the vote said. */
function numberProfileFor(values, columnName, forcedLocale) {
  const filled = values.filter((value) => !cellToken(value));
  const enCount = filled.filter((raw) => parseNumber(raw, "en") !== null).length;
  const euCount = filled.filter((raw) => parseNumber(raw, "eu") !== null).length;
  const locale = forcedLocale || (euCount > enCount ? "eu" : "en");
  return filled.length
    ? { unit: numberUnit(filled, columnName), decimals: medianDecimals(filled, locale), locale }
    : { unit: "number", decimals: 0, locale };
}

/**
 * The part of a table a chart may read (import overhaul, phase 1): without
 * columns the reader set to Ignore (`ignored: true`) and rows they marked
 * (`rowMarks`: excluded, total, or note). Both stay in the grid. A table with
 * nothing to leave out is returned as it is. The result carries no formulas
 * or row marks, because its positions no longer match the grid's.
 */
export function chartableTable(table) {
  const columns = table?.columns || [];
  const marks = table?.rowMarks || {};
  const keep = columns.map((column) => !column.ignored);
  const anyIgnored = keep.some((kept) => !kept);
  const anyMarked = Object.keys(marks).length > 0;
  if (!anyIgnored && !anyMarked) return table;
  const chartable = {
    ...table,
    columns: columns.filter((_, index) => keep[index]),
    rows: (table.rows || [])
      .filter((_, index) => !marks[index])
      .map((row) => (anyIgnored ? row.filter((_, index) => keep[index]) : row)),
  };
  delete chartable.formulas;
  delete chartable.rowMarks;
  return chartable;
}
