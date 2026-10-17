/** Spreadsheet plan, workstream 1. Missing module is intentionally isolated. */
import { describe, expect, it } from "vitest";
import * as grid from "@/lib/tabular/gridSelection";
import { freezeTable, gridTable, range, selection } from "@/tests/fixtures/spreadsheet-grid";

const size = { rows: 6, columns: 5 };
const cell = (row, col) => grid.selectCell(null, row, col, size);

describe("spreadsheet selection", () => {
  it("computes statistics for a large selection without overflowing the call stack", () => {
    const table = { columns: [{ name: "Value", type: "number" }], rows: Array.from({ length: 150000 }, () => ["2"]) };
    expect(grid.selectionStats(table, selection(1, 0, 150000, 0))).toMatchObject({ count: 150000, sum: 300000, min: 2, max: 2 });
  });
  it("selects a cell, extends from the anchor, and keeps the anchor", () => {
    const start = freezeTable(cell(4, 3));
    expect(start).toEqual(selection(4, 3));
    const extended = grid.extendTo(start, 1, 1, size);
    expect(extended.ranges).toEqual([range(1, 1, 4, 3)]);
    expect(extended.anchor).toEqual({ row: 4, col: 3 });
    expect(grid.extendTo(extended, 5, 4, size).ranges).toEqual([range(4, 3, 5, 4)]);
    expect(start.ranges).toEqual([range(4, 3)]);
  });

  it("adds a range with Cmd and keeps the earlier ones", () => {
    const added = grid.addRange(selection(1, 0, 2, 1), 4, 3, size);
    expect(added.ranges).toEqual([range(1, 0, 2, 1), range(4, 3)]);
    expect(added.active).toEqual({ row: 4, col: 3 });
    expect(grid.extendTo(added, 5, 4, size).ranges).toEqual([range(1, 0, 2, 1), range(4, 3, 5, 4)]);
  });

  it("selects whole rows and columns, extending and adding", () => {
    const rows = grid.selectRows(cell(1, 2), 2, 3, { size });
    expect(rows).toMatchObject({ mode: "rows", ranges: [range(2, 0, 3, 4)], active: { row: 2, col: 0 } });
    expect(grid.selectRows(rows, 5, 5, { size, extend: true }).ranges).toEqual([range(2, 0, 5, 4)]);
    expect(grid.selectRows(rows, 5, 5, { size, add: true }).ranges).toEqual([range(2, 0, 3, 4), range(5, 0, 5, 4)]);
    const cols = grid.selectColumns(cell(1, 0), 1, 2, { size });
    expect(cols).toMatchObject({ mode: "columns", ranges: [range(0, 1, 5, 2)], active: { row: 1, col: 1 } });
    expect(grid.selectColumns(cols, 4, 4, { size, extend: true }).ranges).toEqual([range(0, 1, 5, 4)]);
    expect(grid.selectColumns(cols, 4, 4, { size, add: true }).ranges).toEqual([range(0, 1, 5, 2), range(0, 4, 5, 4)]);
    expect(grid.rowsOfSelection(selection(2, 1, 3, 2), size).ranges).toEqual([range(2, 0, 3, 4)]);
    expect(grid.columnsOfSelection(selection(2, 1, 3, 2), size).ranges).toEqual([range(0, 1, 5, 2)]);
  });

  it("selects everything", () => {
    expect(grid.selectAll(cell(2, 2), size)).toMatchObject({ mode: "all", ranges: [range(0, 0, 5, 4)] });
  });

  it.each([
    ["up", 0, 2, 0, 2], ["down", 5, 2, 5, 2], ["left", 2, 0, 2, 0], ["right", 2, 4, 2, 4],
    ["up", 2, 2, 1, 2], ["down", 2, 2, 3, 2], ["left", 2, 2, 2, 1], ["right", 2, 2, 2, 3],
  ])("moves one cell and stops at the edges: %s from %i,%i", (direction, row, col, r, c) => {
    expect(grid.moveActive(cell(row, col), direction, { size }).active).toEqual({ row: r, col: c });
  });

  it.each(["up", "down", "left", "right"])("jumps to the end of a filled run, the next filled cell, or the edge: %s", (direction) => {
    const vertical = ["up", "down"].includes(direction);
    const reverse = ["up", "left"].includes(direction);
    const position = (n) => reverse ? 7 - n : n;
    const at = (n) => vertical ? selection(position(n), 1) : selection(1, position(n));
    const isFilled = (r, c) => [1, 2, 3, 5].includes(position(vertical ? r : c));
    for (const [from, to] of [[1, 3], [3, 5], [4, 5], [5, 7]]) {
      const moved = grid.moveActive(at(from), direction, { jump: true, size: { rows: 8, columns: 8 }, isFilled });
      expect(moved.active).toEqual(at(to).active);
    }
  });

  it("extends to the data edge with Shift", () => {
    const moved = grid.moveActive(cell(1, 1), "down", { size, jump: true, extend: true, isFilled: (r) => r >= 1 && r <= 4 });
    expect(moved.ranges).toEqual([range(1, 1, 4, 1)]);
    expect(moved.anchor).toEqual({ row: 1, col: 1 });
    expect(grid.moveActive(moved, "up", { size, extend: true }).ranges).toEqual([range(1, 1, 3, 1)]);
  });

  it("moves within a multi-cell selection after Enter and Tab, wrapping", () => {
    const start = selection(1, 1, 2, 2);
    for (const [direction, path] of [
      ["down", [[2, 1], [1, 2], [2, 2], [1, 1]]],
      ["right", [[1, 2], [2, 1], [2, 2], [1, 1]]],
      ["up", [[2, 2], [1, 2], [2, 1], [1, 1]]],
      ["left", [[2, 2], [2, 1], [1, 2], [1, 1]]],
    ]) {
      let next = start;
      for (const [row, col] of path) {
        next = grid.nextInSelection(next, direction);
        expect(next.active).toEqual({ row, col });
        expect(next.ranges).toEqual(start.ranges);
      }
    }
  });

  it("writes cell, range, row, and column addresses", () => {
    for (const [sel, address] of [
      [cell(2, 1), "B3"], [cell(0, 0), "A1"], [selection(1, 1, 4, 3), "B2:D5"],
      [selection(3, 0, 3, 4, "rows"), "Row 4"], [selection(1, 0, 3, 4, "rows"), "3 rows"],
      [selection(0, 2, 5, 2, "columns"), "Column C"], [selection(0, 1, 5, 2, "columns"), "2 columns"],
      [selection(1, 26), "AA2"],
    ]) expect(grid.addressOf(sel)).toBe(address);
    expect(grid.addressOf({ ...cell(4, 3), ranges: [range(1, 0), range(4, 3)] })).toBe("D5");
  });

  it("counts, sums, and averages data cells only", () => {
    const table = gridTable();
    table.columns[1].locale = "eu";
    table.rows = [["North", "1,5", ""], ["South", "2,5", "n/a"]];
    const sel = selection(0, 0, 2, 1);
    // An overlapping range must not double count cells.
    sel.ranges.push(range(1, 1, 2, 1));
    expect(grid.selectionStats(table, sel)).toMatchObject({ count: 4, numericCount: 2, sum: 4, average: 2, min: 1.5, max: 2.5 });
    expect(grid.selectionStats(table, selection(0, 0, 0, 2))).toMatchObject({ count: 0, numericCount: 0 });
  });

  it("queries disjoint ranges without including gaps or duplicate cells", () => {
    const sel = { ...selection(1, 1, 2, 2), ranges: [range(1, 1, 2, 2), range(2, 2, 3, 3)] };
    expect(grid.contains(sel, 1, 3)).toBe(false);
    expect(grid.contains(sel, 2, 2)).toBe(true);
    expect(grid.bounds(sel)).toEqual(range(1, 1, 3, 3));
    expect(grid.selectedRows(sel, size)).toEqual([1, 2, 3]);
    expect(grid.selectedColumns(sel, size)).toEqual([1, 2, 3]);
    expect(Array.from(grid.cellsOf(sel, size))).toHaveLength(7);
  });
});
