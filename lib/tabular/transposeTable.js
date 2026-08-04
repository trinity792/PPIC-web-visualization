/**
 * transposeTable.js — matrix-transpose an inline table (header row included),
 * carrying a reader's forced column types with it (Workstream G).
 *
 * `InputTableEditor.js`'s `transpose()` used to rebuild `columns` from
 * `inferColumnType` alone, discarding any type the reader had forced through
 * the per-column select. Transposing twice — to check something, then back —
 * silently dropped the correction. Two cases are handled here:
 *
 *   - The round trip: `transposeTable(transposeTable(t))` deep-equals `t`,
 *     forced types included, by *restoring* a snapshot taken on the way out
 *     rather than by re-inferring and hoping the second inference agrees
 *     with the first.
 *   - The one-way move: a forced type on a column whose *name* survives the
 *     transpose (only ever old column 0 — position (0, 0) is the one cell a
 *     transpose never moves) carries to the new column of that name. A name
 *     that does not survive keeps its freshly inferred type.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   transposeTable(table) — { columns, rows, issues } -> { columns, rows,
 *                            issues, transposedFrom }, or the restored
 *                            snapshot (no `transposedFrom`) on a round trip
 *
 * Data sources:
 *   - lib/tabular/columnTypes.js (inferColumnType)
 */

import { inferColumnType } from "./columnTypes";

/** Deep-enough clone for a { columns, rows, issues } table: plain data only. */
function cloneTable(table) {
  return {
    columns: (table.columns || []).map((column) => ({ ...column })),
    rows: (table.rows || []).map((row) => [...row]),
    issues: [...(table.issues || [])],
  };
}

/**
 * Whether `table` (the table just handed to `transposeTable`) is still
 * shaped exactly as it was the moment `snapshot` was transposed into it — a
 * fresh transpose(snapshot) would produce `snapshot.rows.length + 1` columns
 * and `snapshot.columns.length - 1` rows. Any edit since then (a row added
 * or removed) changes one of those counts, and the stale snapshot must be
 * discarded rather than restored.
 */
function matchesSnapshotShape(table, snapshot) {
  return (
    table.columns.length === snapshot.rows.length + 1 &&
    table.rows.length === Math.max(0, snapshot.columns.length - 1)
  );
}

/** The actual matrix transpose + type inference + forced-type carry-forward. */
function transposeFresh(table) {
  const columns = table.columns || [];
  const rows = table.rows || [];
  const header = columns.map((column) => column.name);
  const grid = [header, ...rows];
  const rowCount = grid.length;
  const colCount = header.length;

  // grid[r][c] ?? "" pads a ragged row to the full column count, matching
  // today's behavior.
  const transposed = Array.from({ length: colCount }, (_, c) =>
    Array.from({ length: rowCount }, (_, r) => grid[r][c] ?? ""),
  );
  const [newHeader, ...newRows] = transposed;

  // A forced type carries to the new column whose name matches the old
  // column's name. In practice this can only ever be old column 0: the new
  // header row is old column 0's own header plus its row values (transposing
  // never moves position (0, 0)), so no other old column's name can appear
  // in it except by data coincidence.
  const forcedByName = new Map(
    columns.filter((column) => column.forced === true).map((column) => [column.name, column]),
  );

  const newColumns = newHeader.map((name, index) => {
    const label = name || `Column ${index + 1}`;
    const forced = forcedByName.get(label);
    if (forced) {
      return { name: label, type: forced.type, forced: true };
    }
    return {
      name: label,
      type: inferColumnType(newRows.map((row) => row[index]), {
        columnName: label,
      }).type,
    };
  });

  return {
    columns: newColumns,
    rows: newRows,
    issues: [...(table.issues || [])],
    // Snapshot of the table as it stood right before this transpose, so the
    // next transpose can restore it verbatim instead of re-inferring.
    transposedFrom: cloneTable(table),
  };
}

/**
 * Transpose `table`. Returns a fresh transpose (with a `transposedFrom`
 * snapshot attached) unless `table` itself carries a `transposedFrom` whose
 * shape still matches — in which case that snapshot is returned verbatim,
 * with `transposedFrom` cleared, making the round trip exact by
 * construction.
 */
export function transposeTable(table) {
  if (table?.transposedFrom && matchesSnapshotShape(table, table.transposedFrom)) {
    return cloneTable(table.transposedFrom);
  }
  return transposeFresh(table);
}
