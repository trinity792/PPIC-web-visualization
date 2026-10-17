/** Import overhaul, phase 1: the grid's edits, each a pure table → table step. */

import { describe, expect, it } from "vitest";

import { applyFinding } from "@/lib/tabular/cleanTable";
import * as edits from "@/lib/tabular/tableEdits";
import { freezeTable, gridTable, range, selection } from "@/tests/fixtures/spreadsheet-grid";
import {
  COLUMN_KINDS,
  addFormulaColumn,
  pasteBlock,
  promoteRowToHeader,
  columnKind,
  deleteColumn,
  deleteRow,
  fillDown,
  insertColumn,
  insertRow,
  markRows,
  renameColumn,
  setCell,
  setColumnKind,
} from "@/lib/tabular/tableEdits";

const base = () => ({
  columns: [
    { name: "Region", type: "text" },
    { name: "Yes", type: "number", unit: "number" },
    { name: "No", type: "number", unit: "number" },
  ],
  rows: [["North", "40", "60"], ["South", "30", "70"]],
  issues: [],
});

describe("setCell", () => {
  it("writes a value and never changes the table it was given", () => {
    const table = base();
    const next = setCell(table, 0, 1, "45");
    expect(next.rows[0][1]).toBe("45");
    expect(table.rows[0][1]).toBe("40");
  });

  it("stores a formula and shows its value", () => {
    const next = setCell(base(), 1, 1, "=B2 * 2");
    expect(next.formulas).toEqual({ "1:1": "=B2 * 2" });
    expect(next.rows[1][1]).toBe("80");
  });

  it("recomputes formulas that read an edited cell", () => {
    const withFormula = setCell(base(), 1, 1, "=B2 * 2");
    expect(setCell(withFormula, 0, 1, "10").rows[1][1]).toBe("20");
  });

  it("drops a cell's formula when a plain value replaces it", () => {
    const next = setCell(setCell(base(), 1, 1, "=B2 * 2"), 1, 1, "5");
    expect(next.formulas).toEqual({});
    expect(next.rows[1][1]).toBe("5");
  });
});

describe("structure", () => {
  it("inserts and deletes rows, moving formulas and row marks with them", () => {
    let table = setCell(base(), 1, 2, "=100 - B3");
    table = markRows(table, [1], "excluded");
    const inserted = insertRow(table, 0);
    expect(inserted.rows).toHaveLength(3);
    expect(inserted.rows[0]).toEqual(["", "", ""]);
    expect(inserted.formulas).toEqual({ "2:2": "=100 - B4" });
    expect(inserted.rowMarks).toEqual({ 2: "excluded" });
    const deleted = deleteRow(inserted, 0);
    expect(deleted.formulas).toEqual({ "1:2": "=100 - B3" });
    expect(deleted.rowMarks).toEqual({ 1: "excluded" });
  });

  it("inserts and deletes columns, moving formulas with them", () => {
    const table = setCell(base(), 0, 2, "=100 - B2");
    const inserted = insertColumn(table, 1, { name: "Notes", type: "text" });
    expect(inserted.columns.map((c) => c.name)).toEqual(["Region", "Notes", "Yes", "No"]);
    expect(inserted.formulas).toEqual({ "0:3": "=100 - C2" });
    expect(inserted.rows[0][3]).toBe("60");
    expect(deleteColumn(inserted, 1).formulas).toEqual({ "0:2": "=100 - B2" });
  });

  it("renames header-name references when a column is renamed", () => {
    const table = setCell(base(), 0, 2, "=100 - [Yes]");
    const renamed = renameColumn(table, 1, "Agree");
    expect(renamed.formulas).toEqual({ "0:2": "=100 - [Agree]" });
    expect(renamed.rows[0][2]).toBe("60");
  });

  it("fills a formula down, moving its relative references", () => {
    const table = fillDown(setCell(base(), 0, 2, "=100 - B2"), { row: 0, col: 2 }, 1);
    expect(table.formulas).toEqual({ "0:2": "=100 - B2", "1:2": "=100 - B3" });
    expect(table.rows.map((row) => row[2])).toEqual(["60", "70"]);
  });

  it("fills a plain value down as a copy", () => {
    const table = fillDown(base(), { row: 0, col: 0 }, 1);
    expect(table.rows.map((row) => row[0])).toEqual(["North", "North"]);
  });
});

