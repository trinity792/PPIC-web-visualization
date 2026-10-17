/**
 * cleanTable.js — tidy a pasted or uploaded grid before it becomes a table,
 * and list what the Import step's Check panel should point out (dataset-range
 * plan, workstream 1).
 *
 * Published tables arrive with things that are not data: a title line above
 * the header, "Source:" and "Note:" lines under the rows, and headers split
 * over two rows by merged cells. `cleanGrid` moves those out of the grid
 * before `buildTable` types the columns, because left in they turn number
 * columns into text. Every move is recorded as a finding the reader can undo.
 *
 * Other things are left in the data and only pointed out, with a one-click
 * fix: blank labels in grouped exports (fill down), total rows, footnote
 * marks, ambiguous slash dates, and percent columns written as fractions.
 * Those findings are derived from the current table, so a fix the reader
 * makes by hand clears them too. Each names the cell it is about (`target`:
 * { row, col }), so the Check panel can show it in the grid.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   cleanGrid(rawRows, { joinHeader }) — { rows, meta: { title?, source?, notes? },
 *                                    findings } without mutating its input
 *   joinHeaderRows(lines, width)  — one name per column from a multi-row header
 *   tableFindings(table)          — the Check panel's derived findings
 *   visibleFindings(table)        — moved-content findings plus derived ones
 *   applyFinding(table, finding)  — the table after a finding's one-click action
 *
 * Data sources:
 *   - lib/tabular/columnTypes.js (number, date, and placeholder reading)
 */

import {
  COLUMN_TYPES,
  cellToken,
  coerceColumn,
  columnParseOptions,
  inferColumnType,
  parseDateToken,
  parseNumber,
  profileColumns,
} from "./columnTypes";
import { insertRow, markRows } from "./tableEdits";

const NOTE_PREFIX_RE = /^(sources?|notes?)\s*:\s*/i;
const SOURCE_PREFIX_RE = /^sources?\s*:\s*/i;
const STARRED_NOTE_RE = /^\*+\s*\S.{1,}/;
const TOTAL_LABEL_RE = /^(grand\s+total|total|all|overall)\b/i;

const isBlankCell = (cell) => cell == null || String(cell).trim() === "";
const filledCount = (row) => row.filter((cell) => !isBlankCell(cell)).length;
const filledText = (row) => row.filter((cell) => !isBlankCell(cell)).map((cell) => String(cell).trim()).join(" ");
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
const quote = (text) => `“${text}”`;

function isNumericCell(cell) {
  return parseNumber(cell, "en") !== null || parseNumber(cell, "eu") !== null;
}

/** A line under the data that is a source or a note, not a row. */
function isTrailingNote(row) {
  const count = filledCount(row);
  if (!count) return true;
  const text = filledText(row);
  if (NOTE_PREFIX_RE.test(text) || STARRED_NOTE_RE.test(text)) return true;
  // A lone cell of a sentence under a table is a note; a lone short label
  // could be a data row whose values are all blank, so it stays.
  return count === 1 && wordCount(text) >= 3;
}

/**
 * A header split over two rows by merged cells: the upper row has blanks and
 * no numbers, the lower row is all labels, and the rows below hold numbers
 * under at least one of those labels.
 */
function isTwoRowHeader(upper, lower, body, width) {
  if (!upper || !lower || body.length < 1) return false;
  const cells = (row) => Array.from({ length: width }, (_, index) => row[index] ?? "");
  const up = cells(upper);
  const low = cells(lower);
  if (!up.some(isBlankCell) || !up.some((cell) => !isBlankCell(cell))) return false;
  if (up.some((cell) => !isBlankCell(cell) && isNumericCell(cell))) return false;
  if (low.some((cell) => isBlankCell(cell) || isNumericCell(cell) || parseDateToken(cell))) return false;
  return low.some((_, index) => {
    const values = body.map((row) => row[index]).filter((cell) => !isBlankCell(cell));
    return values.length > 0 && values.filter((cell) => isNumericCell(cell) || cellToken(cell)).length / values.length >= 0.5;
  });
}

/**
 * One name per column from a header that spans several rows: each row but
 * the last is carried right across its merged blanks, and the parts are
 * joined with " - " ("Employment - Jobs").
 */
