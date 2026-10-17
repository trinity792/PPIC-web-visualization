/**
 * gridClipboard.js — copying cells out of the data grid and reading what is
 * pasted in (spreadsheet grid plan, workstream 3).
 *
 * A copy writes two formats, as Sheets and Excel do: tab-separated text (a
 * cell holding a tab, a newline, or a quote is quoted, inner quotes doubled)
 * and an HTML table, so a paste into a spreadsheet keeps cell boundaries. A
 * formula cell copies its formula in the text when the copy is meant for
 * this editor (`formulas: true`), its value in the HTML, and its formula
 * again in a `data-formula` attribute. A paste prefers an HTML table (merged
 * cells become blanks, `<br>` becomes a newline) and falls back to the text.
 *
 * Grid positions follow lib/tabular/gridSelection.js: row 0 is the header
 * (the column names) and row r ≥ 1 is data row r − 1.
 *
 * Adapted from Fortune-sheet (MIT, https://github.com/ruilisi/fortune-sheet):
 * the HTML table a copy writes, from `rangeValueToHtml` and `copy`.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   rangeToClipboard(table, range, { formulas }) — { text, html } for one range
 *   selectionToClipboard(table, sel, { formulas }) — { text, html }; several ranges
 *                                     copy as one block when they line up, else the
 *                                     active range alone
 *   parseClipboard({ text, html })  — the pasted cells as rows of strings
 *   selectionClipboardAxes(sel)    — original row/column indexes of the block
 *
 * Data sources:
 *   - lib/tabular/gridSelection.js (the active range)
 */

import { activeRange } from "./gridSelection";

const NEEDS_QUOTES = /[\t\n\r"]/;

function quoteCell(text) {
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A grid cell's shown value and, when it has one, its formula. */
function gridCell(table, row, col) {
  if (row === 0) return { value: table.columns?.[col]?.name ?? "" };
  const value = table.rows?.[row - 1]?.[col] ?? "";
  const formula = table.formulas?.[`${row - 1}:${col}`];
  return formula ? { value, formula } : { value };
}

/** Clipboard formats for the cells at the given grid rows and columns. */
function blockToClipboard(table, rows, cols, { formulas = false } = {}) {
  const cells = rows.map((row) => cols.map((col) => gridCell(table, row, col)));
  const text = cells
    .map((line) => line.map((cell) => quoteCell(String(formulas && cell.formula ? cell.formula : cell.value))).join("\t"))
    .join("\n");
  const body = cells
    .map((line) => {
      const tds = line.map((cell) => {
        const attribute = formulas && cell.formula ? ` data-formula="${escapeHtml(cell.formula)}"` : "";
        const shown = escapeHtml(cell.value).replace(/\r?\n/g, '<br style="mso-data-placement:same-cell;">');
        return `<td${attribute}>${shown}</td>`;
      });
      return `<tr>${tds.join("")}</tr>`;
    })
    .join("");
  return { text, html: `<meta charset="utf-8"><table><tbody>${body}</tbody></table>` };
}

const span = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** One range (grid coordinates) as `{ text, html }`. */
export function rangeToClipboard(table, range, options = {}) {
  return blockToClipboard(table, span(range.r1, range.r2), span(range.c1, range.c2), options);
}

/**
 * The selection as `{ text, html }`. As in Sheets, ranges that all cover the
 * same rows copy side by side, ranges that all cover the same columns copy
 * one above another, and anything else copies the active range alone.
 */
export function selectionToClipboard(table, sel, options = {}) {
  const { rows, columns } = selectionClipboardAxes(sel);
  return blockToClipboard(table, rows, columns, options);
}

/** The actual source indexes of the compact clipboard block, including gaps. */
export function selectionClipboardAxes(sel) {
  const { ranges } = sel;
  const sameRows = ranges.every((range) => range.r1 === ranges[0].r1 && range.r2 === ranges[0].r2);
  const sameColumns = ranges.every((range) => range.c1 === ranges[0].c1 && range.c2 === ranges[0].c2);
  const union = (low, high) =>
    [...new Set(ranges.flatMap((range) => span(range[low], range[high])))].sort((a, b) => a - b);
  if (sameRows) return { rows: span(ranges[0].r1, ranges[0].r2), columns: union("c1", "c2") };
  if (sameColumns) return { rows: union("r1", "r2"), columns: span(ranges[0].c1, ranges[0].c2) };
  const range = activeRange(sel);
  return { rows: span(range.r1, range.r2), columns: span(range.c1, range.c2) };
}

// ── Reading a paste ──────────────────────────────────────────────────

const pad = (rows) => {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
};

// A placeholder for a <br> while the cell's layout whitespace is collapsed.
const LINE_BREAK = "";

/** A table cell's text: layout whitespace collapsed, <br> kept as a newline, a formula preferred. */
function htmlCellText(cell, doc) {
  const formula = cell.getAttribute("data-formula");
  if (formula) return formula;
  const copy = cell.cloneNode(true);
  copy.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode(LINE_BREAK)));
  return copy.textContent
    .replace(/[ \t\r\n\f]+/g, " ")
    .trim()
    .replace(new RegExp(` ?${LINE_BREAK} ?`, "g"), "\n");
}

/** The first HTML table's cells, merged cells spread as blanks; null without a table. */
function parseHtmlTable(html) {
  if (!html || typeof DOMParser === "undefined" || !/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const grid = [];
  [...table.querySelectorAll("tr")].forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const cell of tr.querySelectorAll("td,th")) {
      while (grid[r][c] !== undefined) c += 1;
      const rowSpan = Math.max(1, Number(cell.getAttribute("rowspan")) || 1);
      const colSpan = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
      for (let dr = 0; dr < rowSpan; dr += 1) {
        grid[r + dr] = grid[r + dr] || [];
        for (let dc = 0; dc < colSpan; dc += 1) {
          grid[r + dr][c + dc] = dr === 0 && dc === 0 ? htmlCellText(cell, doc) : "";
        }
      }
      c += colSpan;
    }
  });
  return pad(grid.map((row) => Array.from(row, (cell) => cell ?? "")));
}

/** Tab-separated text, reading quoted cells as Excel writes them. A trailing newline ends the last row. */
function parseText(text) {
  const source = String(text ?? "");
  if (source === "") return [];
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let atCellStart = true;
  while (i < source.length) {
    const ch = source[i];
    if (atCellStart && ch === '"') {
      // A quoted cell runs to the quote not followed by another quote.
      let end = i + 1;
      let value = "";
      while (end < source.length) {
        if (source[end] === '"') {
          if (source[end + 1] === '"') {
            value += '"';
            end += 2;
            continue;
          }
          break;
        }
        value += source[end];
        end += 1;
      }
      const next = source[end + 1];
      if (end < source.length && (next === undefined || next === "\t" || next === "\n" || next === "\r")) {
        cell = value;
        i = end + 1;
        atCellStart = false;
        continue;
      }
    }
    atCellStart = false;
    if (ch === "\t") {
      row.push(cell);
      cell = "";
      atCellStart = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
    } else {
      cell += ch;
    }
    i += 1;
  }
  if (!atCellStart || cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return pad(rows);
}

/** The pasted cells as rows of strings: an HTML table when there is one, else the text. */
export function parseClipboard({ text = "", html = "" } = {}) {
  return parseHtmlTable(html) ?? parseText(text);
}
