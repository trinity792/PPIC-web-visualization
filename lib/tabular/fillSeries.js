/**
 * fillSeries.js — what the fill handle writes past the cells it is dragged
 * from (spreadsheet grid plan, workstream 4).
 *
 * `extendSeries(cells, count, options)` reads the source cells in grid order
 * (top to bottom, or left to right) and returns the next `count` cell texts
 * in the order they are filled, outward from the source:
 *
 *   - two or more numbers with a constant step continue the step;
 *   - one number is copied, or counts by one with `option` (Option-drag);
 *   - dates with a constant step (days, months, quarters, years, school and
 *     fiscal years) continue in their unit, written in the source's format;
 *   - text ending in a number ("Wave 1") counts up;
 *   - formulas move their relative references with each copy;
 *   - anything else repeats the source pattern.
 *
 * Filling up or left extends the series backward.
 *
 * Adapted from Fortune-sheet (MIT, https://github.com/ruilisi/fortune-sheet):
 * series detection from its drop-cell module (`createDropCellRange`,
 * `updateDropCell`).
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   extendSeries(cells, count, { direction, columnOptions, option })
 *
 * Data sources:
 *   - lib/tabular/columnTypes.js (reading numbers and dates)
 *   - lib/tabular/formulas.js (moving references)
 */

import { parseDateToken, parseNumber } from "./columnTypes";
import { fillFormula, isFormula } from "./formulas";

const BACKWARD = new Set(["up", "left"]);
const STEP_TOLERANCE = 1e-9;

/** The common step of a list of numbers, or null when it is not constant. */
function constantStep(values) {
  if (values.length < 2) return null;
  const step = values[1] - values[0];
  for (let index = 2; index < values.length; index += 1) {
    if (Math.abs(values[index] - values[index - 1] - step) > STEP_TOLERANCE * Math.max(1, Math.abs(step))) return null;
  }
  return step;
}

// ── Numbers ──────────────────────────────────────────────────────────

// A plain number, optionally with a currency sign before it or a percent sign after.
const NUMBER_SHAPE = /^([$€£¥]?)\s*([-+−]?[\d.,\s\u00a0]*\d)\s*(%?)$/;

/** The cells as numbers with a shared prefix and suffix, or null. */
function readNumbers(cells, locale) {
  const read = [];
  for (const cell of cells) {
    const match = NUMBER_SHAPE.exec(String(cell).trim());
    const value = match ? parseNumber(match[2], locale) : null;
    if (value === null) return null;
    read.push({ value, prefix: match[1], suffix: match[3], body: match[2] });
  }
  const { prefix, suffix } = read[0];
  if (read.some((cell) => cell.prefix !== prefix || cell.suffix !== suffix)) return null;
  const decimalMark = locale === "eu" ? "," : ".";
  const decimals = Math.max(...read.map(({ body }) => (body.includes(decimalMark) ? body.split(decimalMark).pop().length : 0)));
  return { values: read.map((cell) => cell.value), prefix, suffix, decimals };
}

function writeNumber(value, { prefix, suffix, decimals }, locale) {
  const rounded = Number(value.toPrecision(12));
  let text = decimals > 0 ? rounded.toFixed(decimals) : String(rounded);
  if (locale === "eu") text = text.replace(".", ",");
  return `${prefix}${text}${suffix}`;
}

// ── Dates ────────────────────────────────────────────────────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Match a name's capitalization to the source's ("NOV", "nov", "Nov"). */
function caseLike(source, name) {
  if (source === source.toUpperCase()) return name.toUpperCase();
  if (source === source.toLowerCase()) return name.toLowerCase();
  return name;
}

/**
 * A writer for dates shaped like `text`: given an ordinal in the token's unit
 * (days since 1970, months, quarters, or years), the cell text. Null when the
 * shape is not one this module writes.
 */