describe("column kinds", () => {
  it("reads each column's kind from its type, unit, and ignored flag", () => {
    const table = { columns: [
      { name: "A", type: "text" }, { name: "B", type: "group" }, { name: "C", type: "date" },
      { name: "D", type: "number", unit: "percent" }, { name: "E", type: "number", ignored: true },
    ] };
    expect(table.columns.map(columnKind)).toEqual(["label", "group", "time", "percent", "ignore"]);
    expect(COLUMN_KINDS.map((kind) => kind.id)).toEqual(["label", "group", "time", "number", "percent", "usd", "ignore"]);
  });

  it("sets a kind as the reader's own choice", () => {
    const percent = setColumnKind(base(), 1, "percent");
    expect(percent.columns[1]).toMatchObject({ type: "number", unit: "percent", forced: true, unitForced: true });
    const time = setColumnKind(base(), 0, "time");
    expect(time.columns[0]).toMatchObject({ type: "date", forced: true });
    expect(time.columns[0].unit).toBeUndefined();
  });

  it("ignores a column without losing its type, and un-ignores it", () => {
    const ignored = setColumnKind(base(), 2, "ignore");
    expect(ignored.columns[2]).toMatchObject({ type: "number", ignored: true });
    const back = setColumnKind(ignored, 2, "number");
    expect(back.columns[2].ignored).toBeUndefined();
  });
});

describe("row marks", () => {
  it("marks and clears rows", () => {
    const marked = markRows(base(), [0, 1], "total");
    expect(marked.rowMarks).toEqual({ 0: "total", 1: "total" });
    expect(markRows(marked, [0], null).rowMarks).toEqual({ 1: "total" });
  });
});

describe("formula columns", () => {
  it("adds a live column from a derived-column formula", () => {
    const table = addFormulaColumn(base(), "Total", "Yes + No");
    expect(table.columns.at(-1)).toMatchObject({ name: "Total", type: "number" });
    expect(table.rows.map((row) => row[3])).toEqual(["100", "100"]);
    expect(setCell(table, 0, 1, "50").rows[0][3]).toBe("110");
  });
});

describe("pasting and headers", () => {
  it("pastes a block from a cell, growing the table and reading formulas", () => {
    const table = pasteBlock(base(), { row: 1, col: 1 }, "5\t6\t=B3+C3\n7\t8\t9\n");
    expect(table.rows).toEqual([
      ["North", "40", "60", ""],
      ["South", "5", "6", "11"],
      ["", "7", "8", "9"],
    ]);
    expect(table.formulas).toEqual({ "1:3": "=B3+C3" });
    expect(table.columns[3]).toMatchObject({ name: "Column 4", type: "number" });
  });

  it("uses a data row as the header, and undoes it", () => {
    const table = { ...base(), rows: [["Survey 2024", "", ""], ["Place", "Agree", "Disagree"], ...base().rows] };
    const chosen = promoteRowToHeader(table, 1);
    expect(chosen.columns.map((c) => c.name)).toEqual(["Place", "Agree", "Disagree"]);
    expect(chosen.rows).toEqual(base().rows);
    expect(chosen.columns[1].type).toBe("number");
    const finding = chosen.findings.find((entry) => entry.code === "headerChosen");
    const undone = applyFinding(chosen, finding);
    expect(undone.columns.map((c) => c.name)).toEqual(["Region", "Yes", "No"]);
    expect(undone.rows).toEqual(table.rows);
    expect(undone.findings.some((entry) => entry.code === "headerChosen")).toBe(false);
  });
});

/**
 * Spreadsheet workstreams 3–5. Namespace calls keep the existing tests runnable
 * while new exports are absent. Selection/range arguments use grid coordinates.
 * Proposed clipboard provenance options: source={row,col} in grid coordinates,
 * cut=source selection, and computed=the copied value matrix for values-only.
 * insertFormulaColumn returns {table,col}; col is the inserted column index.
 */
