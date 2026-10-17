/**
 * gridSelection.js — the data grid's selection, as a spreadsheet keeps it
 * (spreadsheet grid plan, workstream 1).
 *
 * A selection is a list of rectangular ranges and an active cell inside the
 * last one; the anchor is where the current range started, and extending
 * moves the range's far corner while the anchor stays. Grid positions use one
 * row space: row 0 is the header and row r ≥ 1 is data row r − 1, so header
 * cells are selectable and the table model is untouched.
 *
 *   { ranges: [{ r1, c1, r2, c2 }], active: { row, col }, anchor: { row, col },
 *     mode: "cells" | "rows" | "columns" | "all" }
 *
 * Every operation is pure: it takes a selection (and the grid `size`,
 * { rows, columns } counting the header row) and returns a new one.
 *
 * Adapted from Fortune-sheet (MIT, https://github.com/ruilisi/fortune-sheet):
 * the range-list selection from `luckysheet_select_save`, `selectTitlesMap`,
 * `selectTitlesRange`, and `normalizeSelection`; the data-edge jump from
 * `handleArrowKey`, `moveHighlightCell`, and `moveHighlightRange`; and the
 * status bar statistics from `calcSelectionInfo`.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   selectCell, extendTo, addRange       — click, Shift+click, Cmd+click
 *   selectRows, selectColumns, selectAll — letters, numbers, the corner
 *   rowsOfSelection, columnsOfSelection  — Shift+Space, Ctrl+Space
 *   moveActive(sel, direction, options)  — arrows, with jump (Cmd) and extend (Shift)
 *   moveTo(sel, row, col, options)       — Home, End, Cmd+Home, Cmd+End, Page keys
 *   nextInSelection(sel, direction, size) — the move after Enter or Tab
 *   contains, bounds, selectedRows, selectedColumns, cellsOf, activeRange
 *   addressOf(sel)                       — "B3", "B2:D5", "Row 4", "2 columns"
 *   filledIn(table)                      — (row, col) => whether a grid cell holds anything
 *   selectionStats(table, sel)           — Count, Sum, Average, Min, Max of data cells
 *
 * Data sources:
 *   - lib/tabular/formulas.js (column letters)
 *   - lib/tabular/columnTypes.js (reading numbers in each column's convention)
 */

import { columnLetters } from "./formulas";
import { columnParseOptions, parseNumber } from "./columnTypes";