export function joinHeaderRows(lines, width) {
  const carriedLines = lines.map((line, lineIndex) => {
    let carried = "";
    return Array.from({ length: width }, (_, index) => {
      const cell = String(line?.[index] ?? "").trim();
      if (lineIndex === lines.length - 1) return cell;
      if (cell) carried = cell;
      return cell || carried;
    });
  });
  return Array.from({ length: width }, (_, index) =>
    carriedLines.map((line) => line[index]).filter(Boolean).join(" - "),
  );
}

function joinHeader(upper, lower, width) {
  return joinHeaderRows([upper, lower], width);
}

/**
 * Move a title line, source and note lines, and a two-row header out of a raw
 * grid. Returns new arrays; the input is never changed.
 *
 * @returns {{ rows: string[][], meta: Object, findings: Object[] }}
 */
export function cleanGrid(rawRows = [], { joinHeader: joinHeaders = true } = {}) {
  const rows = (rawRows || []).map((row) => (row || []).map((cell) => (cell == null ? "" : String(cell))));
  const width = Math.max(0, ...rows.map((row) => row.length));
  const meta = {};
  const findings = [];
  if (width < 2 || rows.length < 2) return { rows, meta, findings };

  // ── Title lines above the first row that is at least half filled. ──
  let start = 0;
  const firstFull = rows.findIndex((row) => filledCount(row) >= 2 && filledCount(row) >= width / 2);
  if (firstFull > 0 && rows.slice(0, firstFull).every((row) => filledCount(row) <= 1)) {
    const lines = rows.slice(0, firstFull);
    const title = lines.filter((row) => filledCount(row)).map(filledText).join(" ");
    if (title) {
      meta.title = title;
      findings.push({
        id: "moved-title",
        code: "titleMoved",
        message: `Moved the title line ${quote(title)} out of the data and into the chart title.`,
        lines,
        where: "top",
        field: "title",
        value: title,
        action: { type: "undo", label: "Undo move" },
      });
    }
    start = firstFull;
  }

  // ── Source and note lines under the data. ──
  let end = rows.length;
  while (end - start > 2 && isTrailingNote(rows[end - 1])) end -= 1;
  const trailing = rows.slice(end).filter((row) => filledCount(row));
  const sourceLines = trailing.filter((row) => SOURCE_PREFIX_RE.test(filledText(row)));
  const noteLines = trailing.filter((row) => !SOURCE_PREFIX_RE.test(filledText(row)));
  if (sourceLines.length) {
    meta.source = sourceLines.map((row) => filledText(row).replace(SOURCE_PREFIX_RE, "")).join("; ");
    findings.push({
      id: "moved-source",
      code: "sourceMoved",
      message: `Moved the source line ${quote(sourceLines.map(filledText).join(" "))} out of the data and into the source.`,
      lines: sourceLines,
      where: "bottom",
      field: "source",
      value: meta.source,
      action: { type: "undo", label: "Undo move" },
    });
  }
  if (noteLines.length) {
    meta.notes = noteLines.map((row) => filledText(row).replace(NOTE_PREFIX_RE, "")).join(" ");
    findings.push({
      id: "moved-notes",
      code: "notesMoved",
      message: `Moved the note ${quote(noteLines.map(filledText).join(" "))} out of the data and into the notes.`,
      lines: noteLines,
      where: "bottom",
      field: "notes",
      value: meta.notes,
      action: { type: "undo", label: "Undo move" },
    });
  }

  // ── A header split over two rows. ──
  let body = rows.slice(start, end);
  if (joinHeaders && body.length >= 3 && isTwoRowHeader(body[0], body[1], body.slice(2), width)) {
    const [upper, lower] = body;
    body = [joinHeader(upper, lower, width), ...body.slice(2)];
    findings.push({
      id: "joined-header",
      code: "headerJoined",
      message: "Joined a header split over two rows into one name per column.",
      lines: [upper, lower],
      where: "header",
      action: { type: "undo", label: "Undo join" },
    });
  }

  return { rows: body, meta, findings };
}

// ── Derived findings ─────────────────────────────────────────────────