function dateWriter(text, token, dateOrder) {
  const trimmed = String(text).trim();
  let match;
  if (token.granularity === "day") {
    const fromDays = (days) => {
      const date = new Date(days * 86_400_000);
      return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return (days) => {
        const { y, m, d } = fromDays(days);
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      };
    }
    match = /^(\d{1,2})\/(\d{1,2})\/\d{4}$/.exec(trimmed);
    if (match) {
      const padded = match[1].length === 2 && match[2].length === 2;
      const two = (n) => (padded ? String(n).padStart(2, "0") : String(n));
      const dayFirst = token.day === Number(match[1]) && (token.month !== Number(match[1]) || dateOrder === "dmy");
      return (days) => {
        const { y, m, d } = fromDays(days);
        return dayFirst ? `${two(d)}/${two(m)}/${y}` : `${two(m)}/${two(d)}/${y}`;
      };
    }
    return null;
  }
  if (token.granularity === "month") {
    const split = (ordinal) => ({ y: Math.floor(ordinal / 12), m: (ordinal % 12) + 1 });
    match = /^\d{4}([-/])(\d{1,2})$/.exec(trimmed);
    if (match) {
      const [, separator, month] = match;
      return (ordinal) => {
        const { y, m } = split(ordinal);
        return `${y}${separator}${month.length === 2 ? String(m).padStart(2, "0") : m}`;
      };
    }
    const nameOf = (name, m) => {
      const long = name.replace(/\.$/, "").length > 3 && MONTH_LONG.some((full) => full.toLowerCase() === name.toLowerCase());
      return caseLike(name, (long ? MONTH_LONG : MONTH_SHORT)[m - 1]);
    };
    match = /^([A-Za-z]{3,9})(\.?)([\s,-]+)(\d{4})$/.exec(trimmed);
    if (match) {
      const [, name, dot, separator] = match;
      return (ordinal) => {
        const { y, m } = split(ordinal);
        return `${nameOf(name, m)}${dot}${separator}${y}`;
      };
    }
    match = /^(\d{4})([\s,-]+)([A-Za-z]{3,9})(\.?)$/.exec(trimmed);
    if (match) {
      const [, , separator, name, dot] = match;
      return (ordinal) => {
        const { y, m } = split(ordinal);
        return `${y}${separator}${nameOf(name, m)}${dot}`;
      };
    }
    return null;
  }
  if (token.granularity === "quarter") {
    const split = (ordinal) => ({ y: Math.floor(ordinal / 4), q: (ordinal % 4) + 1 });
    match = /^(\d{4})([\s,-]*)([Qq])[1-4]$/.exec(trimmed);
    if (match) {
      const [, , separator, letter] = match;
      return (ordinal) => {
        const { y, q } = split(ordinal);
        return `${y}${separator}${letter}${q}`;
      };
    }
    match = /^([Qq])[1-4]([\s,-]*)(\d{4})$/.exec(trimmed);
    if (match) {
      const [, letter, separator] = match;
      return (ordinal) => {
        const { y, q } = split(ordinal);
        return `${letter}${q}${separator}${y}`;
      };
    }
    return null;
  }
  if (token.granularity === "year") return (year) => String(year);
  if (token.granularity === "span") {
    match = /^(FY\s*)(\d{4})$/i.exec(trimmed);
    if (match) return (start) => `${match[1]}${start + 1}`;
    match = /^(FY\s*)?(\d{4})(\s*[-/–]\s*)(\d{2}|\d{4})$/i.exec(trimmed);
    if (match) {
      const [, prefix = "", , separator, end] = match;
      return (start) => `${prefix}${start}${separator}${end.length === 2 ? String((start + 1) % 100).padStart(2, "0") : start + 1}`;
    }
  }
  return null;
}

/** A date token's place in its own unit, so a constant step can be read. */
function dateOrdinal(token) {
  switch (token.granularity) {
    case "day": return Math.round(token.value / 86_400_000);
    case "month": return token.year * 12 + token.month - 1;
    case "quarter": return token.year * 4 + token.quarter - 1;
    default: return token.year;
  }
}