const STEPS = Object.freeze({
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function clampCell(row, col, size) {
  if (!size) return { row, col };
  return { row: clamp(row, 0, size.rows - 1), col: clamp(col, 0, size.columns - 1) };
}

function rangeOf(a, b) {
  return {
    r1: Math.min(a.row, b.row),
    c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row),
    c2: Math.max(a.col, b.col),
  };
}

const lastRow = (size) => size.rows - 1;
const lastColumn = (size) => size.columns - 1;

/** The mode a selection keeps after its ranges change: whole rows stay rows only while every range spans the width. */
function modeFor(previous, ranges, size) {
  if (!size) return "cells";
  const fullWidth = ranges.every((range) => range.c1 === 0 && range.c2 === lastColumn(size));
  const fullHeight = ranges.every((range) => range.r1 === 0 && range.r2 === lastRow(size));
  if (fullWidth && fullHeight && previous === "all") return "all";
  if (fullWidth && previous === "rows") return "rows";
  if (fullHeight && previous === "columns") return "columns";
  return "cells";
}

// ── Selecting ────────────────────────────────────────────────────────

/** One cell, active and the anchor. */
export function selectCell(_sel, row, col, size) {
  const cell = clampCell(row, col, size);
  return { ranges: [rangeOf(cell, cell)], active: cell, anchor: cell, mode: "cells" };
}

/** The current range from the anchor to (row, col); earlier ranges and the active cell stay. */
export function extendTo(sel, row, col, size) {
  if (!sel) return selectCell(null, row, col, size);
  const corner = clampCell(row, col, size);
  const ranges = [...sel.ranges.slice(0, -1), rangeOf(sel.anchor, corner)];
  return { ...sel, ranges, mode: modeFor(sel.mode, ranges, size) };
}

/** A new range at (row, col), keeping the earlier ones (Cmd+click). */
export function addRange(sel, row, col, size) {
  const cell = clampCell(row, col, size);
  return {
    ranges: [...(sel?.ranges || []), rangeOf(cell, cell)],
    active: cell,
    anchor: cell,
    mode: "cells",
  };
}

/**
 * Whole rows r1 to r2. `extend` reaches from the anchor's row (Shift+click a
 * row number); `add` keeps the earlier ranges (Cmd+click). The active cell is
 * the row's first cell.
 */
export function selectRows(sel, r1, r2, { size, extend = false, add = false } = {}) {
  const from = extend && sel ? sel.anchor.row : Math.min(r1, r2);
  const to = extend && sel ? r2 : Math.max(r1, r2);
  const range = { r1: Math.min(from, to), c1: 0, r2: Math.max(from, to), c2: lastColumn(size) };
  const keep = add && sel ? sel.ranges : extend && sel ? sel.ranges.slice(0, -1) : [];
  const start = { row: extend && sel ? sel.anchor.row : range.r1, col: 0 };
  return {
    ranges: [...keep, range],
    active: extend && sel ? sel.active : start,
    anchor: start,
    mode: "rows",
  };
}

/**
 * Whole columns c1 to c2, as `selectRows`. The active cell is the column's
 * first data cell, since the header above it is the column's name.
 */
export function selectColumns(sel, c1, c2, { size, extend = false, add = false } = {}) {
  const from = extend && sel ? sel.anchor.col : Math.min(c1, c2);
  const to = extend && sel ? c2 : Math.max(c1, c2);
  const range = { r1: 0, c1: Math.min(from, to), r2: lastRow(size), c2: Math.max(from, to) };
  const keep = add && sel ? sel.ranges : extend && sel ? sel.ranges.slice(0, -1) : [];
  const firstData = Math.min(1, lastRow(size));
  const start = { row: firstData, col: extend && sel ? sel.anchor.col : range.c1 };
  return {
    ranges: [...keep, range],
    active: extend && sel ? sel.active : start,
    anchor: start,
    mode: "columns",
  };
}

/** Everything; the active cell stays where it was. */
export function selectAll(sel, size) {
  const active = sel?.active || { row: Math.min(1, lastRow(size)), col: 0 };
  return {
    ranges: [{ r1: 0, c1: 0, r2: lastRow(size), c2: lastColumn(size) }],
    active,
    anchor: sel?.anchor || active,
    mode: "all",
  };
}

/** The rows the selection touches, as whole rows (Shift+Space). */
export function rowsOfSelection(sel, size) {
  const ranges = sel.ranges.map((range) => ({ ...range, c1: 0, c2: lastColumn(size) }));
  return { ...sel, ranges, mode: "rows" };
}

/** The columns the selection touches, as whole columns (Ctrl+Space). */
export function columnsOfSelection(sel, size) {
  const ranges = sel.ranges.map((range) => ({ ...range, r1: 0, r2: lastRow(size) }));
  return { ...sel, ranges, mode: "columns" };
}

// ── Moving ───────────────────────────────────────────────────────────

/**
 * Where a Cmd+arrow jump lands along one line of cells, from `start` toward
 * `step` (±1), with `max` the last index. The Sheets and Excel rule: from a
 * filled cell whose neighbor is filled, the last filled cell of the run;
 * otherwise the next filled cell; with nothing filled ahead, the edge.
 */
function jumpAlong(start, step, max, filled) {
  const inside = (index) => index >= 0 && index <= max;
  const next = start + step;
  if (!inside(next)) return start;
  if (filled(start) && filled(next)) {
    let end = next;
    while (inside(end + step) && filled(end + step)) end += step;
    return end;
  }
  for (let index = next; inside(index); index += step) {
    if (filled(index)) return index;
  }
  return step > 0 ? max : 0;
}

/** The corner of the current range opposite the anchor: the one Shift+arrow moves. */
function farCorner(sel) {
  const range = sel.ranges.at(-1);
  return {
    row: sel.anchor.row === range.r1 ? range.r2 : range.r1,
    col: sel.anchor.col === range.c1 ? range.c2 : range.c1,
  };
}

/**
 * One arrow press. Without `extend` the active cell moves and the selection
 * becomes that cell; with `extend` the far corner moves and the anchor stays.
 * `jump` moves to the edge of the data, read through `isFilled(row, col)`.
 */
export function moveActive(sel, direction, { jump = false, extend = false, size, isFilled } = {}) {
  const step = STEPS[direction];
  if (!step) return sel;
  const from = extend ? farCorner(sel) : sel.active;
  let to;
  if (jump) {
    const vertical = step.row !== 0;
    const filled = isFilled
      ? (index) => (vertical ? isFilled(index, from.col) : isFilled(from.row, index))
      : () => false;
    const along = jumpAlong(
      vertical ? from.row : from.col,
      vertical ? step.row : step.col,
      vertical ? lastRow(size) : lastColumn(size),
      filled,
    );
    to = vertical ? { row: along, col: from.col } : { row: from.row, col: along };
  } else {
    to = clampCell(from.row + step.row, from.col + step.col, size);
  }
  return extend ? extendTo(sel, to.row, to.col, size) : selectCell(sel, to.row, to.col, size);
}

/** Move (or with `extend`, stretch) to a given cell: Home, End, the first or last cell, a page away. */
export function moveTo(sel, row, col, { extend = false, size } = {}) {
  return extend ? extendTo(sel, row, col, size) : selectCell(sel, row, col, size);
}

/**
 * The active cell's next place inside a multi-cell selection after Enter
 * (down, or up with Shift) or Tab (right, or left with Shift): down a column
 * then on to the next, or along a row then on to the next, wrapping into the
 * next range and back to the first. The ranges stay. A single-cell selection
 * simply moves, so pass `size` for that case.
 */
export function nextInSelection(sel, direction, size) {
  const cells = [...cellsOf(sel)];
  if (cells.length <= 1) return size ? moveActive(sel, direction, { size }) : sel;
  const byColumn = direction === "down" || direction === "up";
  const backward = direction === "up" || direction === "left";
  const order = [];
  for (const range of sel.ranges) {
    const outer = byColumn ? [range.c1, range.c2] : [range.r1, range.r2];
    const inner = byColumn ? [range.r1, range.r2] : [range.c1, range.c2];
    for (let a = outer[0]; a <= outer[1]; a += 1) {
      for (let b = inner[0]; b <= inner[1]; b += 1) {
        order.push(byColumn ? { row: b, col: a } : { row: a, col: b });
      }
    }
  }
  const at = order.findIndex((cell) => cell.row === sel.active.row && cell.col === sel.active.col);
  const next = order[(Math.max(at, 0) + (backward ? -1 : 1) + order.length) % order.length];
  return { ...sel, active: next };
}

// ── Queries ──────────────────────────────────────────────────────────

const within = (range, row, col) => row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2;

/** Whether a grid cell is selected. */
export function contains(sel, row, col) {
  return Boolean(sel?.ranges.some((range) => within(range, row, col)));
}

/** The range that holds the active cell (the last one that does). */
export function activeRange(sel) {
  const { row, col } = sel.active;
  return [...sel.ranges].reverse().find((range) => within(range, row, col)) || sel.ranges.at(-1);
}

/** The smallest range covering every selected cell. */
export function bounds(sel) {
  return sel.ranges.reduce((box, range) => ({
    r1: Math.min(box.r1, range.r1),
    c1: Math.min(box.c1, range.c1),
    r2: Math.max(box.r2, range.r2),
    c2: Math.max(box.c2, range.c2),
  }));
}

function clipped(range, size) {
  if (!size) return range;
  return {
    r1: Math.max(range.r1, 0),
    c1: Math.max(range.c1, 0),
    r2: Math.min(range.r2, lastRow(size)),
    c2: Math.min(range.c2, lastColumn(size)),
  };
}

/** Every selected cell once, range by range, row by row. */
export function* cellsOf(sel, size) {
  const seen = sel.ranges.length > 1 ? new Set() : null;
  for (const range of sel.ranges) {
    const { r1, c1, r2, c2 } = clipped(range, size);
    for (let row = r1; row <= r2; row += 1) {
      for (let col = c1; col <= c2; col += 1) {
        const cellKey = `${row}:${col}`;
        if (seen?.has(cellKey)) continue;
        seen?.add(cellKey);
        yield { row, col };
      }
    }
  }
}

function indexesOf(sel, size, low, high) {
  const indexes = new Set();
  for (const range of sel.ranges) {
    const clip = clipped(range, size);
    for (let index = clip[low]; index <= clip[high]; index += 1) indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b);
}

/** The grid rows the selection touches, ascending. */
export function selectedRows(sel, size) {
  return indexesOf(sel, size, "r1", "r2");
}

/** The columns the selection touches, ascending. */
export function selectedColumns(sel, size) {
  return indexesOf(sel, size, "c1", "c2");
}

// ── Addresses and statistics ─────────────────────────────────────────

const cellName = (row, col) => `${columnLetters(col)}${row + 1}`;

/**
 * The selection written as the formula bar shows it. Grid row 0 is
 * spreadsheet row 1 (the header). Several ranges show the active range.
 */
export function addressOf(sel) {
  const range = activeRange(sel);
  if (sel.mode === "rows") {
    const count = range.r2 - range.r1 + 1;
    return count === 1 ? `Row ${range.r1 + 1}` : `${count} rows`;
  }
  if (sel.mode === "columns") {
    const count = range.c2 - range.c1 + 1;
    return count === 1 ? `Column ${columnLetters(range.c1)}` : `${count} columns`;
  }
  if (range.r1 === range.r2 && range.c1 === range.c2) return cellName(range.r1, range.c1);
  return `${cellName(range.r1, range.c1)}:${cellName(range.r2, range.c2)}`;
}

/** Whether a grid cell holds anything: a header name, or a data value. For the data-edge jump. */
export function filledIn(table) {
  return (row, col) => {
    const text = row === 0 ? table.columns?.[col]?.name : table.rows?.[row - 1]?.[col];
    return text != null && String(text).trim() !== "";
  };
}

/**
 * The status bar's numbers for the selected data cells (header cells never
 * count, and a cell in two ranges counts once): `count` of filled cells, and
 * over the cells that read as numbers in their column's convention,
 * `numericCount`, `sum`, `average`, `min`, and `max` (null with no numbers).
 */
export function selectionStats(table, sel) {
  const size = { rows: (table.rows?.length || 0) + 1, columns: table.columns?.length || 0 };
  let numericCount = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const { row, col } of cellsOf(sel, size)) {
    if (row === 0) continue;
    const text = table.rows[row - 1]?.[col];
    if (text == null || String(text).trim() === "") continue;
    count += 1;
    const number = parseNumber(String(text), columnParseOptions(table.columns[col]).locale);
    if (number !== null) {
      numericCount += 1;
      sum += number;
      min = Math.min(min, number);
      max = Math.max(max, number);
    }
  }
  return {
    count,
    numericCount,
    sum,
    average: numericCount ? sum / numericCount : null,
    min: numericCount ? min : null,
    max: numericCount ? max : null,
  };
}