function columnValues(table, index) {
  return (table.rows || []).map((row) => row?.[index] ?? "");
}

/** Blank labels that sit below a filled one, in rows whose other cells are filled. */
function fillDownFinding(table, column, index) {
  const values = columnValues(table, index);
  if (!values.length || isBlankCell(values[0])) return null;
  const blanks = values
    .map((value, row) => (isBlankCell(value) ? row : null))
    .filter((row) => row !== null);
  if (!blanks.length || blanks.length > values.length / 2) return null;
  const others = (row) => (table.rows[row] || []).some((cell, at) => at !== index && !isBlankCell(cell));
  if (!blanks.every(others)) return null;
  const count = blanks.length;
  return {
    id: `fill-down-${index}`,
    code: "fillDownCandidate",
    message: `${quote(column.name)} has ${count} blank label${count === 1 ? "" : "s"} below a filled one. Fill down to repeat the label above.`,
    action: { type: "fillDown", label: "Fill down", column: index },
    target: { row: blanks[0], col: index },
  };
}

function totalRowsFinding(table, index) {
  const rows = columnValues(table, index)
    .map((value, row) => (!table.rowMarks?.[row] && TOTAL_LABEL_RE.test(String(value).trim()) ? row : null))
    .filter((row) => row !== null);
  if (!rows.length) return null;
  const labels = [...new Set(rows.map((row) => String(table.rows[row][index]).trim()))];
  return {
    id: "total-rows",
    code: "totalRows",
    message: `${rows.length} row${rows.length === 1 ? " looks" : "s look"} like a total (${labels.map(quote).join(", ")}). A total double counts in stacked bars and pies; leaving it out keeps it in the table but off the chart.`,
    action: { type: "leaveOutTotalRows", label: "Leave out total rows", rows },
    target: { row: rows[0], col: index },
  };
}

function footnoteFinding(table, column, index) {
  const { footnotes } = coerceColumn(columnValues(table, index), COLUMN_TYPES.NUMBER, columnParseOptions(column));
  if (!footnotes.length) return null;
  const marks = [...new Set(footnotes.map((entry) => entry.mark))].join(", ");
  return {
    id: `footnotes-${index}`,
    code: "footnoteMarks",
    message: `${quote(column.name)} has ${footnotes.length} value${footnotes.length === 1 ? "" : "s"} with a footnote mark (${marks}); the mark is ignored and the number is kept.`,
    target: { row: footnotes[0].row, col: index },
  };
}

function fractionFinding(table, column, index) {
  if (column.unit !== "percent") return null;
  const values = coerceColumn(columnValues(table, index), COLUMN_TYPES.NUMBER, columnParseOptions(column))
    .values.filter((value) => value !== null);
  if (!values.length || !values.every((value) => value >= 0 && value <= 1)) return null;
  if (!values.some((value) => value > 0 && value < 1)) return null;
  return {
    id: `fraction-${index}`,
    code: "fractionPercent",
    message: `${quote(column.name)} looks like fractions of 1, so 0.4 would read as 0.4%.`,
    action: { type: "showAsPercent", label: "Show as percent (multiply by 100)", column: index },
    target: { row: 0, col: index },
  };
}

function dateOrderFinding(table, column, index) {
  const dateOrder = table.meta?.importOptions?.dateOrder;
  const findings = inferColumnType(columnValues(table, index), { dateOrder: ["mdy", "dmy"].includes(dateOrder) ? dateOrder : undefined }).findings || [];
  return findings.length
    ? { id: `date-order-${index}`, code: findings[0].code, message: `${quote(column.name)}: ${findings[0].message}`, target: { row: 0, col: index } }
    : null;
}

/** What the Check panel points out about the table as it stands now. */
export function tableFindings(table) {
  if (!table?.columns?.length) return [];
  const findings = [];
  const labelIndex = table.columns.findIndex((column) => !column.ignored && ["text", "group"].includes(column.type));
  table.columns.forEach((column, index) => {
    // An ignored column is the reader's to keep as it is.
    if (column.ignored) return;
    if (["text", "group"].includes(column.type)) findings.push(fillDownFinding(table, column, index));
    if (column.type === COLUMN_TYPES.NUMBER) {
      findings.push(footnoteFinding(table, column, index), fractionFinding(table, column, index));
    }
    if (column.type === COLUMN_TYPES.DATE) findings.push(dateOrderFinding(table, column, index));
  });
  if (labelIndex >= 0) findings.push(totalRowsFinding(table, labelIndex));
  return findings.filter(Boolean);
}

