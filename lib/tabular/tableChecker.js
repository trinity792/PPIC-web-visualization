/**
 * tableChecker.js — per-cell grading for the input table editor's colored
 * feedback: numbers green, text black, headings orange, malformed red,
 * empty gray.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Grade matrix shape: `gradeTable(table)` returns an array with one more row
 * than `table.rows` — `grades[0]` is the header row (one grade per column,
 * derived from the column name), and `grades[i]` (i>0) grades
 * `table.rows[i-1]`. This lets a caller zip the grade matrix directly against
 * the visual grid (header row + data rows) it renders.
 *
 * A column's data cells are graded against its DECLARED type
 * (`table.columns[c].type`), not a per-cell guess: a "date" column's
 * successfully-parsed cells grade as NUMBER (both are ordered/quantitative
 * values; there is no separate date color in the five-grade palette).
 * A cell also grades MALFORMED when its (row, column) pair appears in
 * `table.issues` (e.g. a derived-column formula failure — see
 * derivedColumns.js), even if the raw text would otherwise coerce cleanly.
 *
 * Exports:
 *   CELL_GRADES              — { NUMBER:"number", TEXT:"text", HEADING:
 *                              "heading", MALFORMED:"malformed", EMPTY:"empty" }
 *   gradeTable(table)        — grade matrix aligned to rows×columns, derived
 *                              from declared column types + coercion failures
 *   gradeSummary(grades)     — counts per grade for the panel's health strip
 *   GRADE_CLASSNAMES         — grade → Tailwind classes (green/black/orange/
 *                              red text, gray cell) so styling stays in one place
 *
 * Data sources:
 *   - none (pure functions over the inline-table shape)
 */

import { coerceColumn } from "./columnTypes";

export const CELL_GRADES = Object.freeze({
  NUMBER: "number",
  TEXT: "text",
  HEADING: "heading",
  MALFORMED: "malformed",
  EMPTY: "empty",
});

export const GRADE_CLASSNAMES = Object.freeze({
  [CELL_GRADES.NUMBER]: "text-emerald-700",
  [CELL_GRADES.TEXT]: "text-foreground",
  [CELL_GRADES.HEADING]: "text-orange-600 font-medium",
  [CELL_GRADES.MALFORMED]: "text-red-600 bg-red-50",
  [CELL_GRADES.EMPTY]: "bg-muted text-muted-foreground",
});

function issueKey(row, column) {
  return `${row}|${column}`;
}

function isBlank(raw) {
  return raw == null || String(raw).trim() === "";
}

export function gradeTable(table) {
  const columns = table?.columns || [];
  const rows = table?.rows || [];
  const issueSet = new Set(
    (table?.issues || []).map((issue) => issueKey(issue.row, issue.column)),
  );

  const headerGrades = columns.map((column) =>
    column?.name && String(column.name).trim() !== ""
      ? CELL_GRADES.HEADING
      : CELL_GRADES.EMPTY,
  );

  // Coerce once per column so grading and coercion never disagree with each
  // other about which cells fail.
  const columnFailures = columns.map((column, columnIndex) => {
    const values = rows.map((row) => row?.[columnIndex]);
    return new Set(
      coerceColumn(values, column?.type, { locale: column?.format?.locale }).failures,
    );
  });

  const bodyGrades = rows.map((row, rowIndex) =>
    columns.map((column, columnIndex) => {
      if (issueSet.has(issueKey(rowIndex, columnIndex))) return CELL_GRADES.MALFORMED;
      const raw = row?.[columnIndex];
      if (isBlank(raw)) return CELL_GRADES.EMPTY;
      if (columnFailures[columnIndex].has(rowIndex)) return CELL_GRADES.MALFORMED;
      return column?.type === "text" || column?.type === "group"
        ? CELL_GRADES.TEXT
        : CELL_GRADES.NUMBER;
    }),
  );

  return [headerGrades, ...bodyGrades];
}

/** Flat counts per grade, for the panel's health strip. */
export function gradeSummary(grades = []) {
  const summary = {
    [CELL_GRADES.NUMBER]: 0,
    [CELL_GRADES.TEXT]: 0,
    [CELL_GRADES.HEADING]: 0,
    [CELL_GRADES.MALFORMED]: 0,
    [CELL_GRADES.EMPTY]: 0,
  };
  for (const row of grades) {
    for (const grade of row) {
      if (grade in summary) summary[grade] += 1;
    }
  }
  return summary;
}
