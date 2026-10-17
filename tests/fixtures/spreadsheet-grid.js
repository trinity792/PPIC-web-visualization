/**
 * Stage 1 contract fixtures. Grid ranges use header row 0, data rows 1..N.
 * Structural edit indexes and formula-map keys remain zero-based DATA indexes.
 * The plan leaves some signatures open; these tests propose size={rows,columns}
 * (counts including the header), selection-first pure operations, and plain
 * string matrices for clipboard/fill. No feature implementation lives here.
 */
export const range = (r1, c1, r2 = r1, c2 = c1) => ({ r1, c1, r2, c2 });
export const selection = (r1, c1, r2 = r1, c2 = c1, mode = "cells") => ({
  ranges: [range(r1, c1, r2, c2)],
  active: { row: r1, col: c1 },
  anchor: { row: r1, col: c1 },
  mode,
});
export const gridTable = () => ({
  columns: [
    { name: "Region", type: "text" },
    { name: "Yes", type: "number", unit: "number" },
    { name: "No", type: "number", unit: "number" },
  ],
  rows: [["North", "40", "60"], ["South", "30", "70"], ["West", "20", "80"]],
  formulas: {},
  rowMarks: {},
  issues: [],
});

export function freezeTable(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeTable);
    Object.freeze(value);
  }
  return value;
}