/** Findings about content moved out of the grid (undoable), then the derived ones. */
export function visibleFindings(table) {
  const moved = (table?.findings || []).filter((finding) => finding.action?.type === "undo");
  return [...moved, ...tableFindings(table || {})];
}

// ── Actions ──────────────────────────────────────────────────────────

/** Re-profile after an edit, keep the undoable findings not yet used, and refresh the rest. */
function refresh(table, { dropFinding } = {}) {
  const profiled = { ...table, columns: profileColumns(table) };
  const moved = (table.findings || []).filter(
    (finding) => finding.action?.type === "undo" && finding.id !== dropFinding,
  );
  return { ...profiled, findings: [...moved, ...tableFindings(profiled)] };
}

function pad(row, width) {
  return Array.from({ length: width }, (_, index) => String(row?.[index] ?? ""));
}

/** A number written back in the column's own separator convention. */
function writeNumber(value, locale) {
  const text = String(Number(value.toPrecision(12)));
  return locale === "eu" ? text.replace(".", ",") : text;
}

function undoMove(table, finding) {
  const width = table.columns.length;
  const lines = (finding.lines || []).map((row) => pad(row, width));
  const meta = { ...(table.meta || {}) };
  if (finding.where === "header-row") {
    // A data row chosen as the header: its names go back into the data, and
    // the old header and the rows above it come back.
    const [oldHeader, ...above] = lines;
    const restored = [...above, pad(finding.headerRow, width)];
    let next = table;
    for (let count = 0; count < restored.length; count += 1) next = insertRow(next, 0);
    return {
      ...next,
      columns: next.columns.map((column, index) => ({ ...column, name: oldHeader[index] || column.name })),
      rows: next.rows.map((row, index) => (index < restored.length ? restored[index] : row)),
      meta,
    };
  }
  if (finding.where === "header") {
    const [upper, lower] = lines;
    return {
      ...table,
      columns: table.columns.map((column, index) => ({ ...column, name: lower[index] || column.name })),
      rows: [upper, ...table.rows],
      meta,
    };
  }
  // Clear the field only while it still holds what was moved, so a title or
  // source the reader has since typed is kept.
  if (finding.field && meta[finding.field] === finding.value) delete meta[finding.field];
  const rows = finding.where === "top" ? [...lines, ...table.rows] : [...table.rows, ...lines];
  return { ...table, rows, meta };
}

/**
 * The table after a finding's one-click action: fill down, leave out total
 * rows, show fractions as percent, or undo a move. The table is re-profiled
 * and its findings refreshed. Unknown actions return the table unchanged.
 */
export function applyFinding(table, finding) {
  const action = finding?.action;
  if (!table || !action) return table;
  switch (action.type) {
    case "fillDown": {
      let carried = "";
      const rows = table.rows.map((row) => {
        const cell = row[action.column];
        if (!isBlankCell(cell)) {
          carried = cell;
          return row;
        }
        return row.map((value, index) => (index === action.column ? carried : value));
      });
      return refresh({ ...table, rows });
    }
    case "leaveOutTotalRows":
      // Marked, not deleted: the rows stay in the grid, dimmed, and no chart
      // draws them (import overhaul).
      return refresh(markRows(table, action.rows, "total"));
    case "showAsPercent": {
      const { locale } = columnParseOptions(table.columns[action.column]);
      const rows = table.rows.map((row) =>
        row.map((cell, index) => {
          if (index !== action.column) return cell;
          const value = parseNumber(cell, locale);
          return value === null ? cell : writeNumber(value * 100, locale);
        }),
      );
      return refresh({ ...table, rows });
    }
    case "undo":
      return refresh(undoMove(table, finding), { dropFinding: finding.id });
    default:
      return table;
  }
}
