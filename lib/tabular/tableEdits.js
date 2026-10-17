/**
 * tableEdits.js — every edit the data grid makes to an inline table, each a
 * pure table → table step (import overhaul, phase 1).
 *
 * Moved out of InputTableEditor.js so the grid, the Check panel, and tests
 * share them. Edits that touch cells or structure keep the table's per-cell
 * formulas (`table.formulas`, lib/tabular/formulas.js) and row marks
 * (`table.rowMarks`) in step: formulas and their references move with the
 * cells they name, and every formula value is recalculated.
 *
 * Column kinds are the grid header's chart-agnostic answer to "what is this
 * column": a label, a group, a time, a value (number, percent, or dollars),
 * or a column to ignore. A kind is stored as the column's existing type and
 * unit, marked as the reader's own choice (`forced`, `unitForced`), so every
 * re-profile keeps it; Ignore is `ignored: true` and keeps the type.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   COLUMN_KINDS, columnKind(column), setColumnKind(table, col, kind)
 *   setCell(table, row, col, text)       — a value, or a formula when text starts with "="
 *   cellText(table, row, col)            — what the cell holds: its formula, else its value
 *   renameColumn, setColumnType, setColumnUnit
 *   addRow, insertRow, deleteRow, addColumn, insertColumn, deleteColumn
 *   toggleHeaderRow, transpose, fillDown, markRows
 *   addFormulaColumn(table, name, formula) — a new column whose every cell is the
 *                                           formula, kept live
 *   pasteBlock(table, at, text)          — tab-separated cells pasted from a cell,
 *                                           growing the table as needed
 *   promoteRowToHeader(table, row)           — a data row becomes the header (undoable)
 *
 * The spreadsheet grid's edits (spreadsheet grid plan, workstreams 3 to 5)
 * take selections and ranges in grid coordinates (lib/tabular/gridSelection.js:
 * row 0 is the header, row r ≥ 1 is data row r − 1); row and column indexes
 * passed on their own are data indexes, as above. Each is one edit, so one
 * undo step, however many cells it touches:
 *   pasteCells(table, sel, cells, options) — a paste: a block, one value over a
 *                                           range, a repeated block, values only, a cut
 *   clearRange(table, sel)               — values and formulas removed
 *   fillRange(table, source, target)     — the fill handle, in any direction
 *   fillDownSelection, fillRightSelection — Cmd+D and Cmd+R
 *   fillToEnd(table, sel)                — a double-click on the fill handle
 *   moveRows(table, rows, to), moveColumns(table, cols, to)
 *   sortRows(table, col, direction), sortRange(table, sel, col, direction)
 *   insertRows, insertColumns (at, count), deleteRows, deleteColumns (indexes)
 *   insertFormulaColumn(table, afterCol) — { table, col }, for the ƒx button
 *
 * Data sources:
 *   - lib/tabular/formulas.js, lib/tabular/transposeTable.js
 *
 * Spreadsheet fill-down and fill-right behavior is adapted from Fortune-sheet
 * (MIT, https://github.com/ruilisi/fortune-sheet), the KeyD and KeyR branches
 * of handleWithCtrlOrMetaKey, implemented against this immutable table model.
 *   - lib/tabular/fillSeries.js, lib/tabular/gridSelection.js
 */

import {
  fillFormula,
  isFormula,
  recalculate,
  renameFormulaColumn,
  retargetFormula,
  shiftFormulas,
} from "./formulas";
import {
  cellToken,
  columnParseOptions,
  inferColumnType,
  parseDateToken,
  parseNumber,
  profileColumns,
} from "./columnTypes";
import { extendSeries } from "./fillSeries";
import { activeRange, cellsOf } from "./gridSelection";
import { selectionClipboardAxes } from "./gridClipboard";
import { transposeTable } from "./transposeTable";

export const COLUMN_KINDS = Object.freeze([
  { id: "label", label: "Label" },
  { id: "group", label: "Group" },
  { id: "time", label: "Time" },
  { id: "number", label: "Number" },
  { id: "percent", label: "Percent" },
  { id: "usd", label: "Dollars" },
  { id: "ignore", label: "Ignore" },
]);