describe("spreadsheet paste", () => {
  it("fills a selected range from one pasted value", () => {
    const source = freezeTable(gridTable());
    const sel = { ...selection(1, 1, 2, 2), ranges: [range(1, 1, 2, 2), range(3, 0)] };
    expect(edits.pasteCells(source, sel, [["7"]]).rows).toEqual([["North", "7", "7"], ["South", "7", "7"], ["7", "20", "80"]]);
    expect(source.rows[0][1]).toBe("40");
  });

  it("repeats a block over a range that is a multiple of its size", () => {
    const source = { ...gridTable(), rows: Array.from({ length: 4 }, () => ["keep", "", ""]) };
    expect(edits.pasteCells(source, selection(1, 1, 4, 2), [["1", "2"], ["3", "4"]]).rows)
      .toEqual([["keep", "1", "2"], ["keep", "3", "4"], ["keep", "1", "2"], ["keep", "3", "4"]]);
  });

  it("moves a pasted formula's references when it was copied here", () => {
    const next = edits.pasteCells(gridTable(), selection(2, 2), [["=B2+$B$2"]], { source: { row: 1, col: 2 } });
    expect(next.formulas).toEqual({ "1:2": "=B3+$B$2" });
    expect(next.rows[1][2]).toBe("70");
    const external = edits.pasteCells(gridTable(), selection(2, 2), [["=B2+$B$2"]]);
    expect(external.formulas).toEqual({ "1:2": "=B2+$B$2" });
    expect(external.rows[1][2]).toBe("80");
  });

  it("pastes values only", () => {
    const source = setCell(gridTable(), 1, 2, "=B3*2");
    const next = edits.pasteCells(source, selection(2, 2), [["=100-B2"]], { values: true, computed: [["60"]], source: { row: 1, col: 2 } });
    expect(next.rows[1][2]).toBe("60");
    expect(next.formulas).toEqual({});
  });

  it("pastes a cut and clears its source in one edit", () => {
    const source = freezeTable(gridTable());
    const next = edits.pasteCells(source, selection(3, 1), [["40", "60"]], { cut: selection(1, 1, 1, 2) });
    expect(next.rows).toEqual([["North", "", ""], ["South", "30", "70"], ["West", "40", "60"]]);
    expect(source.rows[0]).toEqual(["North", "40", "60"]);
  });

  it("does not clear the pasted destination when a cut overlaps its source", () => {
    const source = gridTable();
    const next = edits.pasteCells(source, selection(2, 1), [["40"], ["30"]], { cut: selection(1, 1, 2, 1) });
    expect(next.rows.map((row) => row[1])).toEqual(["", "40", "30"]);
  });

  it("retargets relative, absolute, and range references to cut cells", () => {
    let source = setCell(gridTable(), 2, 2, '=SUM(B2:B3)+$B$2+B$3');
    source = setCell(source, 0, 2, '=B2&"B2"');
    const next = edits.pasteCells(freezeTable(source), selection(2, 1), [["40"], ["30"]], { cut: selection(1, 1, 2, 1) });
    expect(next.formulas).toEqual({ "2:2": '=SUM(B3:B4)+$B$3+B$4', "0:2": '=B3&"B2"' });
    expect(next.rows[2][2]).toBe("140");
    expect(source.formulas["0:2"]).toBe('=B2&"B2"');
  });

  it("retargets references inside a moved formula without shifting its other references", () => {
    const source = setCell(gridTable(), 0, 2, "=B2+$B$3");
    const next = edits.pasteCells(freezeTable(source), selection(3, 1), [["40", "=B2+$B$3"]], { cut: selection(1, 1, 1, 2) });
    expect(next.formulas).toEqual({ "2:2": "=B4+$B$3" });
    expect(next.rows[2][2]).toBe("70");
  });

  it("grows for a non-tiling block and infers new columns", () => {
    const next = edits.pasteCells(gridTable(), selection(3, 2), [["5", "6"], ["7", "8"]]);
    expect(next.rows).toEqual([["North", "40", "60", ""], ["South", "30", "70", ""], ["West", "20", "5", "6"], ["", "", "7", "8"]]);
    expect(next.columns[3].type).toBe("number");
  });
});