/** The cells as dates of one unit and shape, or null. */
function readDates(cells, columnOptions = {}) {
  const attempt = (options) => {
    const tokens = cells.map((cell) => parseDateToken(cell, options));
    if (tokens.some((token) => !token)) return null;
    if (tokens.some((token) => token.granularity !== tokens[0].granularity)) return null;
    return tokens;
  };
  const options = { dateOrder: columnOptions.dateOrder, spans: columnOptions.spans };
  const tokens = attempt(options) || (options.spans ? null : attempt({ ...options, spans: true }));
  if (!tokens) return null;
  const write = dateWriter(cells.at(-1), tokens.at(-1), columnOptions.dateOrder);
  if (!write) return null;
  return { ordinals: tokens.map(dateOrdinal), write };
}

// ── Text ending in a number ──────────────────────────────────────────

const COUNTED_TEXT = /^(.*\D)(\d+)$/;

function readCountedText(cells) {
  const read = cells.map((cell) => COUNTED_TEXT.exec(String(cell)));
  if (read.some((match) => !match) || read.some((match) => match[1] !== read[0][1])) return null;
  return {
    prefix: read[0][1],
    values: read.map((match) => Number(match[2])),
    width: read.at(-1)[2].startsWith("0") ? read.at(-1)[2].length : 0,
  };
}

// ── The series ───────────────────────────────────────────────────────

/** `count` values continuing `values` (in fill order) by `step`. */
const continued = (values, step, count) => Array.from({ length: count }, (_, k) => values.at(-1) + step * (k + 1));

/**
 * The next `count` cells past `cells` when filling in `direction` ("down",
 * "up", "right", or "left"). `columnOptions` is the column's type and
 * convention ({ type, locale, dateOrder, spans }); `option` makes one number
 * or date count instead of copying.
 */
export function extendSeries(cells, count, { direction = "down", columnOptions = {}, option = false } = {}) {
  if (!cells.length || count <= 0) return [];
  const backward = BACKWARD.has(direction);
  const sign = backward ? -1 : 1;
  // The source in fill order: nearest the filled cells last.
  const source = backward ? [...cells].reverse() : [...cells];
  const texts = source.map((cell) => String(cell ?? ""));
  const repeat = () => Array.from({ length: count }, (_, k) => texts[k % texts.length]);

  if (texts.some(isFormula)) {
    const vertical = direction === "down" || direction === "up";
    return Array.from({ length: count }, (_, k) => {
      const text = texts[k % texts.length];
      if (!isFormula(text)) return text;
      const distance = (texts.length + k - (k % texts.length)) * sign;
      return fillFormula(text, { row: 0, col: 0 }, vertical ? { row: distance, col: 0 } : { row: 0, col: distance });
    });
  }
  if (texts.some((text) => text.trim() === "")) return repeat();

  const locale = columnOptions.locale || "en";
  const tryDates = () => {
    const dates = readDates(texts, columnOptions);
    if (!dates) return null;
    const step = texts.length === 1 ? (option ? sign : 0) : constantStep(dates.ordinals);
    return step === null ? null : continued(dates.ordinals, step, count).map(dates.write);
  };
  const tryNumbers = () => {
    const numbers = readNumbers(texts, locale);
    if (!numbers) return null;
    const step = texts.length === 1 ? (option ? sign : 0) : constantStep(numbers.values);
    return step === null ? null : continued(numbers.values, step, count).map((value) => writeNumber(value, numbers, locale));
  };
  const series = columnOptions.type === "date" ? tryDates() ?? tryNumbers() : tryNumbers() ?? tryDates();
  if (series) return series;

  const counted = readCountedText(texts);
  if (counted) {
    const step = texts.length === 1 ? sign : constantStep(counted.values);
    if (step !== null) {
      return continued(counted.values, step, count).map(
        (value) => `${counted.prefix}${String(Math.abs(value)).padStart(counted.width, "0")}`,
      );
    }
  }
  return repeat();
}