const key = (row, col) => `${row}:${col}`;

/** A column's kind, read from its type, unit, and ignored flag. */
export function columnKind(column = {}) {
  if (column.ignored) return "ignore";
  if (column.type === "group") return "group";
  if (column.type === "date") return "time";
  if (column.type === "number") return ["percent", "usd"].includes(column.unit) ? column.unit : "number";
  return "label";
}

function withColumn(table, columnIndex, update) {
  return {
    ...table,
    columns: table.columns.map((column, index) => (index === columnIndex ? update(column) : column)),
  };
}

/** Set a column's kind as the reader's own choice; Ignore keeps its type. */
export function setColumnKind(table, columnIndex, kind) {
  return withColumn(table, columnIndex, (column) => {
    if (kind === "ignore") return { ...column, ignored: true };
    const rest = { ...column };
    delete rest.ignored;
    delete rest.unit;
    delete rest.unitForced;
    if (kind === "label") return { ...rest, type: "text", forced: true };
    if (kind === "group") return { ...rest, type: "group", forced: true };
    if (kind === "time") return { ...rest, type: "date", forced: true };
    return { ...rest, type: "number", forced: true, unit: kind, unitForced: true };
  });
}

// `forced: true` marks a type the reader picked, as opposed to one
// `inferColumnType` guessed — the only thing that lets transpose tell a
// reader's decision from an inference.
export function setColumnType(table, columnIndex, type) {
  return withColumn(table, columnIndex, (column) => ({ ...column, type, forced: true }));
}

// `unitForced: true` marks a Format the reader picked, so profiling the
// table again (after a transpose or an edit) never overwrites it.
export function setColumnUnit(table, columnIndex, unit) {
  return withColumn(table, columnIndex, (column) => ({ ...column, unit, unitForced: true }));
}

/** What a cell holds: its formula when it has one, else its value. */
export function cellText(table, rowIndex, columnIndex) {
  return table.formulas?.[key(rowIndex, columnIndex)] ?? table.rows?.[rowIndex]?.[columnIndex] ?? "";
}

/** Write a cell: text starting with "=" is a formula; anything else replaces one. */
export function setCell(table, rowIndex, columnIndex, text) {
  const formulas = { ...(table.formulas || {}) };
  const cellKey = key(rowIndex, columnIndex);
  const formula = isFormula(text);
  if (formula) formulas[cellKey] = String(text).trim();
  else delete formulas[cellKey];
  const rows = table.rows.map((row, index) =>
    index === rowIndex ? row.map((cell, c) => (c === columnIndex ? (formula ? "" : text) : cell)) : row,
  );
  return recalculate({ ...table, rows, formulas });
}

export function renameColumn(table, columnIndex, name) {
  const previous = table.columns[columnIndex]?.name;
  const renamed = withColumn(table, columnIndex, (column) => ({ ...column, name }));
  if (!table.formulas || previous === name) return renamed;
  return recalculate({ ...renamed, formulas: renameFormulaColumn(table.formulas, previous, name) });
}

/** Row marks moved by a row insert (+1 from `at`) or delete (`at` dropped). */
function shiftMarks(rowMarks, at, inserting) {
  if (!rowMarks) return rowMarks;
  const next = {};
  for (const [row, mark] of Object.entries(rowMarks)) {
    const index = Number(row);
    if (index < at) next[index] = mark;
    else if (inserting) next[index + 1] = mark;
    else if (index > at) next[index - 1] = mark;
  }
  return next;
}

// The structure edits below come in two layers: a step that moves cells,
// formulas, and marks without recalculating, so a plural edit recalculates
// once, and the exported edit that recalculates.

function insertRowStep(table, at) {
  const blank = table.columns.map(() => "");
  const rows = [...table.rows.slice(0, at), blank, ...table.rows.slice(at)];
  return {
    ...table,
    rows,
    ...(table.formulas ? { formulas: shiftFormulas(table, { type: "insertRow", at }) } : {}),
    ...(table.rowMarks ? { rowMarks: shiftMarks(table.rowMarks, at, true) } : {}),
  };
}