describe("spreadsheet fill", () => {
  it.each([
    ["down", range(1, 1, 2, 1), range(1, 1, 4, 1), ["1", "2", "3", "4"]],
    ["up", range(3, 1, 4, 1), range(1, 1, 4, 1), ["1", "2", "3", "4"]],
    ["right", range(1, 0, 1, 1), range(1, 0, 1, 3), ["1", "2", "3", "4"]],
    ["left", range(1, 2, 1, 3), range(1, 0, 1, 3), ["1", "2", "3", "4"]],
  ])("fills a range down, up, right, and left: %s", (direction, from, to, expected) => {
    const source = { columns: ["A", "B", "C", "D"].map((name) => ({ name, type: "number", forced: true })), rows: Array.from({ length: 4 }, () => ["", "", "", ""]) };
    if (direction === "down") { source.rows[0][1] = "1"; source.rows[1][1] = "2"; }
    if (direction === "up") { source.rows[2][1] = "3"; source.rows[3][1] = "4"; }
    if (direction === "right") source.rows[0] = ["1", "2", "", ""];
    if (direction === "left") source.rows[0] = ["", "", "3", "4"];
    const next = edits.fillRange(freezeTable(source), from, to);
    expect(["up", "down"].includes(direction) ? next.rows.map((row) => row[1]) : next.rows[0]).toEqual(expected);
    expect(next.columns).toEqual(source.columns);
  });

  it("fills down and right from the selection's first row or column", () => {
    const source = setCell(gridTable(), 0, 2, "=B2+$B$2");
    const down = edits.fillDownSelection(source, selection(1, 1, 3, 2));
    expect(down.rows).toEqual([["North", "40", "80"], ["South", "40", "80"], ["West", "40", "80"]]);
    expect(down.formulas).toEqual({ "0:2": "=B2+$B$2", "1:2": "=B3+$B$2", "2:2": "=B4+$B$2" });
    const right = edits.fillRightSelection(gridTable(), selection(1, 1, 2, 2));
    expect(right.rows).toEqual([["North", "40", "40"], ["South", "30", "30"], ["West", "20", "80"]]);
  });

  it("fills a single cell from the cell above or to the left", () => {
    expect(edits.fillDownSelection(gridTable(), selection(2, 1)).rows[1]).toEqual(["South", "40", "70"]);
    expect(edits.fillRightSelection(gridTable(), selection(2, 2)).rows[1]).toEqual(["South", "30", "30"]);
  });

  it("fills to the end of the neighboring column's data", () => {
    const source = { ...gridTable(), rows: [["a", "7", "x"], ["b", "", "y"], ["c", "", ""], ["", "", ""]] };
    expect(edits.fillToEnd(source, selection(1, 1)).rows.map((row) => row[1])).toEqual(["7", "7", "7", ""]);
    source.rows.forEach((row) => { row[0] = ""; });
    expect(edits.fillToEnd(source, selection(1, 1)).rows.map((row) => row[1])).toEqual(["7", "7", "", ""]);
  });
});

