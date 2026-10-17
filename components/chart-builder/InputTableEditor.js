"use client";

/**
 * InputTableEditor.js — the editable view of an inline table: the spreadsheet
 * data grid (components/chart-builder/data-grid/DataGrid.js).
 *
 * Kept as a thin adapter with its original props so the Import step, the
 * Edit step's Edit Data view, and DataSourcePanel did not change when the
 * grid replaced the paged table of inputs (import overhaul). The pure
 * editing helpers it used to hold live in lib/tabular/tableEdits.js. The
 * separate derived-column builder was removed (owner, 2026-10-16): a formula
 * typed in a cell and filled down does the same, and stays live.
 *
 * Props:
 *   onUndo/onRedo {Function} — undo and redo the store’s last edit
 *   table     {Object}   — the inline table (columns, rows, formulas, rowMarks, issues)
 *   onChange  {function} — next-table callback (immutably produced)
 *   onRevert  {function} — restore the original upload
 *   focus     {Object}   — passed to the grid: a cell to select and scroll to
 *   usage     {Object}   — passed to the grid: what the chart uses each column for
 */

import React from "react";

import DataGrid from "@/components/chart-builder/data-grid/DataGrid";

export default function InputTableEditor({ table, onChange, onRevert, focus = null, usage = null, onUndo, onRedo }) {
  return <DataGrid table={table} onChange={onChange} onRevert={onRevert} focus={focus} usage={usage} onUndo={onUndo} onRedo={onRedo} />;
}