function deleteRowStep(table, rowIndex) {
  return {
    ...table,
    rows: table.rows.filter((_, index) => index !== rowIndex),
    ...(table.formulas ? { formulas: shiftFormulas(table, { type: "deleteRow", at: rowIndex }) } : {}),
    ...(table.rowMarks ? { rowMarks: shiftMarks(table.rowMarks, rowIndex, false) } : {}),
  };
}

function insertColumnStep(table, at, column) {
  return {
    ...table,
    columns: [...table.columns.slice(0, at), column, ...table.columns.slice(at)],
    rows: table.rows.map((row) => [...row.slice(0, at), "", ...row.slice(at)]),
    ...(table.formulas ? { formulas: shiftFormulas(table, { type: "insertColumn", at }) } : {}),
  };
}

function deleteColumnStep(table, columnIndex) {
  return {
    ...table,
    columns: table.columns.filter((_, index) => index !== columnIndex),
    rows: table.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    ...(table.formulas ? { formulas: shiftFormulas(table, { type: "deleteColumn", at: columnIndex }) } : {}),
  };
}

/** "Column 4" (or "Formula 1"): the first name of that pattern no column has, counting from `start`. */
function nextColumnName(columns, base = "Column", start = columns.length + 1) {
  const taken = new Set(columns.map((column) => column.name));
  let n = start;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function insertRow(table, at) {
  return recalculate(insertRowStep(table, at));
}

export function addRow(table) {
  return insertRow(table, table.rows.length);
}

export function deleteRow(table, rowIndex) {
  return recalculate(deleteRowStep(table, rowIndex));
}

export function insertColumn(table, at, column = { name: nextColumnName(table.columns), type: "text" }) {
  return recalculate(insertColumnStep(table, at, column));
}

export function addColumn(table) {
  return insertColumn(table, table.columns.length);
}

export function deleteColumn(table, columnIndex) {
  return recalculate(deleteColumnStep(table, columnIndex));
}

/**
 * Promote the first data row to headers, demoting the current headers to a
 * data row — pressed again, this swaps them right back. Formulas in the first
 * row become plain text there, since it changes places with the header.
 */
export function toggleHeaderRow(table) {
  if (!table.rows.length) return table;
  const [firstRow, ...restRows] = table.rows;
  const oldHeaderRow = table.columns.map((column) => column.name);
  const columns = table.columns.map((column, index) => ({
    ...column,
    name: firstRow[index] ?? column.name,
  }));
  const formulas = table.formulas
    ? Object.fromEntries(Object.entries(table.formulas).filter(([cellKey]) => !cellKey.startsWith("0:")))
    : undefined;
  return recalculate({ ...table, columns, rows: [oldHeaderRow, ...restRows], ...(formulas ? { formulas } : {}) });
}

/**
 * Transpose the table. Formulas become their values (a reference cannot
 * follow a swap of rows and columns), and row marks are cleared.
 */
export function transpose(table) {
  const rest = { ...table };
  delete rest.formulas;
  delete rest.rowMarks;
  return transposeTable(rest);
}

/**
 * Fill a data cell down over the next `count` rows that exist, as the fill
 * handle does (`fillRange`): a formula with its relative references moved row
 * by row, a value extended as a series or copied.
 */
export function fillDown(table, from, count) {
  const last = Math.min(from.row + count, table.rows.length - 1);
  if (last <= from.row) return table;
  const source = { r1: from.row + 1, c1: from.col, r2: from.row + 1, c2: from.col };
  return fillRange(table, source, { ...source, r2: last + 1 });
}

/** Mark rows ("excluded", "total", or "note") so no chart draws them; a null mark clears them. */
export function markRows(table, rowIndexes, mark) {
  const rowMarks = { ...(table.rowMarks || {}) };
  for (const row of rowIndexes) {
    if (mark) rowMarks[row] = mark;
    else delete rowMarks[row];
  }
  return { ...table, rowMarks };
}

/**
 * A new last column whose every cell holds the formula (header names and
 * same-row references, as the derived-column builder writes them), so the
 * column stays live as its sources change. Typed from its values.
 */
export function addFormulaColumn(table, name, formula) {
  const text = `=${String(formula).trim().replace(/^=/, "")}`;
  const at = table.columns.length;
  let next = insertColumn(table, at, { name, type: "text" });
  const formulas = { ...(next.formulas || {}) };
  next.rows.forEach((_, row) => {
    formulas[`${row}:${at}`] = text;
  });
  next = recalculate({ ...next, formulas });
  const type = inferColumnType(next.rows.map((row) => row[at]), { columnName: name }).type;
  return { ...next, columns: next.columns.map((column, index) => (index === at ? { ...column, type } : column)) };
}

/**
 * Paste a block of cells copied from a spreadsheet (tab-separated columns,
 * one line per row), its top-left cell at `at`. The table grows to fit: new
 * rows are blank, new columns are typed from what was pasted into them. A
 * pasted "=..." cell is a formula.
 */
export function pasteBlock(table, at, text) {
  const lines = String(text).replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
  const cell = { row: at.row + 1, col: at.col };
  return pasteCells(table, { ranges: [{ r1: cell.row, c1: cell.col, r2: cell.row, c2: cell.col }], active: cell, anchor: cell, mode: "cells" }, lines);
}

/**
 * Make a data row the header: its cells name the columns, and the old header
 * and every row above it move out of the data. The move is recorded as an
 * undoable finding (lib/tabular/cleanTable.js), and the columns are typed
 * again from the rows that remain (a reader's own kinds are kept).
 */
export function promoteRowToHeader(table, rowIndex) {
  if (rowIndex < 0 || rowIndex >= table.rows.length) return table;
  const oldHeader = table.columns.map((column) => column.name);
  const above = table.rows.slice(0, rowIndex);
  const headerRow = table.rows[rowIndex];
  let next = table;
  for (let count = 0; count <= rowIndex; count += 1) next = deleteRow(next, 0);
  const columns = next.columns.map((column, index) => ({
    ...column,
    name: String(headerRow[index] ?? "").trim() || `Column ${index + 1}`,
  }));
  next = { ...next, columns };
  return {
    ...next,
    columns: profileColumns(next),
    findings: [
      ...(table.findings || []).filter((finding) => finding.id !== "chosen-header"),
      {
        id: "chosen-header",
        code: "headerChosen",
        message: `Used row ${rowIndex + 2} as the header; the old header${above.length ? ` and ${above.length} row${above.length === 1 ? "" : "s"} above it` : ""} moved out of the data.`,
        lines: [oldHeader, ...above],
        headerRow,
        where: "header-row",
        action: { type: "undo", label: "Undo" },
      },
    ],
  };
}

// ── The spreadsheet grid's edits ─────────────────────────────────────
// Selections and ranges here are in grid coordinates: row 0 is the header
// and grid row r ≥ 1 is data row r − 1.

/** A grid cell's text as an edit reads it: the header name, or what the cell holds. */
function gridCellText(table, row, col) {
  return row === 0 ? table.columns[col]?.name ?? "" : cellText(table, row - 1, col);
}

/** The table's data cells as a grid size, for clipping a selection to what exists. */
const dataSize = (table) => ({ rows: table.rows.length + 1, columns: table.columns.length });

/** The table grown with blank rows and new text columns to hold `rowCount` rows and `columnCount` columns. */
function grow(table, rowCount, columnCount) {
  let next = table;
  if (columnCount > next.columns.length) {
    const columns = [...next.columns];
    while (columns.length < columnCount) columns.push({ name: nextColumnName(columns), type: "text" });
    next = { ...next, columns, rows: next.rows.map((row) => [...row, ...Array(columnCount - row.length).fill("")]) };
  }
  if (rowCount > next.rows.length) {
    const blanks = Array.from({ length: rowCount - next.rows.length }, () => next.columns.map(() => ""));
    next = { ...next, rows: [...next.rows, ...blanks] };
  }
  return next;
}

/**
 * Write cells as one edit: `writes` are { row, col, text, plain } in grid
 * coordinates. A header cell renames its column (never to an empty name or a
 * formula); a data cell takes a formula when its text starts with "=" (unless
 * `plain`), else a value. The table grows to fit, columns it grows are typed
 * from what lands in them, and formulas are recalculated once.
 */
function applyGridWrites(table, writes) {
  if (!writes.length) return table;
  const firstNewColumn = table.columns.length;
  const rowCount = Math.max(...writes.map((write) => write.row));
  const columnCount = Math.max(...writes.map((write) => write.col)) + 1;
  let next = grow(table, rowCount, columnCount);

  for (const { row, col, text } of writes) {
    const name = String(text ?? "").trim();
    if (row === 0 && name && !isFormula(name)) next = renameColumn(next, col, name);
  }
  const rows = next.rows.map((row) => [...row]);
  const formulas = { ...(next.formulas || {}) };
  for (const { row, col, text, plain } of writes) {
    if (row < 1) continue;
    const cellKey = key(row - 1, col);
    if (!plain && isFormula(text)) {
      formulas[cellKey] = String(text).trim();
      rows[row - 1][col] = "";
    } else {
      delete formulas[cellKey];
      rows[row - 1][col] = text ?? "";
    }
  }
  const written = recalculate({ ...next, rows, formulas });
  if (written.columns.length === firstNewColumn) return written;
  return {
    ...written,
    columns: written.columns.map((column, index) =>
      index >= firstNewColumn
        ? { ...column, type: inferColumnType(written.rows.map((row) => row[index]), { columnName: column.name }).type }
        : column,
    ),
  };
}

const rangeSize = (range) => ({ height: range.r2 - range.r1 + 1, width: range.c2 - range.c1 + 1 });

/**
 * Paste cells (rows of strings, as `parseClipboard` reads them) onto a
 * selection, as one edit:
 *
 *   - one value over a selection of several cells fills every data cell;
 *   - a block over a single range that is an exact multiple of its size
 *     repeats to fill the range;
 *   - otherwise the block lands with its top-left at the active cell, and
 *     the table grows as needed (a header cell takes a name).
 *
 * Options:
 *   source   {row, col} — where a block copied in this editor came from (grid
 *                         coordinates), so its formulas' relative references
 *                         move by the distance pasted; without it, formulas
 *                         land as written
 *   origins  Array      — optional per-cell {row,col} origins for a compact
 *                         copy of disjoint aligned ranges
 *   values   boolean    — paste values only: `computed` (the copied values) if
 *                         given, else the cells, never as formulas
 *   cut      selection  — the cut this paste completes: its cells are cleared,
 *                         except those the paste just wrote; references to the
 *                         cut cells follow their destinations, including `$`
 */
export function pasteCells(table, sel, cells, { source, origins, values = false, computed, cut } = {}) {
  const block = values && computed ? computed : cells;
  if (!block?.length || !block.some((line) => line.length)) return table;
  const height = block.length;
  const width = Math.max(...block.map((line) => line.length));
  const writes = [];
  const moves = new Map();
  const cutAxes = cut ? selectionClipboardAxes(cut) : null;
  const place = (row, col, r, c) => {
    let text = block[r]?.[c] ?? "";
    const origin = origins?.[r]?.[c] || (cutAxes
      ? { row: cutAxes.rows[r], col: cutAxes.columns[c] }
      : source && { row: source.row + r, col: source.col + c });
    if (cut && origin) moves.set(`${origin.row}:${origin.col}`, { row, col });
    if (!values && !cut && origin && isFormula(text)) {
      text = fillFormula(text, origin, { row, col });
    }
    writes.push({ row, col, text, plain: values });
  };

  const range = activeRange(sel);
  const size = rangeSize(range);
  const selected = [...cellsOf(sel, dataSize(table))];
  if (cut) {
    // A move has exactly one destination per source cell, never a tiled fill.
    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) place(sel.active.row + r, sel.active.col + c, r, c);
    }
  } else if (height === 1 && width === 1 && selected.length > 1) {
    for (const { row, col } of selected) if (row >= 1) place(row, col, 0, 0);
  } else if (sel.ranges.length === 1 && size.height % height === 0 && size.width % width === 0) {
    for (let row = range.r1; row <= range.r2; row += 1) {
      for (let col = range.c1; col <= range.c2; col += 1) {
        if (row === 0 && range.r2 > 0 && height < size.height) continue;
        place(row, col, (row - range.r1) % height, (col - range.c1) % width);
      }
    }
  } else {
    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) place(sel.active.row + r, sel.active.col + c, r, c);
    }
  }

  if (cut) {
    const written = new Set(writes.map(({ row, col }) => `${row}:${col}`));
    for (const address of moves.keys()) {
      const [row, col] = address.split(":").map(Number);
      if (row >= 1 && !written.has(`${row}:${col}`)) writes.push({ row, col, text: "", plain: true });
    }
    const formulas = Object.fromEntries(Object.entries(table.formulas || {}).map(([address, formula]) => [address, retargetFormula(formula, moves)]));
    for (const write of writes) {
      if (!write.plain && isFormula(write.text)) write.text = retargetFormula(write.text, moves);
    }
    return applyGridWrites({ ...table, formulas }, writes);
  }
  return applyGridWrites(table, writes);
}