describe("spreadsheet structure", () => {
  it("moves rows with their formulas, marks, and order", () => {
    const source = markRows(setCell(gridTable(), 0, 2, "=B2+B4"), [0], "total");
    source.rowMarks[2] = "note";
    const next = edits.moveRows(freezeTable(source), [0, 2], 1);
    // `to` is an insertion boundary in the ORIGINAL table; [0,2] land before 1.
    expect(next.rows.map((row) => row[0])).toEqual(["North", "West", "South"]);
    expect(next.formulas).toEqual({ "0:2": "=B2+B3" });
    expect(next.rows[0][2]).toBe("60");
    expect(next.rowMarks).toEqual({ 0: "total", 1: "note" });
  });

  it("moves columns with their formulas, kinds, and ignored flags", () => {
    const source = setCell(gridTable(), 0, 2, "=B2*2");
    source.columns[1] = { ...source.columns[1], forced: true, unitForced: true, unit: "percent", ignored: true };
    const next = edits.moveColumns(freezeTable(source), [1, 2], 0);
    expect(next.columns).toEqual([source.columns[1], source.columns[2], source.columns[0]]);
    expect(next.rows[0]).toEqual(["40", "80", "North"]);
    expect(next.formulas).toEqual({ "0:1": "=A2*2" });
  });

  it.each([
    ["number", ["10", "2", "", "n/a", "30"], [1, 0, 4, 2, 3], [4, 0, 1, 2, 3]],
    ["text", ["Item 10", "Item 2", "", "n/a", "Item 30"], [1, 0, 4, 2, 3], [4, 0, 1, 2, 3]],
    ["date", ["Feb 2026", "Dec 2025", "", "n/a", "Mar 2026"], [1, 0, 4, 2, 3], [4, 0, 1, 2, 3]],
  ])("sorts numbers, text, and dates, blanks last, header fixed, marks moving: %s", (type, values, ascending, descending) => {
    const source = { ...gridTable(), columns: [{ name: "ID", type: "text" }, { name: "Sort", type }], rows: values.map((value, i) => [String(i), value]), rowMarks: { 0: "total", 2: "excluded" } };
    freezeTable(source);
    for (const [direction, order] of [["asc", ascending], ["desc", descending]]) {
      const next = edits.sortRows(source, 1, direction);
      expect(next.rows.map((row) => Number(row[0]))).toEqual(order);
      expect(next.columns).toEqual(source.columns);
      expect(next.rowMarks).toEqual({ [order.indexOf(0)]: "total", [order.indexOf(2)]: "excluded" });
    }
  });

  it("sorts only the selected rectangle, leaving other columns and row marks in place", () => {
    const source = freezeTable(markRows(gridTable(), [0], "total"));
    const next = edits.sortRange(source, selection(1, 1, 2, 2), 1, "asc");
    expect(next.rows).toEqual([["North", "30", "70"], ["South", "40", "60"], source.rows[2]]);
    expect(next.rowMarks).toEqual({ 0: "total" });
  });

  it("adjusts formulas sorted inside a rectangle while outside formulas keep their addresses", () => {
    let source = setCell(gridTable(), 0, 2, "=B2+$B$4");
    source = setCell(source, 1, 2, "=B3+$B$4");
    source = setCell(source, 2, 2, "=B2");
    const next = edits.sortRange(freezeTable(source), selection(1, 1, 2, 2), 1, "asc");
    expect(next.formulas).toEqual({ "0:2": "=B2+$B$4", "1:2": "=B3+$B$4", "2:2": "=B2" });
    expect(next.rows.map((row) => row[2])).toEqual(["50", "60", "30"]);
  });

  it("sorts by computed formula values and keeps references with their rows", () => {
    let source = gridTable();
    for (let r = 0; r < 3; r += 1) source = setCell(source, r, 2, `=B${r + 2}*2`);
    const next = edits.sortRows(source, 2, "asc");
    expect(next.rows).toEqual([["West", "20", "40"], ["South", "30", "60"], ["North", "40", "80"]]);
    expect(next.formulas).toEqual({ "0:2": "=B2*2", "1:2": "=B3*2", "2:2": "=B4*2" });
  });

  it("inserts and deletes several rows and columns at once", () => {
    const source = markRows(setCell(gridTable(), 2, 2, "=B2+B4"), [2], "total");
    const rows = edits.insertRows(source, 1, 2);
    expect(rows.rows).toEqual([source.rows[0], ["", "", ""], ["", "", ""], source.rows[1], source.rows[2]]);
    expect(rows.formulas).toEqual({ "4:2": "=B2+B6" });
    expect(rows.rowMarks).toEqual({ 4: "total" });
    expect(edits.deleteRows(rows, [1, 2]).rows).toEqual(source.rows);
    expect(edits.deleteRows(rows, [0, 1]).formulas).toEqual({ "2:2": "=#REF!+B4" });
    const cols = edits.insertColumns(source, 1, 2);
    expect(cols.columns).toHaveLength(5);
    expect(cols.rows[0]).toEqual(["North", "", "", "40", "60"]);
    expect(cols.formulas).toEqual({ "2:4": "=D2+D4" });
    expect(edits.deleteColumns(cols, [1, 2]).formulas).toEqual(source.formulas);
    expect(edits.deleteColumns(cols, [1, 3]).formulas).toEqual({ "2:2": "=#REF!+#REF!" });
  });

  it("clears values and formulas in a selection", () => {
    const source = markRows(setCell(gridTable(), 0, 2, "=B2*2"), [1], "total");
    const next = edits.clearRange(freezeTable(source), selection(1, 1, 2, 2));
    expect(next.rows).toEqual([["North", "", ""], ["South", "", ""], ["West", "20", "80"]]);
    expect(next.formulas).toEqual({});
    expect(next.rowMarks).toEqual(source.rowMarks);
    expect(next.columns).toEqual(source.columns);
  });

  it("inserts a formula column to the right of a column", () => {
    const source = setCell(gridTable(), 0, 2, "=B2*2");
    const { table: next, col } = edits.insertFormulaColumn(source, 1);
    expect(col).toBe(2);
    expect(next.columns.map((c) => c.name)).toEqual(["Region", "Yes", "Formula 1", "No"]);
    expect(next.rows[0]).toEqual(["North", "40", "", "80"]);
    expect(next.formulas).toEqual({ "0:3": "=B2*2" });
    expect(edits.insertFormulaColumn(next, 2).table.columns[3].name).toBe("Formula 2");
  });
});
