/**
 * Tests for lib/tabular/tableChecker.js — per-cell grading for the input
 * table editor's colored feedback.
 */

import { describe, expect, it } from "vitest";

import { CELL_GRADES, gradeSummary, gradeTable, GRADE_CLASSNAMES } from "@/lib/tabular/tableChecker";

const mixedTable = {
  columns: [
    { name: "County", type: "text" },
    { name: "Population", type: "number" },
  ],
  rows: [
    ["Fresno", "100"],
    ["Kern", "not a number"],
    ["Alpine", ""],
  ],
  issues: [],
};

describe("gradeTable", () => {
  it("grades the header row as HEADING, one column per header", () => {
    const grades = gradeTable(mixedTable);
    expect(grades[0]).toEqual([CELL_GRADES.HEADING, CELL_GRADES.HEADING]);
  });

  it("grades a blank header name as EMPTY", () => {
    const table = {
      ...mixedTable,
      columns: [{ name: "", type: "text" }, mixedTable.columns[1]],
    };
    expect(gradeTable(table)[0][0]).toBe(CELL_GRADES.EMPTY);
  });

  it("grades a well-formed number cell NUMBER, a text cell TEXT", () => {
    const grades = gradeTable(mixedTable);
    expect(grades[1]).toEqual([CELL_GRADES.TEXT, CELL_GRADES.NUMBER]); // Fresno, 100
  });

  it("grades a coercion failure MALFORMED (red)", () => {
    const grades = gradeTable(mixedTable);
    expect(grades[2][1]).toBe(CELL_GRADES.MALFORMED); // "not a number"
  });

  it("grades a blank data cell EMPTY (gray)", () => {
    const grades = gradeTable(mixedTable);
    expect(grades[3][1]).toBe(CELL_GRADES.EMPTY); // Alpine's blank Population
  });

  it("grades a successfully-parsed date-typed cell as NUMBER (no separate date color)", () => {
    const table = {
      columns: [{ name: "Period", type: "date" }],
      rows: [["2020-01"]],
      issues: [],
    };
    expect(gradeTable(table)[1][0]).toBe(CELL_GRADES.NUMBER);
  });

  it("grades group cells exactly like text, including numeric-looking labels", () => {
    const table = {
      columns: [{ name: "Section", type: "group" }],
      rows: [["Education"], ["123"]],
      issues: [],
    };
    expect(gradeTable(table).slice(1)).toEqual([
      [CELL_GRADES.TEXT],
      [CELL_GRADES.TEXT],
    ]);
  });

  it("forces MALFORMED for a (row, column) pair listed in table.issues", () => {
    const table = {
      columns: [{ name: "Formula", type: "text" }],
      rows: [["ok"], ["ok"]],
      issues: [{ row: 1, column: 0, code: "FORMULA_ROW_FAILED", message: "failed" }],
    };
    const grades = gradeTable(table);
    expect(grades[1][0]).toBe(CELL_GRADES.TEXT);
    expect(grades[2][0]).toBe(CELL_GRADES.MALFORMED);
  });

  it("handles an empty table without throwing", () => {
    expect(gradeTable({ columns: [], rows: [], issues: [] })).toEqual([[]]);
  });
});

describe("gradeSummary", () => {
  it("counts each grade across the whole matrix", () => {
    const grades = gradeTable(mixedTable);
    const summary = gradeSummary(grades);
    expect(summary[CELL_GRADES.HEADING]).toBe(2);
    expect(summary[CELL_GRADES.TEXT]).toBe(3); // Fresno, Kern, Alpine
    expect(summary[CELL_GRADES.NUMBER]).toBe(1); // 100
    expect(summary[CELL_GRADES.MALFORMED]).toBe(1); // "not a number"
    expect(summary[CELL_GRADES.EMPTY]).toBe(1); // Alpine's blank Population
  });
});

describe("GRADE_CLASSNAMES", () => {
  it("declares a class for every grade", () => {
    for (const grade of Object.values(CELL_GRADES)) {
      expect(GRADE_CLASSNAMES[grade]).toBeTruthy();
    }
  });
});