/** Remove the values and formulas of the selected data cells. Header names stay. */
export function clearRange(table, sel) {
  const writes = [];
  for (const { row, col } of cellsOf(sel, dataSize(table))) {
    if (row >= 1) writes.push({ row, col, text: "", plain: true });
  }
  return applyGridWrites(table, writes);
}

// ── Fill ─────────────────────────────────────────────────────────────

/**
 * The fill handle: extend `source` (a grid range) to cover `target`, which
 * reaches past it in one direction. Each column (filling up or down) or row
 * (filling left or right) continues as its own series (lib/tabular/fillSeries.js).
 * The header row is never filled into or from. `option` counts a single
 * number or date instead of copying it (Option-drag).
 */
export function fillRange(table, source, target, { option = false } = {}) {
  const from = { ...source, r1: Math.max(source.r1, 1) };
  if (from.r2 < from.r1) return table;
  const direction =
    target.r2 > from.r2 ? "down"
      : target.r1 < from.r1 ? "up"
        : target.c2 > from.c2 ? "right"
          : target.c1 < from.c1 ? "left"
            : null;
  if (!direction) return table;
  const writes = [];
  if (direction === "down" || direction === "up") {
    const count = direction === "down" ? target.r2 - from.r2 : from.r1 - Math.max(target.r1, 1);
    for (let col = from.c1; col <= from.c2; col += 1) {
      const column = table.columns[col] || {};
      const cells = [];
      for (let row = from.r1; row <= from.r2; row += 1) cells.push(gridCellText(table, row, col));
      const columnOptions = { ...columnParseOptions(column), type: column.type };
      extendSeries(cells, count, { direction, columnOptions, option }).forEach((text, k) => {
        writes.push({ row: direction === "down" ? from.r2 + 1 + k : from.r1 - 1 - k, col, text });
      });
    }
  } else {
    const count = direction === "right" ? target.c2 - from.c2 : from.c1 - Math.max(target.c1, 0);
    for (let row = from.r1; row <= from.r2; row += 1) {
      const cells = [];
      for (let col = from.c1; col <= from.c2; col += 1) cells.push(gridCellText(table, row, col));
      extendSeries(cells, count, { direction, option }).forEach((text, k) => {
        writes.push({ row, col: direction === "right" ? from.c2 + 1 + k : from.c1 - 1 - k, text });
      });
    }
  }
  return applyGridWrites(table, writes);
}

