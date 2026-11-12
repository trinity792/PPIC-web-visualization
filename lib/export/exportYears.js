/**
 * exportYears.js — narrow an export table to the years a reader picked.
 *
 * Every data export (the chart's displayed table, a module's entire cleaned
 * dataset, or a bring-your-own-data table) is one { columns, rows } shape, but
 * each names and formats its time column differently: `Year` holds 2020,
 * Building Permits' `Date` holds "2010-01", RHNA's `Snapshot Date` holds
 * "2026-07-15", and the v3 display table calls it `Period`. These helpers find
 * that column and read the calendar year from the first four digits of each
 * value, so one year picker serves every export.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   yearOf(value)                         — the calendar year in a cell, or null
 *   temporalColumnNames(schema)           — a module's own time-column names
 *   yearColumnIndex(table, preferred)     — the table's year column, or -1
 *   tableYears(table, preferred)          — the sorted distinct years it holds
 *   filterTableByYears(table, years, preferred) — the rows in those years
 *
 * Data sources:
 *   - tables built by `lib/export/exportTable.js`; module schemas from
 *     `lib/visualization/moduleSchemas/`
 */

import { FIELD_KINDS } from "@/lib/visualization/fieldTypes";

/**
 * ======================================================================
 * Year column detection
 * ======================================================================
 */

// Tried after a module's own temporal fields, in this order. Names match
// without regard to case.
const FALLBACK_YEAR_COLUMNS = Object.freeze(["Year", "Period", "Date", "Snapshot Date"]);
// A bring-your-own-data table can name its time column anything; these words
// mark a likely one when no exact name matches.
const YEAR_NAME_PATTERN = /year|period|date/i;
const MIN_YEAR = 1000;
const MAX_YEAR = 9999;

/**
 * The calendar year a cell holds: an integer year (2020), or a string that
 * starts with one ("2020", "2010-01", "2026-07-15 12:00:00"). Anything else
 * (a range label like "10/15/2013 - 10/15/2021", a count, an empty cell) is
 * null, so a non-time column never passes for a year column.
 */
export function yearOf(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR ? value : null;
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})(?:$|[-/T ])/);
  return match ? Number(match[1]) : null;
}

/** A module schema's time-column names: its temporal fields first. */
export function temporalColumnNames(schema) {
  const names = Object.entries(schema?.fields || {})
    .filter(([, field]) => field?.kind === FIELD_KINDS.TEMPORAL)
    .map(([name]) => name);
  for (const name of [schema?.temporalColumn, schema?.temporalField]) {
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** True when every non-empty cell in the column reads as a year, and one does. */
function holdsYears(rows, index) {
  let found = false;
  for (const row of rows) {
    const cell = row?.[index];
    if (cell === null || cell === undefined || cell === "") continue;
    if (yearOf(cell) === null) return false;
    found = true;
  }
  return found;
}

/**
 * The index of the table's year column, or -1 when it has none. Exact names
 * win (the module's own temporal fields, then the shared fallbacks); a column
 * whose name merely mentions a year, period, or date is the last resort.
 */
export function yearColumnIndex(table, preferred = []) {
  const columns = table?.columns || [];
  const rows = table?.rows || [];
  const names = columns.map((col) => String(col?.name ?? "").toLowerCase());
  for (const candidate of [...preferred, ...FALLBACK_YEAR_COLUMNS]) {
    const index = names.indexOf(String(candidate).toLowerCase());
    if (index !== -1 && holdsYears(rows, index)) return index;
  }
  return names.findIndex((name, index) => YEAR_NAME_PATTERN.test(name) && holdsYears(rows, index));
}

/**
 * ======================================================================
 * Year listing and filtering
 * ======================================================================
 */

/** The distinct years in the table's year column, oldest first ([] if none). */
export function tableYears(table, preferred = []) {
  const index = yearColumnIndex(table, preferred);
  if (index === -1) return [];
  const years = new Set();
  for (const row of table.rows || []) {
    const year = yearOf(row?.[index]);
    if (year !== null) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * The table cut down to rows in `years`. `rows` and the export-only
 * `exportRows` (the v3 display table writes blanks there for unavailable
 * values) are filtered in step so the CSV and the workbook still agree.
 * Returns the table untouched when `years` is null (every year) or the table
 * has no year column; rows with an empty year cell are dropped otherwise.
 */
export function filterTableByYears(table, years, preferred = []) {
  if (!table || !years) return table;
  const index = yearColumnIndex(table, preferred);
  if (index === -1) return table;
  const keep = new Set(years);
  const kept = (table.rows || []).map((row) => keep.has(yearOf(row?.[index])));
  const narrowed = { ...table, rows: (table.rows || []).filter((_, i) => kept[i]) };
  if (Array.isArray(table.exportRows)) {
    narrowed.exportRows = table.exportRows.filter((_, i) => kept[i]);
  }
  return narrowed;
}