/**
 * Copy one grid row or column of cells across the cells after it, moving
 * formula references by the distance, as Cmd+D and Cmd+R do.
 */
function copyAcross(table, sel, vertical) {
  const writes = [];
  for (const range of sel.ranges) {
    const r1 = Math.max(range.r1, 1);
    const r2 = Math.min(range.r2, table.rows.length);
    if (r2 < r1) continue;
    const c2 = Math.min(range.c2, table.columns.length - 1);
    // A range one cell deep copies from the cell before it (above, or to the left).
    const single = vertical ? r1 === r2 : range.c1 === c2;
    const sourceIndex = vertical ? (single ? r1 - 1 : r1) : (single ? range.c1 - 1 : range.c1);
    if (vertical ? sourceIndex < 1 : sourceIndex < 0) continue;
    for (let row = r1; row <= r2; row += 1) {
      for (let col = range.c1; col <= c2; col += 1) {
        const from = vertical ? { row: sourceIndex, col } : { row, col: sourceIndex };
        if (from.row === row && from.col === col) continue;
        const text = gridCellText(table, from.row, from.col);
        writes.push({ row, col, text: isFormula(text) ? fillFormula(text, from, { row, col }) : text });
      }
    }
  }
  return applyGridWrites(table, writes);
}

/** Cmd+D: each range's top row copied down through it; one row deep, the row above copied in. */
export function fillDownSelection(table, sel) {
  return copyAcross(table, sel, true);
}

/** Cmd+R: each range's left column copied right through it; one column wide, the column to the left copied in. */
export function fillRightSelection(table, sel) {
  return copyAcross(table, sel, false);
}

/**
 * A double-click on the fill handle: fill the active range down as far as
 * the data in the column to its left reaches, or, with nothing there, the
 * column to its right, as in Sheets and Excel.
 */
export function fillToEnd(table, sel) {
  const range = activeRange(sel);
  const filled = (row, col) => {
    const text = table.rows[row - 1]?.[col];
    return col >= 0 && col < table.columns.length && text != null && String(text).trim() !== "";
  };
  const reach = (col) => {
    let end = range.r2;
    while (end < table.rows.length && filled(end + 1, col)) end += 1;
    return end;
  };
  let end = reach(range.c1 - 1);
  if (end === range.r2) end = reach(range.c2 + 1);
  return end === range.r2 ? table : fillRange(table, range, { ...range, r2: end });
}

// ── Moving and sorting ───────────────────────────────────────────────

/** Rows reordered so new row i is old row `order[i]`, with formulas and marks following. */
function permuteRows(table, order) {
  const rowMarks = table.rowMarks
    ? Object.fromEntries(order.flatMap((old, index) => (table.rowMarks[old] ? [[index, table.rowMarks[old]]] : [])))
    : undefined;
  return recalculate({
    ...table,
    rows: order.map((old) => table.rows[old]),
    ...(table.formulas ? { formulas: shiftFormulas(table, { type: "permuteRows", order }) } : {}),
    ...(rowMarks ? { rowMarks } : {}),
  });
}

/** Columns reordered so new column i is old column `order[i]`, kinds and formulas following. */
function permuteColumns(table, order) {
  return recalculate({
    ...table,
    columns: order.map((old) => table.columns[old]),
    rows: table.rows.map((row) => order.map((old) => row[old])),
    ...(table.formulas ? { formulas: shiftFormulas(table, { type: "permuteColumns", order }) } : {}),
  });
}

/** The order that moves `moving` (indexes) to land, in their order, before `to` (a boundary in the original order). */
function moveOrder(length, moving, to) {
  const set = new Set(moving.filter((index) => index >= 0 && index < length));
  const rest = Array.from({ length }, (_, index) => index).filter((index) => !set.has(index));
  const sorted = [...set].sort((a, b) => a - b);
  return [...rest.filter((index) => index < to), ...sorted, ...rest.filter((index) => index >= to)];
}

/** Move data rows to land before data row `to` (counted in the table before the move). */
export function moveRows(table, rows, to) {
  return permuteRows(table, moveOrder(table.rows.length, rows, to));
}

/** Move columns to land before column `to` (counted before the move), with their kinds and flags. */
export function moveColumns(table, cols, to) {
  return permuteColumns(table, moveOrder(table.columns.length, cols, to));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * A comparer for data rows by one column: numbers by value, dates by their
 * place in time, other text naturally ("Item 2" before "Item 10"), numbers
 * and dates before text; blank and missing cells ("n/a", "(D)") always last.
 */
function rowComparer(table, col, direction) {
  const column = table.columns[col] || {};
  const options = columnParseOptions(column);
  const sortKey = (text) => {
    if (cellToken(text)) return null;
    if (column.type === "number") {
      const number = parseNumber(String(text), options.locale);
      if (number !== null) return { rank: 0, number };
    }
    if (column.type === "date") {
      const token = parseDateToken(String(text), options);
      if (token) return { rank: 0, number: token.position };
    }
    return { rank: 1, text: String(text) };
  };
  const keys = table.rows.map((row) => sortKey(row[col]));
  const sign = direction === "desc" ? -1 : 1;
  return (a, b) => {
    const ka = keys[a];
    const kb = keys[b];
    if (!ka || !kb) return (ka ? 0 : 1) - (kb ? 0 : 1);
    if (ka.rank !== kb.rank) return sign * (ka.rank - kb.rank);
    return sign * (ka.rank === 0 ? ka.number - kb.number : collator.compare(ka.text, kb.text));
  };
}

/** Sort every data row by a column ("asc" or "desc"). The header stays row 1; marks move with their rows. */
export function sortRows(table, col, direction = "asc") {
  const order = table.rows.map((_, index) => index).sort(rowComparer(table, col, direction));
  return permuteRows(table, order);
}

/** Sort the active rectangle, leaving cells outside it and partial-row marks in place. */
export function sortRange(table, sel, col, direction = "asc") {
  const range = activeRange(sel);
  const first = Math.max(range.r1, 1) - 1;
  const last = Math.min(range.r2, table.rows.length) - 1;
  if (last <= first || col < range.c1 || col > range.c2) return table;
  const order = table.rows.map((_, index) => index);
  const sorted = order.slice(first, last + 1).sort(rowComparer(table, col, direction));
  order.splice(first, sorted.length, ...sorted);
  const writes = [];
  for (let row = first; row <= last; row += 1) {
    for (let column = Math.max(0, range.c1); column <= Math.min(range.c2, table.columns.length - 1); column += 1) {
      const text = cellText(table, order[row], column);
      writes.push({ row: row + 1, col: column, text: isFormula(text)
        ? fillFormula(text, { row: order[row] + 1, col: column }, { row: row + 1, col: column }) : text });
    }
  }
  const next = applyGridWrites(table, writes);
  if (range.c1 === 0 && range.c2 >= table.columns.length - 1 && table.rowMarks) {
    next.rowMarks = Object.fromEntries(order.flatMap((old, index) => table.rowMarks[old] ? [[index, table.rowMarks[old]]] : []));
  }
  return next;
}

// ── Inserting and deleting several ───────────────────────────────────

/** `count` blank data rows before data row `at`. */
export function insertRows(table, at, count = 1) {
  let next = table;
  for (let n = 0; n < count; n += 1) next = insertRowStep(next, at);
  return recalculate(next);
}

/** `count` new text columns before column `at`. */
export function insertColumns(table, at, count = 1) {
  let next = table;
  for (let n = 0; n < count; n += 1) next = insertColumnStep(next, at + n, { name: nextColumnName(next.columns), type: "text" });
  return recalculate(next);
}

const descending = (indexes) => [...new Set(indexes)].sort((a, b) => b - a);

/** Delete data rows; references to them become #REF!. */
export function deleteRows(table, rows) {
  let next = table;
  for (const row of descending(rows)) if (row >= 0 && row < next.rows.length) next = deleteRowStep(next, row);
  return recalculate(next);
}

/** Delete columns; references to them become #REF!. */
export function deleteColumns(table, cols) {
  let next = table;
  for (const col of descending(cols)) if (col >= 0 && col < next.columns.length) next = deleteColumnStep(next, col);
  return recalculate(next);
}

/** The ƒx button: a new "Formula N" column to the right of `afterCol`. Returns { table, col }. */
export function insertFormulaColumn(table, afterCol) {
  const col = Math.min(Math.max(afterCol + 1, 0), table.columns.length);
  const column = { name: nextColumnName(table.columns, "Formula", 1), type: "number" };
  return { table: insertColumn(table, col, column), col };
}
